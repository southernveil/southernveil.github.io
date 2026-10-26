/**
 * batch-ui.js — 遠征画面: 10連出撃 / ログ描画速度 / 広告ボーナス / Discord設定 (P8.7)
 * ロジックは batch.js。ここは DOM 操作のみ。ui.js より後に読み込む（onExpRun などを置き換える）。
 */
const LOG_SPEEDS = {
    normal: { id: 'normal', label: '等倍', ms: 500 },
    skip:   { id: 'skip',   label: '一括表示', ms: 0 }
};
const LOG_SPEED_KEY = 'gambit_log_speed_v1';

let logSpeed = 'normal';
try { const v = localStorage.getItem(LOG_SPEED_KEY); if (LOG_SPEEDS[v]) logSpeed = v; } catch (e) { /* 保存なしでも動く */ }

let lastBatch = null;
let lastExpText = '';
let batchRunning = false;
let batchCancel = false;

// ---------------------------------------------------------------- ログ描画
const logPlayer = { items: [], idx: 0, timer: null, box: null, onDone: null };
const LOG_VIEW_KEY = 'gambit_log_view_v1';
let logView = 'story';   // story: 簡易表示（文章） / table: 詳細表示（表）
try { const v = localStorage.getItem(LOG_VIEW_KEY); if (v === 'story' || v === 'table') logView = v; } catch (e) { /* 無視 */ }

function stopLogPlayer() {
    if (logPlayer.timer) { clearTimeout(logPlayer.timer); logPlayer.timer = null; }
}

/** items: HTML 文字列の配列。skip なら一括、それ以外は間隔を空けて 1 件ずつ追記。最後まで出たら onDone */
function playLog(box, items, onDone) {
    stopLogPlayer();
    logPlayerFinish();   // 前のログの完了処理（演出など）が残っていれば先に済ませる
    logPlayer.box = box; logPlayer.items = items; logPlayer.idx = 0; logPlayer.onDone = onDone || null;
    box.innerHTML = '';
    if (LOG_SPEEDS[logSpeed].ms === 0) { flushLog(); return; }
    stepLog();
}

function logPlayerFinish() {
    const fn = logPlayer.onDone;
    logPlayer.onDone = null;
    if (fn) { try { fn(); } catch (e) { console.warn(e); } }
}

function flushLog() {
    stopLogPlayer();
    const p = logPlayer;
    if (!p.box) return;
    if (p.idx < p.items.length) p.box.insertAdjacentHTML('beforeend', p.items.slice(p.idx).join(''));
    p.idx = p.items.length;
    p.box.scrollTop = p.box.scrollHeight;
    updateLogProgress();
    logPlayerFinish();
}

function stepLog() {
    const p = logPlayer;
    if (!p.box || p.idx >= p.items.length) { stopLogPlayer(); updateLogProgress(); logPlayerFinish(); return; }
    p.box.insertAdjacentHTML('beforeend', p.items[p.idx++]);
    p.box.scrollTop = p.box.scrollHeight;
    updateLogProgress();
    if (p.idx < p.items.length) p.timer = setTimeout(stepLog, LOG_SPEEDS[logSpeed].ms);
    else logPlayerFinish();
}

function updateLogProgress() {
    const el = document.getElementById('exp-log-progress');
    const sk = document.getElementById('exp-skip');
    const p = logPlayer;
    const playing = p.items.length && p.idx < p.items.length;
    if (el) el.textContent = playing ? `描画中 ${p.idx}/${p.items.length}` : '';
    if (sk) sk.style.display = playing ? '' : 'none';
}

function setLogSpeed(id) {
    if (!LOG_SPEEDS[id]) return;
    logSpeed = id;
    try { localStorage.setItem(LOG_SPEED_KEY, id); } catch (e) { /* 無視 */ }
    renderLogSpeedToggle();
    if (logPlayer.items.length && logPlayer.idx < logPlayer.items.length) {
        if (id === 'skip') flushLog();
        else { stopLogPlayer(); logPlayer.timer = setTimeout(stepLog, LOG_SPEEDS[id].ms); }
    }
}

function renderLogSpeedToggle() {
    const box = document.getElementById('exp-speed');
    if (box) {
        box.innerHTML = Object.keys(LOG_SPEEDS).map(k => {
            const s = LOG_SPEEDS[k];
            const t = s.ms ? `${s.label}（${(s.ms / 1000).toFixed(1)}秒）` : s.label;
            return `<button type="button" class="speed-btn${k === logSpeed ? ' active' : ''}" data-speed="${k}" onclick="setLogSpeed('${k}')">${esc(t)}</button>`;
        }).join('');
    }
    const vb = document.getElementById('exp-view');
    if (vb) {
        vb.innerHTML = [['story', '簡易表示'], ['table', '詳細表示']].map(([k, label]) =>
            `<button type="button" class="speed-btn${k === logView ? ' active' : ''}" onclick="setLogView('${k}')">${label}</button>`).join('');
    }
}

