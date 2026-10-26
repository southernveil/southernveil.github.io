/**
 * batch.js — 10連出撃 / 広告ボーナス(下地) / Discord Webhook 通知 (P8.7)
 * DOM に依存しない純ロジック。UI は batch-ui.js。
 *
 *  - runExpeditionBatch(): 出撃→戦闘→帰還判定のループ(runExpedition)を N 回、非同期で一括処理して配列で返す
 *  - claimAdPointFlow(): リワード広告視聴で広告ポイント(祈りの欠片)を受け取る。広告SDKは未接続のため adProvider 差し替え口だけ用意（既定はスタブ）
 *  - Discord: Embed(全滅=赤 16711680 / 生還=青 255) + ログファイルを multipart で送信
 */
const BATCH_COUNT = 10;
/** 1 回の 10 連で個別に飛ばす全滅通知の上限（Discord のレート制限対策。超過分はサマリーにのみ記載） */
const BATCH_WIPE_ALERT_MAX = 3;

const DISCORD_COLOR_WIPE = 16711680;   // 赤
const DISCORD_COLOR_RETURN = 255;      // 青
const DISCORD_SETTINGS_KEY = 'gambit_discord_settings_v1';   // セーブとは別キー（URLは秘密情報のためエクスポートJSONに含めない）
const DISCORD_FILE_MAX_BYTES = 7 * 1024 * 1024;

// ---------------------------------------------------------------- 10連出撃
function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function emptyStatusCount() { return { cleared: 0, retreated: 0, timeout: 0, wiped: 0 }; }

/**
 * @param opts runExpedition と同じ { dungeonId, stageId, mode, protocol, applyResources }
 * @param count 回数（既定 BATCH_COUNT）
 * @param extra { onProgress(i, count, run), discord:{settings,fetchImpl}, isCancelled() }
 * @returns Promise<{ok, runs[], count, completed, stopped, stopReason, counts, loot, text, ...}>
 */
async function runExpeditionBatch(opts, count, extra) {
    opts = opts || {};
    extra = extra || {};
    count = Math.max(1, count | 0) || BATCH_COUNT;
    const batch = {
        ok: true, count, completed: 0, stopped: false, stopReason: '',
        dungeonId: opts.dungeonId, stageId: opts.stageId, mode: opts.mode || 'normal',
        applyResources: opts.applyResources !== false,
        runs: [], counts: emptyStatusCount(), loot: 0, depositLost: 0,
        adClaimed: false, adBonus: 0, notify: { sent: 0, failed: 0, skippedWipe: 0, errors: [] },
        startedAt: Date.now(), text: '', summaryText: ''
    };
    const settings = extra.discord && extra.discord.settings ? extra.discord.settings : loadDiscordSettings();
    const fetchImpl = extra.discord && extra.discord.fetchImpl ? extra.discord.fetchImpl : null;
    const queue = createSendQueue();
    let wipeAlerts = 0;

    for (let i = 1; i <= count; i++) {
        if (extra.isCancelled && extra.isCancelled()) { batch.stopped = true; batch.stopReason = '中断されました'; break; }
        const run = runExpedition(opts);
        if (!run.ok) {
            batch.stopped = true;
            batch.stopReason = (i > 1 && /パーティが空/.test(run.error)) ? 'パーティ全員が引退したため、残りの遠征を中止しました' : run.error;
            if (i === 1) { batch.ok = false; batch.error = run.error; }
            break;
        }
        run.index = i;
        batch.runs.push(run);
        batch.completed = i;
        batch.counts[run.status] = (batch.counts[run.status] || 0) + 1;
        batch.loot += run.loot;
        if (run.corpse) batch.depositLost += run.corpse.depositLost;

        if (run.status === 'wiped' && settings.notifyWipe && isValidDiscordWebhookUrl(settings.url)) {
            if (wipeAlerts < BATCH_WIPE_ALERT_MAX) {
                wipeAlerts++;
                queue.add(() => notifyWipe(run, batch, settings, fetchImpl, i, count).then(r => tallyNotify(batch, r)));
            } else {
                batch.notify.skippedWipe++;
            }
        }
        if (extra.onProgress) { try { extra.onProgress(i, count, run); } catch (e) { /* UI側の例外で探索を止めない */ } }
        await yieldToUI();
    }

    batch.finishedAt = Date.now();
    batch.summaryText = buildBatchSummaryText(batch);
    batch.text = buildBatchLogText(batch);

    if (batch.runs.length && settings.notifyBatch && isValidDiscordWebhookUrl(settings.url)) {
        queue.add(() => notifyBatchDone(batch, settings, fetchImpl).then(r => tallyNotify(batch, r)));
    }
    await queue.drain();
    return batch;
}

