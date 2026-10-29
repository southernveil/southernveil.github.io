/**
 * server.js — Phase 3b-1 サーバー管理
 * ゲームの状態（SS・キャラ・解放・アクセサリー・編成・ルール）の正本はサーバー（Supabase Edge Function `game`）。
 * ブラウザは「サーバーの状態の読み取り専用コピー（ミラー）」を表示し、操作はサーバーへ依頼する。
 * オフライン時は閲覧のみ。GAMBIT_CLOUD.mode = 'backup' なら従来の 3a（ブラウザ主・クラウドはバックアップ）で動く。
 */
const SERVER_CACHE_KEY = 'gambit_server_cache_v1';
const SERVER_TIMEOUT_MS = 20000;

const serverState = {
    phase: 'init',      // init | loading | ready | viewonly | blocked | loggedout
    rev: 0, isDev: false, userId: null,
    chain: Promise.resolve(), busy: 0, busyTimer: null,
    rulePending: {}, ruleTimers: {},
    expReadyLocal: 0,   // 出撃のクールタイムが明ける時刻（この端末の時計に換算）
    meta: {}            // サーバー側の付帯情報（広告ボーナスのゲージ・冒険者名など）
};
/** 応答から出撃のクールタイムを読み取る（サーバーの時計とのずれは serverNow で補正） */
function serverNoteCooldown(res) {
    if (!res) return;
    let readyIn = null;
    if (typeof res.readyInMs === 'number') readyIn = res.readyInMs;
    else if (res.state && res.state.server && typeof res.serverNow === 'number') {
        const at = Number(res.state.server.expReadyAt) || 0;
        readyIn = at > res.serverNow ? at - res.serverNow : 0;
    }
    if (readyIn == null) return;
    serverState.expReadyLocal = readyIn > 0 ? Date.now() + readyIn : 0;
    if (typeof expCooldownChanged === 'function') expCooldownChanged();
}
const SERVER_OFFLINE_MSG = 'サーバーに接続できていないため、いまは閲覧のみです。接続が戻ってから操作してください。';