/** ログの見せ方（簡易表示／詳細表示）。表示中のログも描き直す */
function setLogView(v) {
    if (v !== 'story' && v !== 'table') return;
    logView = v;
    try { localStorage.setItem(LOG_VIEW_KEY, v); } catch (e) { /* 無視 */ }
    renderLogSpeedToggle();
    const box = document.getElementById('exp-log');
    if (!box) return;
    const items = lastBatch ? batchLogItems(lastBatch) : (lastExpResult ? runLogItems(lastExpResult) : null);
    if (!items) return;
    const wasPlaying = logPlayer.items.length && logPlayer.idx < logPlayer.items.length;
    stopLogPlayer();
    logPlayer.items = items;
    box.innerHTML = '';
    if (wasPlaying) {   // 再生中ならその位置から続ける
        const upto = Math.min(logPlayer.idx, items.length);
        box.insertAdjacentHTML('beforeend', items.slice(0, upto).join(''));
        logPlayer.idx = upto;
        logPlayer.timer = setTimeout(stepLog, LOG_SPEEDS[logSpeed].ms || 0);
    } else {
        box.insertAdjacentHTML('beforeend', items.join(''));
        logPlayer.idx = items.length;
    }
    updateLogProgress();
}

/** 出撃タブと同じ構造化表 HTML */
function formatStructuredTableHtml(structured) {
    if (!structured || !structured.length) {
        return '<div class="meta">（構造化ログなし）</div>';
    }
    let h = '<div class="battle-log-table-wrap"><table class="battle-log-table"><thead><tr>'
        + '<th>Rnd</th><th>Turn</th><th>Actor</th><th>Target</th><th>Action</th>'
        + '<th>Dice</th><th>Dmg/Heal</th><th>Status</th><th>Trigger</th>'
        + '</tr></thead><tbody>';
    structured.forEach(l => {
        h += `<tr>`
            + `<td>${l.round}</td><td>${l.turn}</td>`
            + `<td>${esc(String(l.actor || ''))}</td>`
            + `<td>${esc(String(l.target || ''))}</td>`
            + `<td>${esc(String(l.action || ''))}</td>`
            + `<td>${l.dice != null ? l.dice : ''}</td>`
            + `<td>${esc(String(l.val != null ? l.val : ''))}</td>`
            + `<td>${esc(String(l.status != null ? l.status : ''))}</td>`
            + `<td>${esc(String(l.trigger != null ? l.trigger : ''))}</td>`
            + `</tr>`;
    });
    return h + '</tbody></table></div>';
}

/* ---- 簡易表示（構造化ログ1行 → 文） ---- */
function narrateEntry(e, allies) {
    if (typeof I18N !== 'undefined' && I18N.lang === 'en') return narrateEntryEn(e, allies);
    const ally = allies.has(String(e.actor));
    const actor = `<b class="n-who ${ally ? 'n-ally' : 'n-foe'}">${esc(e.actor)}</b>`;
    const act = e.action === '通常攻撃' ? 'の攻撃' : `の『${esc(e.action)}』`;
    const tgtRaw = String(e.target == null ? '' : e.target);
    const tgt = esc(tgtRaw.replace(/ を中心に範囲$/, 'たち').replace(/^範囲$/, '敵全体'));
    const val = String(e.val == null ? '' : e.val);
    let m, out;
    if ((m = val.match(/^(\d+) dmg/))) out = `${actor}${act} → ${tgt}に <b class="n-dmg">${m[1]}</b> ダメージ`;
    else if ((m = val.match(/^\+(\d+) 回復/))) out = `${actor}${act} → ${tgt}のHPが <b class="n-heal">${m[1]}</b> 回復`;
    else if ((m = val.match(/^自己(\d+)/))) out = `${actor}${act}（反動 ${m[1]}）`;
    else if ((m = val.match(/^復活HP(\d+)/))) out = `${actor}${act} → ${tgt}が立ち上がった（HP${m[1]}）`;
    else if (val === '範囲回復45%') out = `${actor}${act} → 味方全体の傷を癒やした`;
    else out = `${actor}${act}` + (tgtRaw && tgtRaw !== String(e.actor) && tgtRaw !== '-' ? ` → ${tgt}` : '');
    const st = String(e.status == null ? '' : e.status);
    if (st && st !== '-') {
        if (/戦闘不能/.test(st)) out += `　<span class="n-down">${tgt}は倒れた</span>`;
        else out += ` <span class="n-st">（${esc(st)}）</span>`;
    }
    const trg = String(e.trigger || '').match(/^行(\d+)\((.*)\)$/);
    const tag = (ally && trg) ? `<span class="n-rule" title="ルール${trg[1]}: ${esc(trg[2])}">${trg[1]}</span>` : '<span class="n-rule n-rule-none"></span>';
    return `<div class="n-line ${ally ? 'ally' : 'foe'}">${tag}<span>${out}</span></div>`;
}
/** 英語の簡易表示（語順が違うので文ごと組み立てる。名前・スキル名は辞書で訳す） */
function narrateEntryEn(e, allies) {
    const ally = allies.has(String(e.actor));
    const nm = x => esc(T(String(x == null ? '' : x)));
    const actor = `<b class="n-who ${ally ? 'n-ally' : 'n-foe'}">${nm(e.actor)}</b>`;
    const act = e.action === '通常攻撃' ? 'attacks' : `uses <i>${nm(e.action)}</i>`;
    const tgtRaw = String(e.target == null ? '' : e.target);
    const tgt = tgtRaw === '範囲' ? 'all foes' : nm(tgtRaw);
    const val = String(e.val == null ? '' : e.val);
    let m, out;
    if ((m = val.match(/^(\d+) dmg/))) out = `${actor} ${act} → ${tgt} takes <b class="n-dmg">${m[1]}</b> damage`;
    else if ((m = val.match(/^\+(\d+) 回復/))) out = `${actor} ${act} → ${tgt} recovers <b class="n-heal">${m[1]}</b> HP`;
    else if ((m = val.match(/^自己(\d+)/))) out = `${actor} ${act} (recoil ${m[1]})`;
    else if ((m = val.match(/^復活HP(\d+)/))) out = `${actor} ${act} → ${tgt} gets back up (HP ${m[1]})`;
    else if (val === '範囲回復45%') out = `${actor} ${act} → heals the whole party`;
    else out = `${actor} ${act}` + (tgtRaw && tgtRaw !== String(e.actor) && tgtRaw !== '-' ? ` → ${tgt}` : '');
    const st = String(e.status == null ? '' : e.status);
    if (st && st !== '-') {
        if (/戦闘不能/.test(st)) out += `　<span class="n-down">${tgt} falls</span>`;
        else out += ` <span class="n-st">(${nm(st)})</span>`;
    }
    const trg = String(e.trigger || '').match(/^行(\d+)\((.*)\)$/);
    const tag = (ally && trg) ? `<span class="n-rule" title="Rule ${trg[1]}: ${nm(trg[2])}">${trg[1]}</span>` : '<span class="n-rule n-rule-none"></span>';
    return `<div class="n-line ${ally ? 'ally' : 'foe'}">${tag}<span>${out}</span></div>`;
}
/** 1戦分を簡易表示の文に。ラウンドごとの HTML 配列を返す */
function narrateBattleRounds(b, run) {
    const allies = new Set((run.partyNames || []).map(String));
    const rounds = [];
    let cur = null, html = '';
    (b.structured || []).forEach(e => {
        if (e.round !== cur) {
            if (cur != null) rounds.push(html);
            cur = e.round;
            html = `<div class="n-round">第${e.round}ラウンド</div>`;
        }
        html += narrateEntry(e, allies);
    });
    if (cur != null) rounds.push(html);
    return rounds;
}