function tallyNotify(batch, r) {
    if (r && r.ok) batch.notify.sent++;
    else { batch.notify.failed++; batch.notify.errors.push((r && r.error) || '不明なエラー'); }
}

/** 直列実行キュー（Discord への連続送信を1本ずつにする） */
function createSendQueue() {
    let chain = Promise.resolve();
    return {
        add(fn) { chain = chain.then(fn).catch(() => {}); return chain; },
        drain() { return chain; }
    };
}

function buildBatchSummaryText(b) {
    const c = b.counts;
    const dName = (getDungeon(b.dungeonId) || {}).name || b.dungeonId;
    const sName = (getStage(b.dungeonId, b.stageId) || {}).name || b.stageId;
    return `${dName} ${sName} / ${MODE_DEFS[b.mode] ? MODE_DEFS[b.mode].name : b.mode} / ${b.completed}/${b.count}回実施`
        + ` / 踏破${c.cleared} 撤退${c.retreated} 時間切れ${c.timeout} 全滅${c.wiped} / 獲得 ${b.loot} SS`
        + (b.adBonus ? ` (+広告ボーナス ${b.adBonus})` : '')
        + (b.stopReason ? ` / 停止: ${b.stopReason}` : '');
}

function buildBatchLogText(b) {
    const out = [`# ${buildBatchSummaryText(b)}`, ''];
    b.runs.forEach(r => {
        out.push(`===== 出撃 ${r.index}/${b.count}  ${r.statusLabel}  獲得 ${r.loot} SS =====`);
        out.push(r.text, '');
    });
    return out.join('\n');
}

// ---------------------------------------------------------------- 広告ボーナス（下地）
/**
 * 広告プロバイダ。将来 SDK を繋ぐときは setAdProvider(async () => ({ watched: true })) で差し替える。
 * 既定はスタブ（即「視聴済み」を返す。実際の広告は出ない）。
 */
let adProvider = function stubAdProvider() { return Promise.resolve({ watched: true, stub: true }); };
function setAdProvider(fn) { adProvider = (typeof fn === 'function') ? fn : adProvider; }

/** 広告を見て「祈りの欠片」を1つ受け取る。@returns {ok, points, today, limit, error} */
async function claimAdPointFlow() {
    let r;
    try { r = await adProvider(); } catch (e) { return { ok: false, error: '広告の再生に失敗しました' }; }
    if (!r || !r.watched) return { ok: false, error: '広告の視聴が完了しませんでした' };
    const c = claimAdPoint();
    if (!c.ok) return { ok: false, error: c.reason };
    return { ok: true, points: c.points, today: c.today, limit: c.limit, stub: !!r.stub };
}

// ---------------------------------------------------------------- Discord Webhook
function defaultDiscordSettings() { return { url: '', notifyBatch: true, notifyWipe: true }; }

function loadDiscordSettings() {
    const d = defaultDiscordSettings();
    try {
        const raw = localStorage.getItem(DISCORD_SETTINGS_KEY);
        if (!raw) return d;
        const o = JSON.parse(raw);
        return {
            url: typeof o.url === 'string' ? o.url : '',
            notifyBatch: o.notifyBatch !== false,
            notifyWipe: o.notifyWipe !== false
        };
    } catch (e) { return d; }
}