/* ================= 画面部品（オーバーレイ） ================= */
function serverEnsureStyle() {
    if (document.getElementById('server-style')) return;
    const st = document.createElement('style');
    st.id = 'server-style';
    st.textContent = `
    .server-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:2000;padding:12px;}
    .server-box{background:#f6f1e4;color:#1d1b17;border:1px solid #8a826f;border-radius:10px;padding:16px;max-width:560px;width:100%;max-height:90vh;overflow:auto;}
    .server-box .btn{margin:4px 4px 0 0;}
    .server-sides{display:flex;gap:10px;flex-wrap:wrap;} .server-side{flex:1;min-width:200px;border:1px solid #8a826f;border-radius:8px;padding:8px;}
    .server-busy{position:fixed;inset:0;z-index:1500;display:none;cursor:progress;background:rgba(0,0,0,.12);}
    .server-busy span{position:fixed;right:12px;bottom:12px;background:#e2dac6;color:#1d1b17;padding:4px 10px;border-radius:12px;font-size:12px;}`;
    document.head.appendChild(st);
}
function serverShowOverlay(html) {
    serverEnsureStyle();
    let el = document.getElementById('server-overlay');
    if (!el) { el = document.createElement('div'); el.id = 'server-overlay'; el.className = 'server-overlay'; document.body.appendChild(el); }
    el.innerHTML = '<div class="server-box">' + html + '</div>';
    el.style.display = 'flex';
}
function serverHideOverlay() {
    const el = document.getElementById('server-overlay');
    if (el) el.style.display = 'none';
}
function serverSetBusy(on) {
    serverEnsureStyle();
    serverState.busy += on ? 1 : -1;
    if (serverState.busy < 0) serverState.busy = 0;
    let el = document.getElementById('server-busy');
    if (!el) { el = document.createElement('div'); el.id = 'server-busy'; el.className = 'server-busy'; el.innerHTML = '<span>通信中…</span>'; document.body.appendChild(el); }
    if (serverState.busy > 0) {
        if (!serverState.busyTimer) serverState.busyTimer = setTimeout(() => { el.style.display = serverState.busy > 0 ? 'block' : 'none'; }, 150);
    } else {
        if (serverState.busyTimer) { clearTimeout(serverState.busyTimer); serverState.busyTimer = null; }
        el.style.display = 'none';
    }
}
function serverEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ================= キャッシュ・ミラー ================= */
function serverReadCache() {
    try {
        const c = JSON.parse(localStorage.getItem(SERVER_CACHE_KEY) || 'null');
        return (c && c.state && Array.isArray(c.state.yardChars)) ? c : null;
    } catch (e) { return null; }
}
function serverWriteCache(rev, state) {
    try { localStorage.setItem(SERVER_CACHE_KEY, JSON.stringify({ userId: serverState.userId, rev: rev, savedAt: Date.now(), state: state })); } catch (e) { /* ignore */ }
}
/** サーバー状態をメモリへ反映。敵（開発用の手元編集）だけは手元のまま残す */
function serverLoadMirror(stateObj) {
    const enemies = enemyChars;
    const eRules = {};
    enemies.forEach(e => { eRules[e.id] = ruleData[e.id]; });
    const keepChar = (typeof currentChar !== 'undefined') ? currentChar : null;
    if (!applySavedData(stateObj)) return false;
    enemyChars = enemies;
    enemies.forEach(e => { ruleData[e.id] = eRules[e.id] || emptyRules(); });
    syncMeta();
    if (keepChar && (yardChars.some(c => c.id === keepChar) || enemyChars.some(c => c.id === keepChar))) currentChar = keepChar;
    return true;
}
function serverAfterApply() {
    if (typeof renderAll === 'function') {
        renderAll();
        if (typeof showScreen === 'function' && typeof currentScreen !== 'undefined') showScreen(currentScreen);
    }
    if (typeof refreshDetailPage === 'function') refreshDetailPage();
}
/** 演出（js/fx.js）を出す操作。反映の前後で状態を比べて、何が起きたかを判断する */
const SERVER_FX_OPS = { level_up: 1, recruit_join: 1, retire: 1, extract: 1, unlock: 1, accessory_upgrade: 1, ad_claim: 1, ad_shop: 1, run_expedition: 1 };
function serverApplyResponse(res, opts) {
    serverState.rev = res.rev;
    serverState.isDev = !!res.isDev;
    serverWriteCache(res.rev, res.state);
    serverNoteCooldown(res);
    serverState.meta = (res.state && res.state.server && typeof res.state.server === 'object') ? res.state.server : {};
    if (opts && opts.keepLocal) return;
    const op = opts && opts.__op;
    const before = (op && SERVER_FX_OPS[op] && !res.duplicate && typeof fxSnapshot === 'function') ? fxSnapshot() : null;
    serverLoadMirror(res.state);
    serverAfterApply();
    if (before) {
        try { fxAfterOp(op, opts.__params, res, before, fxSnapshot()); } catch (e) { console.warn('fx', e); }
    }
}
function serverSimBegin() { return { state: serializeState() }; }
function serverSimEnd(snap) { serverLoadMirror(snap.state); serverAfterApply(); }