/** 1 回分の遠征ログ → HTML 配列。perRound なら簡易表示をラウンドごとに分けて少しずつ出す */
function runLogItems(run, opts) {
    opts = opts || {};
    const items = [];
    let bi = 0;
    run.lines.forEach(l => {
        let h = `<div class="exp-line ${l.cls}">${esc(l.t)}</div>`;
        if (l.cls === 'battle') {
            const b = run.battles[bi++];
            if (b) {
                if (logView === 'table') {
                    const head = `第${b.index}戦の戦闘ログ（${b.rounds != null ? b.rounds : '?'}R / ${esc(b.reason || '')}）`;
                    h += `<div class="exp-battle-block"><div class="exp-battle-head">${head}</div>` + formatStructuredTableHtml(b.structured) + `</div>`;
                } else {
                    const rounds = narrateBattleRounds(b, run);
                    if (opts.perRound) {
                        items.push(h);
                        rounds.forEach(r => items.push(`<div class="n-block">${r}</div>`));
                        return;
                    }
                    h += `<details class="n-details"><summary>戦闘の様子（${b.rounds != null ? b.rounds : rounds.length}ラウンド）</summary><div class="n-block">${rounds.join('')}</div></details>`;
                }
            }
        }
        items.push(h);
    });
    return items;
}

function batchLogItems(batch) {
    const items = [];
    batch.runs.forEach(r => {
        items.push(`<div class="exp-run-sep">━━━━ 出撃 ${r.index}/${batch.count}　${esc(r.statusLabel)} ━━━━</div>`);
        runLogItems(r).forEach(x => items.push(x));
    });
    if (batch.stopReason) items.push(`<div class="exp-line warn">停止: ${esc(batch.stopReason)}</div>`);
    return items;
}

// ---------------------------------------------------------------- 実行
function expOpts() {
    return {
        dungeonId: document.getElementById('exp-dungeon').value,
        stageId: document.getElementById('exp-stage').value,
        mode: document.getElementById('exp-mode').value,
        protocol: getExpProtocol(),
        applyResources: !document.getElementById('exp-dry').checked
    };
}