function saveDiscordSettings(s) {
    try { localStorage.setItem(DISCORD_SETTINGS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
}

function isValidDiscordWebhookUrl(u) {
    return typeof u === 'string'
        && /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?(?:\?.*)?$/.test(u.trim());
}

function clipText(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function timestampForFile(ms) {
    const d = new Date(ms || Date.now());
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 10連完了 Embed。1 回でも全滅があれば赤、なければ青 */
function buildBatchPayload(b) {
    const c = b.counts;
    const wiped = c.wiped > 0;
    const dName = (getDungeon(b.dungeonId) || {}).name || b.dungeonId;
    const sName = (getStage(b.dungeonId, b.stageId) || {}).name || b.stageId;
    const party = (b.runs[0] && b.runs[0].partyNames || []).join('、');
    const fields = [
        { name: 'ダンジョン', value: clipText(`${dName} ${sName}`, 1024), inline: true },
        { name: 'モード', value: clipText(MODE_DEFS[b.mode] ? MODE_DEFS[b.mode].name : b.mode, 1024), inline: true },
        { name: '実施', value: `${b.completed}/${b.count}回`, inline: true },
        { name: '結果内訳', value: `踏破 ${c.cleared} / 撤退 ${c.retreated} / 時間切れ ${c.timeout} / 全滅 ${c.wiped}`, inline: false },
        { name: '獲得 SS', value: String(b.loot) + (b.adBonus ? ` (+広告 ${b.adBonus})` : ''), inline: true }
    ];
    if (b.depositLost > 0) fields.push({ name: 'ロストした入場料', value: String(b.depositLost), inline: true });
    if (party) fields.push({ name: 'パーティ', value: clipText(party, 1024), inline: false });
    if (b.notify.skippedWipe > 0) fields.push({ name: '注記', value: `全滅通知の上限(${BATCH_WIPE_ALERT_MAX}件)を超えた ${b.notify.skippedWipe} 件は添付ログを参照`, inline: false });
    if (b.stopReason) fields.push({ name: '停止理由', value: clipText(b.stopReason, 1024), inline: false });
    return {
        username: 'サザン・ヴェイル 遠征報告',
        embeds: [{
            title: clipText(wiped ? '🔴 ' + b.count + '連出撃 完了（全滅あり）' : '🔵 ' + b.count + '連出撃 完了', 256),
            description: clipText(b.summaryText, 4096),
            color: wiped ? DISCORD_COLOR_WIPE : DISCORD_COLOR_RETURN,
            fields,
            footer: { text: 'Gambit ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') },
            timestamp: new Date(b.finishedAt || Date.now()).toISOString()
        }]
    };
}

/** 全滅 Embed（赤） */
function buildWipePayload(run, ctx) {
    const lastLines = run.lines.slice(-4).map(l => l.t).join('\n');
    const fields = [
        { name: 'ダンジョン', value: clipText(`${run.dungeonName} ${run.stageName}`, 1024), inline: true },
        { name: 'モード', value: clipText(MODE_DEFS[run.mode] ? MODE_DEFS[run.mode].name : run.mode, 1024), inline: true },
        { name: '全滅した戦闘', value: `第${run.battles.length}戦 / 予定${run.nBattlesPlanned}戦`, inline: true },
        { name: 'パーティ', value: clipText(run.partyNames.join('、'), 1024), inline: false }
    ];
    if (run.corpse) fields.push({ name: 'ロスト', value: `獲得 ${run.corpse.lootLost} SS ＋ 入場料 ${run.corpse.depositLost}`, inline: false });
    return {
        username: 'サザン・ヴェイル 遠征報告',
        embeds: [{
            title: clipText(ctx && ctx.count ? `🔴 全滅（出撃 ${ctx.index}/${ctx.count}回目）` : '🔴 全滅', 256),
            description: clipText(lastLines, 4096),
            color: DISCORD_COLOR_WIPE,
            fields,
            footer: { text: 'Gambit ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') },
            timestamp: new Date().toISOString()
        }]
    };
}

/** 単発出撃の結果 Embed（生還=青 / 全滅=赤）。単発では全滅時のみ自動通知する */
function buildSingleRunPayload(run) {
    if (run.status === 'wiped') return buildWipePayload(run, null);
    return {
        username: 'サザン・ヴェイル 遠征報告',
        embeds: [{
            title: clipText('🔵 ' + run.statusLabel, 256),
            description: clipText(run.lines.slice(-3).map(l => l.t).join('\n'), 4096),
            color: DISCORD_COLOR_RETURN,
            fields: [
                { name: 'ダンジョン', value: clipText(`${run.dungeonName} ${run.stageName}`, 1024), inline: true },
                { name: '獲得 SS', value: String(run.loot), inline: true }
            ],
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * multipart で送信: payload_json ＋ files[0](ログ .txt)
 * @returns Promise<{ok, status, error}>  例外は投げない
 */
async function sendDiscordWebhook(url, payload, logText, fileName, fetchImpl) {
    if (!isValidDiscordWebhookUrl(url)) return { ok: false, error: 'Webhook URL の形式が正しくありません' };
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return { ok: false, error: 'fetch が使えない環境です' };
    // 英語表示のときは、通知の文面と添付ログも英語にする
    if (typeof i18nDeep === 'function') { payload = i18nDeep(payload); if (logText) logText = i18nText(logText); }
    const build = () => {
        const fd = new FormData();
        fd.append('payload_json', JSON.stringify(payload));
        if (logText) {
            let text = String(logText);
            const bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(text).length : text.length * 3;
            if (bytes > DISCORD_FILE_MAX_BYTES) text = text.slice(0, Math.floor(DISCORD_FILE_MAX_BYTES / 4)) + '\n…（サイズ超過のため切り詰め）';
            fd.append('files[0]', new Blob([text], { type: 'text/plain' }), fileName || 'expedition_log.txt');
        }
        return fd;
    };
    const post = () => doFetch(url.trim(), { method: 'POST', body: build() });
    try {
        let res = await post();
        if (res && res.status === 429) {                 // レート制限: 1 回だけ待って再送
            let wait = 1500;
            try { const j = await res.json(); if (j && j.retry_after) wait = Math.min(10000, Math.ceil(j.retry_after * 1000)); } catch (e) { /* 既定値 */ }
            await new Promise(r => setTimeout(r, wait));
            res = await post();
        }
        if (res && (res.ok || res.status === 204)) return { ok: true, status: res.status };
        return { ok: false, status: res && res.status, error: 'Discord が拒否しました (HTTP ' + (res && res.status) + ')' };
    } catch (e) {
        return { ok: false, error: '送信に失敗しました: ' + (e && e.message ? e.message : e) };
    }
}

function notifyBatchDone(batch, settings, fetchImpl) {
    return sendDiscordWebhook(settings.url, buildBatchPayload(batch), batch.text,
        `expedition_batch_${timestampForFile(batch.startedAt)}.txt`, fetchImpl);
}

function notifyWipe(run, batch, settings, fetchImpl, index, count) {
    return sendDiscordWebhook(settings.url, buildWipePayload(run, { index, count }), run.text,
        `expedition_wipe_${timestampForFile(Date.now())}_${index}.txt`, fetchImpl);
}

/** 単発出撃用（全滅時のみ）。設定が無効/URL未設定なら何もしない */
async function notifySingleRun(run, opts) {
    opts = opts || {};
    const settings = opts.settings || loadDiscordSettings();
    if (!run || !run.ok || run.status !== 'wiped') return { ok: true, skipped: true };
    if (!settings.notifyWipe || !isValidDiscordWebhookUrl(settings.url)) return { ok: true, skipped: true };
    return sendDiscordWebhook(settings.url, buildSingleRunPayload(run), run.text,
        `expedition_wipe_${timestampForFile(Date.now())}.txt`, opts.fetchImpl || null);
}

/** 設定画面の「テスト送信」 */
function sendDiscordTest(url, fetchImpl) {
    const payload = {
        username: 'サザン・ヴェイル 遠征報告',
        embeds: [{ title: '🔵 テスト送信', description: 'Webhook の接続テストです。', color: DISCORD_COLOR_RETURN, timestamp: new Date().toISOString() }]
    };
    return sendDiscordWebhook(url, payload, 'webhook test\n', 'webhook_test.txt', fetchImpl);
}