/* ================= 通信 ================= */
function serverGetClient() {
    if (typeof cloudState !== 'undefined' && cloudState.client) return cloudState.client;
    if (!window.GAMBIT_CLOUD || !window.supabase) return null;
    if (!serverGetClient._c) {
        const c = window.GAMBIT_CLOUD;
        serverGetClient._c = window.supabase.createClient(c.url, c.key, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'gambit_sb_auth' }
        });
    }
    return serverGetClient._c;
}
async function serverToken() {
    const cl = serverGetClient();
    if (!cl) return null;
    const got = await cl.auth.getSession();
    const s = got && got.data ? got.data.session : null;
    return s ? s.access_token : null;
}
function serverOpId() {
    try { return crypto.randomUUID(); } catch (e) { return 'o-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}
function serverGate() {
    if (serverState.phase === 'ready') return true;
    alert(serverState.phase === 'loading' || serverState.phase === 'init' ? 'サーバーに接続中です。少し待ってください。' : SERVER_OFFLINE_MSG);
    return false;
}

/** 1回の呼び出し（直列化される）。戻り値: { ok, ... } または { ok:false, code, message } */
function serverCall(op, params, opts) {
    opts = opts || {};
    if (!opts.force && serverState.phase !== 'ready') {
        return Promise.resolve({ ok: false, code: 'offline', message: serverState.phase === 'loading' ? 'サーバーに接続中です。少し待ってください。' : SERVER_OFFLINE_MSG });
    }
    const run = () => serverCallInner(op, params, opts);
    const p = serverState.chain.then(run, run);
    serverState.chain = p.catch(() => {});
    return p;
}

async function serverCallInner(op, params, opts) {
    if (op !== 'save_rules') await serverFlushRulesInner();
    serverSetBusy(true);
    try {
        const opId = opts.opId || serverOpId();
        const body = JSON.stringify({ op: op, params: Object.assign({}, params || {}, { opId: opId }) });
        const c = window.GAMBIT_CLOUD;
        let res = null;
        for (let attempt = 0; attempt < 2 && !res; attempt++) {
            try {
                const token = await serverToken();
                if (!token) return { ok: false, code: 'auth', message: 'ログインが必要です（右上の ☁ から開始してください）' };
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), SERVER_TIMEOUT_MS);
                try {
                    const r = await fetch(c.url + '/functions/v1/' + (c.functionName || 'game'), {
                        method: 'POST', signal: ctrl.signal,
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': c.key },
                        body: body
                    });
                    const txt = await r.text();
                    try { res = JSON.parse(txt); } catch (pe) { serverState.lastError = 'HTTP ' + r.status + ' ' + txt.slice(0, 300); }
                } finally { clearTimeout(t); }
            } catch (e) {
                serverState.lastError = String(e && e.message || e);
                if (attempt === 0) await new Promise(r => setTimeout(r, 800));
            }
        }
        if (!res) {
            serverGoViewOnly('サーバーに接続できません');
            return { ok: false, code: 'network', message: 'サーバーに接続できませんでした。操作が反映されたかは、再接続後の表示で確認してください。' };
        }
        if (res.ok) {
            if (!res.empty && !res.chat && !res.pvp) serverApplyResponse(res, Object.assign({}, opts, { __op: op, __params: params }));
            return res;
        }
        if (res.code === 'cooldown') serverNoteCooldown(res);
        if (res.code === 'auth') { serverState.phase = 'loggedout'; if (typeof cloudSetStatus === 'function') cloudSetStatus('loggedout', res.message); }
        if (res.code === 'conflict' && !opts.force) { await serverRefetchInner(); }
        return res;
    } finally {
        serverSetBusy(false);
    }
}
async function serverRefetchInner() {
    try {
        const token = await serverToken();
        if (!token) return;
        const c = window.GAMBIT_CLOUD;
        const r = await fetch(c.url + '/functions/v1/' + (c.functionName || 'game'), {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': c.key },
            body: JSON.stringify({ op: 'get_state', params: {} })
        });
        const res = await r.json();
        if (res && res.ok && !res.empty) serverApplyResponse(res);
    } catch (e) { /* ignore */ }
}
async function serverRefresh() {
    const r = await serverCall('get_state', {}, { force: true });
    if (r && r.ok && !r.empty) { serverState.phase = 'ready'; serverHideOverlay(); if (typeof cloudSetStatus === 'function') cloudSetStatus('synced'); }
    else if (!r.ok && r.code !== 'network') alert(r.message || '更新に失敗しました');
    return r;
}

/* ================= 状態の遷移 ================= */
function serverGoViewOnly(detail) {
    const cache = serverReadCache();
    if (cache) {
        serverLoadMirror(cache.state);
        serverState.phase = 'viewonly';
        serverHideOverlay();
        serverAfterApply();
    } else {
        serverState.phase = 'blocked';
        serverShowOverlay(`<h3 style="margin:0 0 8px;">サーバーに接続できません</h3>
            <p class="meta">この端末にはまだサーバーのデータがありません。接続できると表示されます。</p>
            <p class="meta" style="word-break:break-all;color:#b3261e;">原因: ${serverEsc(serverState.lastError || '不明')}</p>
            <button type="button" class="btn btn-blue" onclick="serverRetry()">再接続</button>`);
    }
    if (typeof cloudSetStatus === 'function') cloudSetStatus('offline', (detail || '') + '（閲覧のみ）');
}
function serverOffline(detail) { serverGoViewOnly(detail); }
async function serverRetry() {
    if (typeof cloudInit === 'function') { cloudState.retryIdx = 0; await cloudInit(); }
}
function serverOnAuth(ev, session) {
    if (!serverMode()) return;
    if (session && session.user && serverState.userId && session.user.id !== serverState.userId
        && serverState.phase !== 'loading' && serverState.phase !== 'init') {
        setTimeout(() => { if (typeof serverStartup === 'function') serverStartup(); }, 0);
    }
}