function expPartyEmpty() { return typeof getPartyChars === 'function' && !getPartyChars().length; }
function expDryChecked() { const d = document.getElementById('exp-dry'); return !!(d && d.checked); }
/** 出撃のクールタイムの残り（ミリ秒）。サーバー版のみ。テスト実行には関係しない */
function expCooldownRemaining() {
    return (typeof serverState !== 'undefined' && serverState.expReadyLocal) ? Math.max(0, serverState.expReadyLocal - Date.now()) : 0;
}
function expFmtWait(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/** 出撃ボタンの有効・無効と表示（実行中・パーティが空・クールタイム中は押せない。テスト実行はクールタイムなし） */
function expUpdateRunButtons() {
    const busy = (typeof batchRunning !== 'undefined' && batchRunning);
    const dry = expDryChecked();
    const left = dry ? 0 : expCooldownRemaining();
    const empty = expPartyEmpty();
    const tag = dry ? '（テスト）' : (left > 0 ? `（あと${expFmtWait(left)}）` : '');
    const b1 = document.getElementById('exp-run'), b10 = document.getElementById('exp-run10');
    if (b1) { b1.disabled = busy || empty || left > 0; b1.textContent = '出撃' + tag; b1.classList.toggle('exp-dry-btn', dry); }
    if (b10) { b10.disabled = busy || empty || left > 0; b10.textContent = '10連出撃' + tag; b10.classList.toggle('exp-dry-btn', dry); }
    const ct = document.getElementById('exp-ct');
    if (ct) {
        const all = expCooldownRemaining();
        if (dry) ct.textContent = 'テスト実行中：SS・寿命・入手物は変わらず、待ち時間も発生しません（本番はチェックを外す）' + (all > 0 ? `。本番の次の出撃まで ${expFmtWait(all)}` : '');
        else ct.textContent = all > 0
            ? `次の出撃まで ${expFmtWait(all)}（出撃1回につき30秒・10連は5分）`
            : '本番の出撃のあとは待ち時間があります（1回30秒・10連5分）';
        ct.classList.toggle('exp-ct-wait', all > 0 && !dry);
        ct.classList.toggle('exp-ct-dry', dry);
    }
    const home = document.getElementById('home-exp-ct');
    if (home) { const all = expCooldownRemaining(); home.textContent = all > 0 ? `次の出撃まで ${expFmtWait(all)}` : ''; }
}
let expCtTimer = null, expCtLong = false;
/** クールタイムが変わったら（出撃した・応答を受けた）1秒ごとに表示を更新し、明けたら知らせる */
function expCooldownChanged() {
    const left = expCooldownRemaining();
    if (left >= 60000) expCtLong = true;
    expUpdateRunButtons();
    if (left > 0 && !expCtTimer) {
        expCtTimer = setInterval(() => {
            expUpdateRunButtons();
            if (expCooldownRemaining() <= 0) {
                clearInterval(expCtTimer); expCtTimer = null;
                if (expCtLong && typeof fxToast === 'function') fxToast('<b>出撃の準備ができました</b><span>次の遠征に出られます</span>', { tone: 'red', sound: 'chime', key: 'ct' });
                expCtLong = false;
            }
        }, 1000);
    }
}
function setExpBusy(busy) {
    expUpdateRunButtons();
    const c = document.getElementById('exp-cancel');
    if (c) c.style.display = busy ? '' : 'none';
}

function expStatusCls(s) { return s === 'wiped' ? 'bad' : (s === 'timeout' ? 'warn' : 'good'); }
function expFmt(n) { return (typeof fxFmt === 'function') ? fxFmt(n) : String(n); }

/** 結果欄までスクロール（スマホでは設定の下にあるので） */
function expScrollToLog() {
    const el = document.querySelector('.exp-log-panel');
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.45 || top < 0) {
        try { el.scrollIntoView({ behavior: (typeof fxLite === 'function' && fxLite()) ? 'auto' : 'smooth', block: 'start' }); } catch (e) { el.scrollIntoView(); }
    }
}
/** サーバーの返事を待つ間の表示 */
function expShowDeparting(count) {
    const sum = document.getElementById('exp-summary');
    if (sum) sum.innerHTML = `<div class="settle settle-pending"><div class="settle-eyebrow">出発</div><div class="settle-title">${count > 1 ? count + '回の遠征に出発…' : '遠征に出発…'}</div><div class="settle-wait" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
    const bt = document.getElementById('exp-batch'); if (bt) bt.innerHTML = '';
    const log = document.getElementById('exp-log'); if (log) { stopLogPlayer(); logPlayerFinish(); log.innerHTML = ''; }
    expScrollToLog();
}
function expClearDeparting() {
    const sum = document.getElementById('exp-summary');
    if (sum && sum.querySelector('.settle-pending')) sum.innerHTML = '';
}

/* ---- 精算書（結果のまとめ。ログを最後まで見ると朱印が押される） ---- */
const SETTLE_STAMP = { cleared: ['踏破', 'red'], retreated: ['帰還', 'red'], timeout: ['撤退', 'ink'], wiped: ['全滅', 'ink'] };
function settleModeName(mode) { return (typeof MODE_DEFS !== 'undefined' && MODE_DEFS[mode]) ? MODE_DEFS[mode].name : (mode || ''); }
function settleBattleGains(run) {
    const gains = {};
    (run.lines || []).forEach(l => { const m = String(l.t).match(/^第(\d+)戦: 勝利.*→ \+(\d+)SS/); if (m) gains[m[1]] = +m[2]; });
    return gains;
}
function settleRowsHtml(run) {
    const gains = settleBattleGains(run);
    return (run.battles || []).map(b => {
        const win = !!b.playerWin;
        const lost = /15R|ボス未撃破/.test(b.reason || '') ? '時間切れ' : '敗北';
        return `<div class="settle-row${win ? '' : ' lost'}"><span>第${b.index}戦${b.isBoss ? '（ボス）' : ''}　${win ? '勝利' : lost}</span>`
            + `<span class="settle-r">${b.rounds != null ? b.rounds + 'R' : ''}</span><span class="settle-v">${win ? '+' + expFmt(gains[b.index] || 0) : '—'}</span></div>`;
    }).join('');
}
function settleNotes(run, dry) {
    const notes = [];
    if (dry) notes.push('テスト実行のため、SS・寿命・入手物は実際には変わりません');
    if (run.healUses) notes.push(`事後回復 ${run.healUses}回`);
    if (!dry) {
        if (run.mode === 'challenge' && run.status === 'wiped') notes.push('全員の寿命 −2（チャレンジ失敗）');
        else notes.push('全員の寿命 −1' + (run.mode === 'challenge' ? '（倒れた者はさらに −1）' : ''));
        const low = (run.partyIds || []).map(id => yardChars.find(c => c.id === id)).filter(c => c && typeof c.lifespan === 'number' && c.lifespan <= 10);
        if (low.length) notes.push('寿命が残り少ない：' + low.map(c => `${c.name}（残${c.lifespan}）`).join('、'));
    }
    if (run.retired && run.retired.length) notes.push('引退：' + run.retired.join('、'));
    if (run.corpse) notes.push(`遺骸を残置：獲得 ${run.corpse.lootLost} SS と入場料 ${run.corpse.depositLost} をロスト`);
    else if (run.depositRefunded) notes.push(`入場料 ${run.depositRefunded} は返却`);
    (run.drops || []).forEach(d => notes.push('入手：' + d));
    return notes;
}
function settleShell(o) {
    return `<div class="settle settle-${o.cls}${o.dry ? ' settle-dry' : ''}${o.gate ? ' revealed' : ''}" id="${o.gate ? 'settle-gate' : 'settle'}" data-to="${o.amount | 0}">
        <div class="settle-eyebrow">${o.eyebrow}</div>
        <div class="settle-title">${o.title}</div>
        <div class="settle-amount"><span class="settle-label">${o.dry ? '試算額' : '精算額'}</span><b class="settle-num">…</b><span class="settle-unit">SS</span></div>
        <div class="settle-stamp settle-stamp-${o.tone}" aria-hidden="true"><span>${o.stamp}</span></div>
        <div class="settle-rows">${o.rows}</div>
        ${o.notes && o.notes.length ? `<ul class="settle-notes">${o.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${o.gate ? '' : '<div class="settle-playing"><span>記録を再生中…</span><button type="button" class="btn btn-sm" onclick="flushLog()">結果を見る</button></div>'}
    </div>`;
}
function settleSingleHtml(run, dry, gate) {
    const st = SETTLE_STAMP[run.status] || ['済', 'red'];
    const amount = (run.loot | 0) + (run.poolClaimed | 0) + (run.soldSs | 0);
    let rows = settleRowsHtml(run);
    if (run.poolClaimed) rows += `<div class="settle-row"><span>失敗プール受取</span><span class="settle-r"></span><span class="settle-v">+${expFmt(run.poolClaimed)}</span></div>`;
    if (run.soldSs) rows += `<div class="settle-row"><span>アクセサリーの自動売却</span><span class="settle-r"></span><span class="settle-v">+${expFmt(run.soldSs)}</span></div>`;
    if (run.corpse && run.corpse.lootLost) rows += `<div class="settle-row lost"><span>全滅によりロスト</span><span class="settle-r"></span><span class="settle-v">−${expFmt(run.corpse.lootLost)}</span></div>`;
    rows += `<div class="settle-row total"><span>合計</span><span class="settle-r"></span><span class="settle-v">${amount ? '+' + expFmt(amount) : '0'}</span></div>`;
    return settleShell({
        cls: run.status, dry, gate, amount, rows, notes: settleNotes(run, dry),
        eyebrow: `${dry ? '試算' : '精算書'}　${esc(run.dungeonName)}　${esc(run.stageName)}　${esc(settleModeName(run.mode))}`,
        title: esc(run.statusLabel || ''), stamp: dry ? '試算' : st[0], tone: dry ? 'ink' : st[1]
    });
}
function settleBatchHtml(b, dry, gate) {
    const c = b.counts;
    const pool = b.runs.reduce((t, r) => t + (r.poolClaimed | 0) + (r.soldSs | 0), 0);
    const amount = (b.loot | 0) + pool;
    const runAmt = r => (r.loot | 0) + (r.poolClaimed | 0) + (r.soldSs | 0);
    let rows = b.runs.map(r => `<div class="settle-row${r.status === 'wiped' ? ' lost' : ''}"><span>#${r.index}　${esc(r.statusLabel)}</span>`
        + `<span class="settle-r">${r.battles.length}/${r.nBattlesPlanned}戦</span><span class="settle-v">${runAmt(r) ? '+' + expFmt(runAmt(r)) : '0'}</span></div>`).join('');
    rows += `<div class="settle-row total"><span>合計</span><span class="settle-r"></span><span class="settle-v">${amount ? '+' + expFmt(amount) : '0'}</span></div>`;
    const notes = [];
    if (dry) notes.push('テスト実行のため、SS・寿命・入手物は実際には変わりません');
    if (b.stopReason) notes.push('停止：' + b.stopReason);
    if (b.depositLost) notes.push(`入場料 ${b.depositLost} をロスト（全滅分）`);
    const ret = []; b.runs.forEach(r => (r.retired || []).forEach(n => ret.push(n)));
    if (ret.length) notes.push('引退：' + ret.join('、'));
    const dropCount = {};
    b.runs.forEach(r => (r.drops || []).forEach(d => { dropCount[d] = (dropCount[d] || 0) + 1; }));
    const drops = Object.keys(dropCount).map(d => d + (dropCount[d] > 1 ? ' ×' + dropCount[d] : ''));
    if (drops.length) notes.push('入手：' + drops.join('、'));
    const first = b.runs[0] || {};
    return settleShell({
        cls: c.wiped ? 'wiped' : 'cleared', dry, gate, amount, rows, notes,
        eyebrow: `${dry ? '試算' : '精算書'}　${esc(first.dungeonName || '')}　${esc(first.stageName || '')}　${esc(settleModeName(b.mode))}　${b.completed}/${b.count}回`,
        title: `<span class="settle-counts"><span>踏破 <b>${c.cleared}</b></span><span>撤退 <b>${c.retreated}</b></span><span>時間切れ <b>${c.timeout}</b></span><span>全滅 <b>${c.wiped}</b></span></span>`,
        stamp: dry ? '試算' : '済', tone: dry ? 'ink' : 'red'
    });
}
/** ログの再生が終わったら：朱印を押して精算額を数え上げ、そのあと演出カード（初踏破・入手など）を出す */
function expRevealSettlement(dry) {
    const el = document.getElementById('settle');
    if (el && !el.dataset.revealed) {
        el.dataset.revealed = '1';
        el.classList.add('revealed');
        const num = el.querySelector('.settle-num');
        const to = Number(el.dataset.to) || 0;
        if (typeof fxCount === 'function') fxCount(num, 0, to, 700); else if (num) num.textContent = String(to);
        if (typeof fxSound === 'function') fxSound(dry ? 'paper' : 'stamp');
    }
    if (!dry && typeof fxReleaseDeferred === 'function') fxReleaseDeferred(el ? 650 : 0);
}

/* ---- 帰還画面（P9.15.0）：精算を見せて、広告ボーナスを選んでもらい、そのあと戦闘ログへ ----
 * gate = { runs, ss, need, rate }（サーバーがためた広告ボーナスのゲージ） */
let expGate = null;
/** 広告機能を出すか（広告をつなぐまでは出さない。開発者アカウントでは試せる） */
function adsUiEnabled() {
    if (typeof ADS_ENABLED !== 'undefined' && ADS_ENABLED) return true;
    return typeof serverState !== 'undefined' && !!serverState.isDev;
}
function expGateBonusHtml() {
    if (!adsUiEnabled()) return '';
    const g = expGate.gate, st = (typeof adStatus === 'function') ? adStatus() : { today: 0, limit: 99, points: 0 };
    if (expGate.claimed) return `<div class="gate-ad gate-ad-done"><b>${esc(expGate.claimed)}</b></div>`;
    if (g.runs < g.need) {
        const dots = Array.from({ length: g.need }, (_, i) => `<i class="${i < g.runs ? 'on' : ''}"></i>`).join('');
        return `<div class="gate-ad"><div class="gate-ad-head">広告ボーナス<span class="gate-dots" aria-label="${g.runs}/${g.need}">${dots}</span></div>`
            + `<div class="gate-ad-note">あと ${g.need - g.runs} 回の出撃で、広告を見て「SS +${Math.round(g.rate * 100)}%」か「${esc(AD_POINT_NAME)} +1」を選べます</div></div>`;
    }
    const ssAmt = Math.floor(g.ss * g.rate);
    const shardOk = st.today < st.limit && st.points < AD_POINT_CAP;
    return `<div class="gate-ad gate-ad-ready"><div class="gate-ad-head">広告ボーナス<span class="gate-ad-tag">どちらか1つ</span></div>`
        + `<div class="gate-ad-btns">`
        + `<button type="button" class="btn btn-blue gate-ad-btn" id="gate-ad-ss" ${ssAmt > 0 ? '' : 'disabled'} onclick="onGateAd('ss')">📺 広告を見て<b>SS +${expFmt(ssAmt)}</b><small>出撃${g.runs}回分の報酬 ${expFmt(g.ss)} の ${Math.round(g.rate * 100)}%</small></button>`
        + `<button type="button" class="btn btn-blue gate-ad-btn" id="gate-ad-shard" ${shardOk ? '' : 'disabled'} onclick="onGateAd('shard')">📺 広告を見て<b>${esc(AD_POINT_NAME)} +${AD_POINT_PER_VIEW}</b><small>${shardOk ? '所持 ' + st.points : '本日の上限（' + st.limit + '回）に達しました'}</small></button>`
        + `</div><div class="gate-ad-note" id="gate-ad-msg">見なくても結果は変わりません。受け取らなかった分は、次回に持ち越されます。</div></div>`;
}
function expGateRender() {
    const box = document.getElementById('exp-gate-body');
    if (!box || !expGate) return;
    box.innerHTML = `<div class="gate-eyebrow">帰還</div>${expGate.sheet}${expGateBonusHtml()}`
        + `<div class="gate-btns"><button type="button" class="btn gate-go" onclick="expGateClose(true)">戦闘ログを見る</button>`
        + `<button type="button" class="btn btn-blue gate-skip" onclick="expGateClose(false)">ログは後で見る</button></div>`;
    const el = document.getElementById('settle-gate'), num = el && el.querySelector('.settle-num');
    if (num) num.textContent = expFmt(Number(el.dataset.to) || 0);   // 描き直しても精算額は出したまま（数え上げは開いたときだけ）
}
function expOpenGate(o) {
    expClearDeparting();
    expGate = { gate: o.gate, sheet: o.sheet, onGo: o.onGo, claimed: '', busy: false };
    let ov = document.getElementById('exp-gate');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'exp-gate'; ov.className = 'fx-overlay exp-gate';
        ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '帰還');
        ov.innerHTML = '<div class="fx-card gate-card" id="exp-gate-body"></div>';
        document.body.appendChild(ov);
    }
    expGateRender();
    ov.style.display = 'flex';
    const card = ov.querySelector('.fx-card');
    if (card) card.classList.toggle('fx-lite', typeof fxLite === 'function' && fxLite());
    requestAnimationFrame(() => ov.classList.add('fx-in'));
    const el = document.getElementById('settle-gate');
    if (el) {
        const num = el.querySelector('.settle-num'), to = Number(el.dataset.to) || 0;
        if (typeof fxCount === 'function') fxCount(num, 0, to, 700); else if (num) num.textContent = String(to);
        if (typeof fxSound === 'function') setTimeout(() => fxSound('stamp'), 120);
    }
}
function expGateClose(watch) {
    if (!expGate || expGate.busy) return;
    const g = expGate; expGate = null;
    const ov = document.getElementById('exp-gate');
    if (ov) { ov.classList.remove('fx-in'); ov.style.display = 'none'; }
    if (typeof g.onGo === 'function') g.onGo(!!watch);
}
async function onGateAd(choice) {
    if (!expGate || expGate.busy || typeof serverAdBonus !== 'function') return;
    expGate.busy = true;
    document.querySelectorAll('.gate-ad-btn').forEach(b => { b.disabled = true; });
    const msg = document.getElementById('gate-ad-msg');
    if (msg) msg.textContent = '広告を再生中…';
    let r;
    try { r = await serverAdBonus(choice); } catch (e) { r = { ok: false, error: '受け取れませんでした' }; }
    if (!expGate) return;
    expGate.busy = false;
    if (!r.ok) {
        expGateRender();
        const m2 = document.getElementById('gate-ad-msg');
        if (m2) { m2.textContent = r.error || '受け取れませんでした'; m2.classList.add('gate-ad-err'); }
        return;
    }
    expGate.claimed = r.kind === 'ss' ? `✔ SS +${expFmt(r.amount)} を受け取りました` : `✔ ${AD_POINT_NAME} +${r.amount} を受け取りました（所持 ${r.points}）`;
    expGate.gate = { runs: 0, ss: 0, need: expGate.gate.need, rate: expGate.gate.rate };
    expGateRender();
    if (typeof fxSound === 'function') fxSound('chime');
}

async function onExpRun() {
    if (batchRunning) return;
    const opts = expOpts();
    const res = runExpedition(opts);
    if (!res.ok) { alert(res.error); return; }
    lastExpResult = res; lastBatch = null; lastExpText = res.text;
    renderExpResult(res, { dry: opts.applyResources === false });
    if (typeof renderAll === 'function') renderAll();
    renderExpInfo();
    const r = await notifySingleRun(res);
    if (!r.skipped) setDiscordStatus(r.ok ? '全滅を Discord に通知しました' : ('Discord 通知に失敗: ' + r.error), r.ok);
}

function renderExpResult(res, opts) {
    opts = opts || {};
    const dry = !!opts.dry;
    const items = runLogItems(res, { perRound: true });
    if (opts.gate && !dry) {
        expOpenGate({ gate: opts.gate, sheet: settleSingleHtml(res, false, true), onGo: (watch) => expShowResultBody(settleSingleHtml(res, false), '', items, false, watch) });
        return;
    }
    expShowResultBody(settleSingleHtml(res, dry), '', items, dry, true);
}
/** 結果欄（精算書とログ）を描く。watch=false ならログは再生せず、すぐ全部出す */
function expShowResultBody(summaryHtml, batchHtml, items, dry, watch) {
    document.getElementById('exp-summary').innerHTML = summaryHtml;
    const bt = document.getElementById('exp-batch'); if (bt) bt.innerHTML = batchHtml || '';
    playLog(document.getElementById('exp-log'), items, () => expRevealSettlement(!!dry));
    if (!watch) flushLog();
    expScrollToLog();
}