/** cloudInit（ログイン確立後）から呼ばれる */
async function serverStartup() {
    serverState.userId = cloudState.user.id;
    serverState.phase = 'loading';
    if (typeof cloudSetStatus === 'function') cloudSetStatus('syncing');
    serverShowOverlay('<p>サーバーに接続中…</p>');
    const res = await serverCall('get_state', {}, { force: true });
    if (!res.ok) {
        if (res.code === 'network') return;          // serverCallInner が閲覧のみへ移行済み
        serverShowOverlay(`<h3>サーバーからデータを取得できません</h3><p class="meta">${serverEsc(res.message)}</p>
            <button type="button" class="btn btn-blue" onclick="serverRetry()">再接続</button>`);
        serverState.phase = 'blocked';
        return;
    }
    if (res.empty) { await serverHandleEmpty(); return; }
    serverState.phase = 'ready';
    serverHideOverlay();
    if (typeof cloudSetStatus === 'function') cloudSetStatus('synced');
    serverRefreshPools();
    serverReadyUi();
}
/** 接続できたあとの案内：冒険者名が未設定なら先に登録（はじめての案内カードは登録のあと） */
function serverReadyUi() {
    if (typeof chatCheckUnread === 'function') chatCheckUnread();
    const asking = (typeof pnameEnsure === 'function') && pnameEnsure();
    // P9.22.0 遊び方の案内カードは出さない（ギルドの依頼と、必要なときの一言で案内する）。見ていない場面があれば出す
    if (!asking && typeof storyCheck === 'function') setTimeout(storyCheck, 1200);
}

async function serverHandleEmpty() {
    const r = await serverCall('new_game', {}, { force: true });
    if (r.ok) { serverState.phase = 'ready'; serverHideOverlay(); if (typeof cloudSetStatus === 'function') cloudSetStatus('synced'); serverRefreshPools(); serverReadyUi(); }
    else serverShowOverlay(`<p>${serverEsc(r.message)}</p><button type="button" class="btn btn-blue" onclick="serverRetry()">再接続</button>`);
}

/* ================= 共有の失敗プール（全プレイヤー共通。サーバーのDBにある）================= */
const serverPools = {};
async function serverRefreshPools() {
    try {
        const token = await serverToken();
        if (!token) return;
        const c = window.GAMBIT_CLOUD;
        const r = await fetch(c.url + '/functions/v1/' + (c.functionName || 'game'), {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': c.key },
            body: JSON.stringify({ op: 'get_pools', params: {} })
        });
        const res = await r.json();
        if (res && res.ok && res.pools) {
            Object.keys(serverPools).forEach(k => { delete serverPools[k]; });
            Object.keys(res.pools).forEach(k => { serverPools[k] = res.pools[k] | 0; });
            if (typeof renderExpInfo === 'function' && document.getElementById('exp-dungeon')) renderExpInfo();
        }
    } catch (e) { /* 表示用なので失敗しても無視 */ }
}

/* ================= 遠征の実行（サーバーが戦闘を実行して結果を返す） ================= */
/** 出撃ログのテキスト版（エクスポート・Discord添付用）。サーバーは送らないので手元で組み立てる */
function serverRunText(run) {
    const out = [];
    let bi = 0;
    (run.lines || []).forEach(l => {
        out.push(l.t);
        if (l.cls === 'battle') {
            const b = run.battles[bi++];
            if (b) { out.push(`--- 第${b.index}戦 戦闘ログ（${b.rounds}R / ${b.reason}） ---`); out.push(formatStructuredMd(b.structured)); }
        }
    });
    return out.join('\n');
}
async function serverExecExpedition(count) {
    const o = expOpts();
    const res = await serverCall('run_expedition', { dungeonId: o.dungeonId, stageId: o.stageId, mode: o.mode, protocol: o.protocol, count: count });
    if (!res.ok) {
        if (res.code === 'cooldown' && typeof fxToast === 'function') fxToast('<b>' + serverEsc(res.message) + '</b><span>出撃1回につき30秒（10連は5分）の待ち時間があります</span>', { tone: 'ink', key: 'ct' });
        else alert(res.message || '遠征を実行できませんでした');
        return null;
    }
    if (!res.result || !Array.isArray(res.result.runs) || !res.result.runs.length) {
        alert('遠征は実行済みですが、結果の詳細を受け取れませんでした。所持SSや寿命は最新の状態に更新しました。');
        serverAfterApply();
        if (typeof fxReleaseDeferred === 'function') fxReleaseDeferred();
        return null;
    }
    if (res.result.pool && res.result.pool.key) serverPools[res.result.pool.key] = res.result.pool.amount | 0;
    res.result.runs.forEach(r => { r.text = serverRunText(r); r.statusLabel = r.statusLabel || ''; });
    serverState.lastGauge = res.result.adGauge || null;
    return res.result;
}
function serverBuildBatch(result) {
    const batch = {
        ok: true, count: result.count, completed: result.runs.length, stopped: !!result.stopReason, stopReason: result.stopReason || '',
        dungeonId: result.runs[0].dungeonId, stageId: result.runs[0].stageId, mode: result.runs[0].mode, applyResources: true,
        runs: result.runs, counts: emptyStatusCount(), loot: 0, depositLost: 0,
        adClaimed: false, adBonus: 0, notify: { sent: 0, failed: 0, skippedWipe: 0, errors: [] }, startedAt: Date.now()
    };
    result.runs.forEach(r => {
        batch.counts[r.status] = (batch.counts[r.status] || 0) + 1;
        batch.loot += r.loot;
        if (r.corpse) batch.depositLost += r.corpse.depositLost;
    });
    batch.finishedAt = Date.now();
    batch.summaryText = buildBatchSummaryText(batch);
    batch.text = buildBatchLogText(batch);
    return batch;
}
async function serverNotifyBatch(batch) {
    const settings = loadDiscordSettings();
    if (!isValidDiscordWebhookUrl(settings.url)) return;
    let wipeAlerts = 0;
    for (const run of batch.runs) {
        if (run.status !== 'wiped' || !settings.notifyWipe) continue;
        if (wipeAlerts >= BATCH_WIPE_ALERT_MAX) { batch.notify.skippedWipe++; continue; }
        wipeAlerts++;
        tallyNotify(batch, await notifyWipe(run, batch, settings, null, run.index, batch.count));
    }
    if (settings.notifyBatch) tallyNotify(batch, await notifyBatchDone(batch, settings, null));
}
/** 入手物は演出（fx.js）がログ再生後に知らせる。演出が無い環境だけ従来どおり alert */
function serverShowDrops(runs) {
    if (typeof fxReleaseDeferred === 'function') return;
    const got = [];
    runs.forEach(r => (r.drops || []).forEach(d => got.push(d)));
    if (got.length) alert('【踏破報酬】アクセサリー等を入手しました\n' + got.join('\n'));
}