async function onExpRun10() {
    if (batchRunning) return;
    batchRunning = true; batchCancel = false;
    setExpBusy(true);
    const opts = expOpts();
    expShowDeparting(BATCH_COUNT);
    const prog = document.querySelector('#exp-summary .settle-title');
    let batch;
    try {
        batch = await runExpeditionBatch(opts, BATCH_COUNT, {
            onProgress: (i, n) => { if (prog) prog.textContent = `出撃中… ${i}/${n}`; },
            isCancelled: () => batchCancel
        });
    } finally {
        batchRunning = false; setExpBusy(false);
    }
    if (!batch.ok) { expClearDeparting(); alert(batch.error); return; }
    lastBatch = batch; lastExpResult = null; lastExpText = batch.text;
    renderBatchResult(batch, { dry: opts.applyResources === false });
    if (typeof renderAll === 'function') renderAll();
    renderExpInfo();
    const n = batch.notify;
    if (n.sent || n.failed) setDiscordStatus(`Discord 通知: 成功${n.sent}件` + (n.failed ? ` / 失敗${n.failed}件（${n.errors[0]}）` : ''), n.failed === 0);
}

function cancelBatch() { batchCancel = true; }

function renderBatchResult(b, opts) {
    opts = opts || {};
    if (opts.gate && !opts.dry) {
        const items = batchLogItems(b);
        expOpenGate({ gate: opts.gate, sheet: settleBatchHtml(b, false, true), onGo: (watch) => expShowResultBody(settleBatchHtml(b, false), '', items, false, watch) });
        return;
    }
    document.getElementById('exp-summary').innerHTML = settleBatchHtml(b, !!opts.dry);
    document.getElementById('exp-batch').innerHTML = (opts.dry || !adsUiEnabled()) ? '' :
        `<div class="exp-ad"><button type="button" class="btn" id="exp-ad-btn" onclick="onClaimAd()">📺 広告を見て ${esc(AD_POINT_NAME)} +${AD_POINT_PER_VIEW}</button>`
        + `<span class="meta" id="exp-ad-note">※ 広告SDKは未接続のためスタブ動作（実際の広告は出ません）。SS報酬は増えません</span></div>`;
    playLog(document.getElementById('exp-log'), batchLogItems(b), () => expRevealSettlement(!!opts.dry));
    expScrollToLog();
}