/* ================= 画面操作の付け替え（サーバー版） ================= */
async function serverAct(op, params) {
    const r = await serverCall(op, params);
    if (!r.ok) alert(r.message || '失敗しました');
    return r;
}

/** ルール編集：手元で即反映し、少し待ってからまとめて送る（応答では画面を書き換えない） */
function serverQueueRuleSave(charId) {
    serverState.rulePending[charId] = true;
    if (serverState.ruleTimers[charId]) clearTimeout(serverState.ruleTimers[charId]);
    serverState.ruleTimers[charId] = setTimeout(() => {
        delete serverState.ruleTimers[charId];
        serverCall('save_rules', { charId: charId, rules: ruleData[charId] }, { keepLocal: true }).then(r => {
            if (!r.ok) { alert('ルールを保存できませんでした: ' + r.message); serverRefresh(); }
        });
    }, 700);
}
async function serverFlushRulesInner() {
    const ids = Object.keys(serverState.rulePending);
    for (const id of ids) {
        if (serverState.ruleTimers[id]) { clearTimeout(serverState.ruleTimers[id]); delete serverState.ruleTimers[id]; }
        delete serverState.rulePending[id];
        if (!ruleData[id] || !yardChars.some(c => c.id === id)) continue;
        await serverCallInner('save_rules', { charId: id, rules: ruleData[id] }, { keepLocal: true });
    }
}