async function onClaimAd() {
    if (!lastBatch) return;
    const btn = document.getElementById('exp-ad-btn');
    if (btn) btn.disabled = true;
    const r = await claimAdPointFlow();
    const note = document.getElementById('exp-ad-note');
    if (!r.ok) {
        if (btn && !lastBatch.adClaimed) btn.disabled = false;
        if (note) note.textContent = r.error;
        return;
    }
    lastBatch.adClaimed = true;
    if (btn) btn.textContent = `✔ ${AD_POINT_NAME} +${AD_POINT_PER_VIEW} 受取済み`;
    if (note) note.textContent = `所持 ${r.points} ／ 本日 ${r.today} / ${r.limit} 回`;
}

function copyExpText() {
    if (!lastExpText) return alert('先に出撃してください');
    const ta = document.getElementById('exp-copy');
    const text = (typeof i18nText === 'function') ? i18nText(lastExpText) : lastExpText;
    ta.value = text;
    ta.select();
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => alert('遠征ログ（Markdown表形式）をコピーしました')).catch(() => document.execCommand('copy'));
        } else { document.execCommand('copy'); alert('遠征ログ（Markdown表形式）をコピーしました'); }
    } catch (e) { alert('コピーに失敗しました'); }
}

// ---------------------------------------------------------------- Discord 設定
function setDiscordStatus(msg, good) {
    const el = document.getElementById('dc-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'meta ' + (good ? 'dc-ok' : 'dc-ng');
}

function initDiscordSettingsUI() {
    const s = loadDiscordSettings();
    const u = document.getElementById('dc-url');
    if (!u) return;
    u.value = s.url;
    document.getElementById('dc-batch').checked = s.notifyBatch;
    document.getElementById('dc-wipe').checked = s.notifyWipe;
}

function onDiscordSettingsChange() {
    const url = document.getElementById('dc-url').value.trim();
    const s = { url, notifyBatch: document.getElementById('dc-batch').checked, notifyWipe: document.getElementById('dc-wipe').checked };
    saveDiscordSettings(s);
    if (!url) setDiscordStatus('Webhook URL 未設定（通知は送信されません）', false);
    else if (!isValidDiscordWebhookUrl(url)) setDiscordStatus('URL の形式が正しくありません（https://discord.com/api/webhooks/… の形式）', false);
    else setDiscordStatus('保存しました', true);
}

async function onDiscordTest() {
    const url = document.getElementById('dc-url').value.trim();
    setDiscordStatus('送信中…', true);
    const r = await sendDiscordTest(url);
    setDiscordStatus(r.ok ? 'テスト送信に成功しました' : ('失敗: ' + r.error), r.ok);
}

function toggleDiscordUrlVisible() {
    const u = document.getElementById('dc-url');
    u.type = (u.type === 'password') ? 'text' : 'password';
}

// 遠征画面を開いたときに UI を初期化（ui.js の initExpeditionScreen の後段）
const _baseInitExpeditionScreen = initExpeditionScreen;
initExpeditionScreen = function () {
    _baseInitExpeditionScreen();
    renderLogSpeedToggle();
    initDiscordSettingsUI();
};