function serverInstallOverrides() {
    const has = n => typeof window[n] === 'function';

    if (has('onLevelUpSsClick')) window.onLevelUpSsClick = async function (charId) {
        await serverAct('level_up', { charId: charId });
    };
    if (has('onDetailLevelUp')) window.onDetailLevelUp = async function (charId) {
        await serverAct('level_up', { charId: charId });
    };
    if (has('onDetailRetire')) window.onDetailRetire = async function (charId) {
        const ch = yardChars.find(c => c.id === charId);
        if (!ch) return;
        const p = previewExtract(ch);
        const rng = ch.level < 2 ? '0 SS（Lv1 は抜き出せません）' : (p.min + '〜' + p.max + ' SS');
        if (!confirm(`${ch.name}（Lv${ch.level || 1}）を引退させますか？\n\n・取り消しできません。パーティから外れ、出撃できなくなります\n・成長に使ったSS ${p.held} は、引退後に「抜き出す」と ${rng} を受け取り、キャラは完全に消えます\n・装備中のアクセサリーは外れて所持品に戻ります`)) return;
        const r = await serverAct('retire', { charId: charId });
        if (r.ok) location.href = 'index.html';
    };
    if (has('onRetireClick')) window.onRetireClick = async function (charId) {
        const ch = yardChars.find(c => c.id === charId);
        if (!ch) return;
        const p = previewExtract(ch);
        const rng = ch.level < 2 ? '0 SS（Lv1 は抜き出せません）' : (p.min + '〜' + p.max + ' SS');
        if (!confirm(`${ch.name}（Lv${ch.level || 1}）を引退させますか？\n\n・取り消しできません。パーティから外れ、出撃できなくなります\n・成長に使ったSS ${p.held} は、引退後に「抜き出す」と ${rng} を受け取り、キャラは完全に消えます\n・装備中のアクセサリーは外れて所持品に戻ります`)) return;
        const r = await serverAct('retire', { charId: charId });
        if (r.ok && typeof yardDetailId !== 'undefined' && yardDetailId === charId) { yardDetailId = null; serverAfterApply(); }
    };
    if (has('onExtractClick')) window.onExtractClick = async function (charId) {
        const ch = retiredChars.find(c => c.id === charId);
        if (!ch) return;
        const p = previewExtract(ch);
        const rng = (ch.level || 1) < 2 ? '0 SS' : (p.min + '〜' + p.max + ' SS');
        if (!confirm(`${ch.name} から SS を抜き出しますか？\n見込み: ${rng}（成長に使ったSS ${p.held} × ${p.mult.toFixed(2)} + 1D10。出撃係数 ${p.expFactor.toFixed(2)}）\n\nキャラはヤードから完全に削除され、元に戻せません。`)) return;
        await serverAct('extract', { charId: charId });
    };
    if (has('recruitDraw')) window.recruitDraw = async function (kind) {
        if (kind === 'paid' && recruitPools.paid && !confirm('未選択の候補があります。破棄して新しく募集しますか？\n（リソースは再度消費されます）')) return false;
        const r = await serverAct('recruit_draw', { kind: kind });
        return !!r.ok;
    };
    if (has('recruitJoinClick')) window.recruitJoinClick = async function (kind, idx) {
        const pool = recruitPools[kind];
        if (!pool || !pool[idx]) return;
        const c = pool[idx];
        if (!confirm(`【${RARITY_DEFS[c.rarity].name}】${CLASS_DEFS[c.classId].name} を加入させますか？\n（他の候補は破棄されます）`)) return;
        const r = await serverAct('recruit_join', { kind: kind, index: idx });
        if (r.ok) { yardDetailId = r.result.charId; serverAfterApply(); }
    };
    if (has('onPurchaseAccessory')) window.onPurchaseAccessory = async function (defId) {
        await serverAct('unlock', { kind: 'acc', id: defId });
    };
    if (has('onPurchaseCondition')) window.onPurchaseCondition = async function (name) {
        await serverAct('unlock', { kind: 'cond', id: name });
    };
    if (has('onPurchaseTarget')) window.onPurchaseTarget = async function (name) {
        await serverAct('unlock', { kind: 'tgt', id: name });
    };
    if (has('onUpgradeAccessory')) window.onUpgradeAccessory = async function (accId) {
        await serverAct('accessory_upgrade', { accId: accId });
    };
    if (has('onYardEquipAccessory')) window.onYardEquipAccessory = async function (charId) {
        const sel = document.getElementById('yard-equip-select');
        if (!sel || !sel.value) { alert('アクセサリーを選択してください'); return; }
        await serverAct('accessory_equip', { charId: charId, accId: sel.value });
    };
    if (has('onYardUnequipAccessory')) window.onYardUnequipAccessory = async function (charId) {
        await serverAct('accessory_equip', { charId: charId, accId: null });
    };
    if (has('onPickAccessory')) window.onPickAccessory = async function (charId, accId) {
        const r = await serverAct('accessory_equip', { charId: charId, accId: accId });
        if (r.ok && typeof closeAccessoryPicker === 'function') closeAccessoryPicker();
    };
    if (has('onUnequipAccessory')) window.onUnequipAccessory = async function (charId) {
        await serverAct('accessory_equip', { charId: charId, accId: null });
    };

    // --- 編成 ---
    window.addToParty = async function (charId) { await serverAct('set_party', { setIndex: activePartySetIndex, ids: partyIds.concat([charId]) }); };
    window.removeFromParty = async function (charId) { await serverAct('set_party', { setIndex: activePartySetIndex, ids: partyIds.filter(id => id !== charId) }); };
    window.movePartyUp = async function (charId) {
        const i = partyIds.indexOf(charId); if (i <= 0) return;
        const ids = partyIds.slice(); ids.splice(i - 1, 0, ids.splice(i, 1)[0]);
        await serverAct('set_party', { setIndex: activePartySetIndex, ids: ids });
    };
    window.movePartyDown = async function (charId) {
        const i = partyIds.indexOf(charId); if (i < 0 || i >= partyIds.length - 1) return;
        const ids = partyIds.slice(); ids.splice(i + 1, 0, ids.splice(i, 1)[0]);
        await serverAct('set_party', { setIndex: activePartySetIndex, ids: ids });
    };
    window.switchPartySet = async function (idx) { await serverAct('switch_party_set', { setIndex: idx }); };
    window.renamePartySet = async function (idx, name) { await serverAct('rename_party_set', { setIndex: idx, name: name }); };
    window.renameChar = async function (charId) {
        const ch = findCharById(charId);
        if (!ch) return;
        const next = prompt('新しい名前', ch.name);
        if (next == null) return;
        await serverAct('rename', { charId: charId, name: next });
    };

    // --- ルール（味方は手元で即反映→まとめて送信。敵は手元のみ） ---
    if (has('updateRule')) window.updateRule = function (i, k, v) {
        const ch = findCharForEditor(currentChar);
        if (!ch || !ruleData[ch.id]) return;
        ruleData[ch.id][i][k] = v;
        // 行を有効にしたとき、未解放の条件・対象・未習得のアクションが残っていたら使えるものに直す
        if (k === 'active' && v && typeof normalizeRuleRow === 'function') normalizeRuleRow(ch, ruleData[ch.id][i]);
        if (ch.isPlayer) {
            if (serverState.phase !== 'ready') { alert(SERVER_OFFLINE_MSG); serverLoadMirror((serverReadCache() || {}).state || serializeState()); renderEditor(); return; }
            serverQueueRuleSave(ch.id);
        }
        if (k === 'active') renderEditor();
    };

    // --- 開発用（サーバー側で is_dev を確認） ---
    window.setCharLevel = async function (charId, v) { await serverAct('dev_set_level', { charId: charId, level: v }); };
    window.resetCharToLv1 = async function (charId) {
        const ch = findCharById(charId);
        if (!ch || !confirm(ch.name + ' を Lv1 初期ステータスに戻しますか？\n（名前・ルールは残ります）')) return;
        await serverAct('dev_reset_level', { charId: charId });
    };
    window.addToYard = async function () {
        const sel = document.getElementById('add-yard-class');
        await serverAct('dev_add_char', { classId: sel ? sel.value : 'warrior' });
    };
    window.removeFromYard = async function (charId) { await serverAct('dev_remove_char', { charId: charId }); };
    window.devResetCooldown = async function () {
        const r = await serverAct('dev_reset_cooldown', {});
        if (r.ok && typeof fxToast === 'function') fxToast('<b>クールタイムを解除しました（開発用）</b><span>1回だけの解除です。次の本番の出撃からまた待ち時間が付きます</span>', { tone: 'ink', key: 'ct', ms: 4000 });
    };
    window.devAddSs = async function (amount) {
        const n = Math.floor(Number(amount) || 0); if (!n) return;
        await serverAct('dev_add_ss', { amount: n });
    };
    window.devSetSsFromInput = async function () {
        const el = document.getElementById('dev-ss-input'); if (!el) return;
        await serverAct('dev_set_ss', { amount: Math.max(0, Math.floor(Number(el.value) || 0)) });
    };

    // --- 保存系ボタン ---
    window.clearStorage = function () { alert('サーバー版では初期化できません。'); };
    window.importSaveJSON = function () { alert('サーバー版ではJSONの読込はできません。'); };

    // --- 広告ポイント（広告を見たあと、サーバーが1日の回数・間隔・上限を検証して付与）---
    window.claimAdPointFlow = async function () {
        let w;
        try { w = await adProvider(); } catch (e) { return { ok: false, error: '広告の再生に失敗しました' }; }
        if (!w || !w.watched) return { ok: false, error: (w && w.reason && typeof adsReasonText === 'function') ? adsReasonText(w.reason) : '広告の視聴が完了しませんでした' };
        const r = await serverCall('ad_claim', {});
        if (!r.ok) return { ok: false, error: r.message };
        return { ok: true, points: r.result.points, today: r.result.today, limit: r.result.limit, stub: !!w.stub };
    };
    // --- 出撃後の広告ボーナス（SS +20% か 祈りの欠片 +1）---
    window.serverAdBonus = async function (choice) {
        let w;
        try { w = await adProvider(); } catch (e) { return { ok: false, error: '広告の再生に失敗しました' }; }
        if (!w || !w.watched) return { ok: false, error: (w && w.reason && typeof adsReasonText === 'function') ? adsReasonText(w.reason) : '広告の視聴が完了しませんでした' };
        const r = await serverCall('ad_bonus', { choice: choice });
        if (!r.ok) return { ok: false, error: r.message };
        return Object.assign({ ok: true, stub: !!w.stub }, r.result);
    };
    window.onAdShopBuy = async function (kind) {
        const r = await serverAct('ad_shop', { kind: kind });
        if (r.ok) serverAfterApply();
    };

    // --- 共有プールの表示（手元の状態ではなくサーバーの値を見る）---
    window.getFailurePoolAmount = function (d, st) { return serverPools[d + ':' + st] | 0; };
    if (has('showScreen')) {
        const origShow = window.showScreen;
        window.showScreen = function (name) { const r = origShow.apply(this, arguments); if (name === 'expedition') serverRefreshPools(); return r; };
    }

    // --- 遠征：テスト実行（dry）は手元、通常はサーバーが実行 ---
    if (has('onExpRun')) {
        const orig = window.onExpRun;
        window.onExpRun = async function () {
            if (typeof batchRunning !== 'undefined' && batchRunning) return;
            if (!serverGate()) return;
            const dry = (typeof expDryChecked === 'function') ? expDryChecked() : !!(document.getElementById('exp-dry') && document.getElementById('exp-dry').checked);
            if (dry) {
                const snap = serverSimBegin();
                try { await orig(); } finally { serverSimEnd(snap); }
                return;
            }
            if (typeof expShowDeparting === 'function') expShowDeparting(1);
            if (typeof expCooldownRemaining === 'function' && expCooldownRemaining() > 0) { expUpdateRunButtons(); return; }
            const result = await serverExecExpedition(1);
            if (!result) { if (typeof expClearDeparting === 'function') expClearDeparting(); return; }
            const res = result.runs[0];
            lastExpResult = res; lastBatch = null; lastExpText = res.text;
            renderExpResult(res, { gate: result.adGauge || null });
            if (typeof renderAll === 'function') renderAll();
            renderExpInfo();
            serverShowDrops(result.runs);
            const r = await notifySingleRun(res);
            if (!r.skipped) setDiscordStatus(r.ok ? '全滅を Discord に通知しました' : ('Discord 通知に失敗: ' + r.error), r.ok);
        };
    }
    if (has('onExpRun10')) {
        const orig10 = window.onExpRun10;
        window.onExpRun10 = async function () {
            if (typeof batchRunning !== 'undefined' && batchRunning) return;
            if (!serverGate()) return;
            const dry = (typeof expDryChecked === 'function') ? expDryChecked() : !!(document.getElementById('exp-dry') && document.getElementById('exp-dry').checked);
            if (dry) {
                const snap = serverSimBegin();
                try { await orig10(); } finally { serverSimEnd(snap); }
                return;
            }
            if (typeof expShowDeparting === 'function') expShowDeparting(BATCH_COUNT);
            if (typeof expCooldownRemaining === 'function' && expCooldownRemaining() > 0) { expUpdateRunButtons(); return; }
            const result = await serverExecExpedition(BATCH_COUNT);
            if (!result) { if (typeof expClearDeparting === 'function') expClearDeparting(); return; }
            const batch = serverBuildBatch(result);
            lastBatch = batch; lastExpResult = null; lastExpText = batch.text;
            renderBatchResult(batch, { gate: result.adGauge || null });
            if (typeof renderAll === 'function') renderAll();
            renderExpInfo();
            serverShowDrops(result.runs);
            await serverNotifyBatch(batch);
            const n = batch.notify;
            if (n.sent || n.failed) setDiscordStatus(`Discord 通知: 成功${n.sent}件` + (n.failed ? ` / 失敗${n.failed}件（${n.errors[0]}）` : ''), n.failed === 0);
        };
    }
}

/* ================= 起動 ================= */
if (serverMode()) {
    serverInstallOverrides();
    if (typeof cloudState === 'undefined') {
        // キャラクター詳細ページ：キャッシュを表示し、操作は直接サーバーへ
        serverState.phase = 'ready';
        serverState.userId = (serverReadCache() || {}).userId || null;
    }
    window.addEventListener('online', () => {
        if (serverState.phase === 'viewonly' || serverState.phase === 'blocked') serverRetry();
    });
}
