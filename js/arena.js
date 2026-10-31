/**
 * arena.js — P9.17.0 闘技場（常設PVP）の画面
 * 対戦はサーバーが周期ごとに自動で行う（非同期。相手のログインを待たない）。ここでは状況の表示とログの閲覧だけ。
 */
const arenaState = { data: null, loading: false, error: '', log: null };

function arenaFmtTime(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function arenaFmtDateTime(ms) {
    const d = new Date(ms), now = new Date();
    return (d.toDateString() === now.toDateString() ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + arenaFmtTime(ms);
}
function arenaFmtLeft(ms) {
    const m = Math.max(0, Math.ceil(ms / 60000));
    return m >= 60 ? Math.floor(m / 60) + '時間' + (m % 60 ? (m % 60) + '分' : '') : m + '分';
}
function arenaTeamHtml(team) {
    return '<span class="ar-team">' + (team || []).map(u => {
        const base = (typeof getBaseClassId === 'function') ? getBaseClassId(u.classId) : u.classId;
        const face = (u.portrait && typeof portraitPresetUrl === 'function') ? `<img class="ar-face" src="${portraitPresetUrl(u.portrait, false)}" alt="" loading="lazy" decoding="async">` : '<i></i>';
        return `<span class="ar-unit cls-${esc(base)}" title="${esc(u.name)}">${face}${esc(u.className || u.classId)}<b>Lv${u.level | 0}</b></span>`;
    }).join('') + '</span>';
}
function arenaPartyAEmpty() {
    try { return !(typeof partySets !== 'undefined' && partySets[0] && partySets[0].partyIds.filter(id => yardChars.some(c => c.id === id)).length); } catch (e) { return false; }
}

async function renderArenaScreen() {
    arenaRender();
    if (arenaState.loading) return;
    arenaState.loading = true;
    let r;
    try { r = await serverCall('pvp_status', {}); } catch (e) { r = { ok: false, message: '読み込めませんでした' }; }
    arenaState.loading = false;
    if (r && r.ok) { arenaState.data = r.status; arenaState.error = ''; }
    else arenaState.error = (r && r.message) || '読み込めませんでした';
    arenaRender();
}

function arenaRender() {
    const box = document.getElementById('arena-body');
    if (!box) return;
    const d = arenaState.data;
    const duo = (typeof duoCardHtml === 'function') ? duoCardHtml() : '';   // P9.24.0 イベントバトル（闘技場の集計とは別）
    if (!d) { box.innerHTML = duo + `<div class="hint">${esc(arenaState.error || '読み込み中…')}</div>`; return; }
    const now = Date.now();
    const skew = now - (d.now || now);   // サーバーとの時計のずれ
    const next = d.nextDeadline + skew;
    const me = d.me;
    const name = (typeof serverState !== 'undefined' && serverState.meta && serverState.meta.playerName) || '';
    let html = duo;

    // 自分
    if (me) {
        html += `<div class="ar-me"><div class="ar-me-name">${titledNameHtml(me.name)}</div>
            <div class="ar-me-row"><div class="ar-mmr"><span>MMR</span><b>${me.mmr}</b></div>
            <div class="ar-rank"><span>順位</span><b>${me.rank ? me.rank + '<small> / ' + d.total + '</small>' : '—'}</b></div>
            <div class="ar-rec"><span>通算</span><b>${me.wins}<small>勝</small> ${me.losses}<small>敗</small></b></div></div>
            ${me.cycles ? '' : '<div class="ar-note">まだ対戦していません。次の締切から自動で参加します。</div>'}</div>`;
    } else {
        html += `<div class="ar-me"><div class="ar-note">${name ? '次にログインしたときに自動で登録されます。' : '冒険者名を設定すると自動で参加します。'}</div></div>`;
    }
    if (arenaPartyAEmpty()) html += `<div class="ar-warn">パーティAが空のため、闘技場には参加できません。<button type="button" class="btn btn-sm" onclick="showScreen('yard')">パーティ編集へ</button></div>`;

    // 周期
    const last = (d.cycles || [])[0];
    let lastLine = '';
    if (last) {
        const t = arenaFmtDateTime(Number(last.id) + skew);
        if (last.status === 'done') lastLine = `前回の締切（${t}）：${last.n_players}人・${last.n_groups}グループで対戦しました`;
        else if (last.status === 'skipped') lastLine = `前回の締切（${t}）：参加者が${d.minPlayers}人に満たないため対戦はありませんでした（${last.n_players | 0}人）`;
        else lastLine = `締切（${t}）の対戦を処理中です。結果はまもなく出ます`;
    }
    html += `<div class="ar-cycle"><div><span class="meta">次の締切</span> <b>${arenaFmtTime(next)}</b> <span class="meta">（あと${arenaFmtLeft(next - now)}・結果は${arenaFmtTime(next + d.resultDelayMs)}ごろ）</span></div>
        ${lastLine ? `<div class="ar-last">${esc(lastLine)}</div>` : ''}</div>
        <details class="ar-rules"><summary>闘技場のしくみ</summary><ul>
        <li><b>パーティAの編成とバトルルール</b>で自動参加します。遠征で別のパーティを使っていても、闘技場はパーティAです</li>
        <li>締切（日本時間 5:50 / 11:50 / 17:50 / 23:50）の時点の設定で戦います。締切のあとに変えた設定は次の周期から反映されます</li>
        <li>MMR の近い5人前後でグループを作り、全員と1回ずつ戦います（非同期。相手のログインは不要）</li>
        <li>寿命は減りません。勝敗で MMR が上下します</li>
        <li>相手に見えるのは冒険者名・編成（クラスとレベル）だけです。バトルルールは公開されません</li>
        <li>7日間操作がないと休止します。次にログインすると自動で戻ります</li>
        <li>参加者が${d.minPlayers}人に満たない周期は対戦しません</li></ul></details>`;

    // MMR の推移
    if (me && d.myEntries && d.myEntries.some(e => e.mmr_after != null)) {
        html += `<h3>MMR の推移</h3><div class="ar-hist">` + d.myEntries.filter(e => e.mmr_after != null).map(e => {
            const dl = e.mmr_after - e.mmr_before;
            return `<div class="ar-hist-row"><span>${esc(arenaFmtDateTime(Number(e.cycle_id) + skew))}</span><span>${e.wins | 0}勝${e.losses | 0}敗</span><span class="ar-mono">${e.mmr_before} → ${e.mmr_after}</span><b class="${dl >= 0 ? 'up' : 'down'}">${dl >= 0 ? '+' : ''}${dl}</b></div>`;
        }).join('') + `</div>`;
    }

    // 直近の対戦
    if (me) {
        html += `<h3>直近の対戦</h3>`;
        html += (d.recent && d.recent.length) ? `<div class="ar-matches">` + d.recent.slice(0, 8).map(m => {
            const res = m.status !== 'done' ? '<span class="ar-res pend">待</span>' : (m.win ? '<span class="ar-res win">勝</span>' : '<span class="ar-res lose">敗</span>');
            return `<div class="ar-match">${res}<div class="ar-match-main"><div><b>${titledNameHtml(m.opp.name)}</b> <span class="meta">${esc(arenaFmtDateTime(Number(m.cycle_id) + skew))}${m.reason ? '・' + esc(m.reason) : ''}</span></div>${arenaTeamHtml(m.opp.team)}</div>
                ${m.status === 'done' ? `<button type="button" class="btn btn-sm btn-blue" onclick="arenaOpenLog(${m.id | 0})">ログ</button>` : ''}</div>`;
        }).join('') + `</div>` : '<div class="hint">まだ対戦はありません</div>';
    }

    // ランキング
    const row = p => `<tr class="${me && p.author === me.author ? 'me' : ''}"><td class="ar-mono">${p.rank}</td><td>${titledNameHtml(p.name)}</td><td class="ar-mono">${p.mmr}</td><td class="ar-mono">${p.wins}-${p.losses}</td></tr>`;
    html += `<h3>ランキング <span class="meta">（${d.total}人）</span></h3>`;
    if (d.ranked && d.ranked.length) {
        html += `<table class="ar-rank-table"><thead><tr><th>順位</th><th>冒険者</th><th>MMR</th><th>勝-敗</th></tr></thead><tbody>${d.ranked.map(row).join('')}`
            + (d.around && d.around.length ? `<tr class="gap"><td colspan="4">…</td></tr>` + d.around.map(row).join('') : '') + `</tbody></table>`;
    } else html += '<div class="hint">まだランキングはありません（最初の対戦のあとに表示されます）</div>';
    html += `<div style="margin-top:12px;"><button type="button" class="btn btn-sm btn-blue" onclick="renderArenaScreen()">更新</button></div>`;
    box.innerHTML = html;
}

/* ---- 対戦ログ（サーバーがシードから再計算。相手のルールは含まれない）---- */
async function arenaOpenLog(matchId) {
    let r;
    try { r = await serverCall('pvp_replay', { matchId: matchId }); } catch (e) { r = { ok: false, message: '読み込めませんでした' }; }
    if (!r || !r.ok) { if (typeof fxToast === 'function') fxToast('<b>' + esc((r && r.message) || '読み込めませんでした') + '</b>', { tone: 'ink', key: 'arena' }); return; }
    arenaState.log = { data: r, view: (typeof logView !== 'undefined' ? logView : 'story') };
    arenaLogRender();
    const ov = document.getElementById('arena-log');
    ov.style.display = 'flex';
    requestAnimationFrame(() => ov.classList.add('fx-in'));
}
function arenaLogClose() {
    const ov = document.getElementById('arena-log');
    if (ov) { ov.classList.remove('fx-in'); ov.style.display = 'none'; }
    arenaState.log = null;
}
function arenaLogView(v) { if (arenaState.log) { arenaState.log.view = v; arenaLogRender(); } }
function arenaLogRender() {
    let ov = document.getElementById('arena-log');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'arena-log'; ov.className = 'fx-overlay arena-log';
        ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
        ov.addEventListener('click', e => { if (e.target === ov) arenaLogClose(); });
        ov.innerHTML = '<div class="fx-card ar-log-card" id="arena-log-body"></div>';
        document.body.appendChild(ov);
    }
    const box = document.getElementById('arena-log-body');
    const L = arenaState.log, r = L.data;
    const mine = r.mySide === 'A' ? 'a' : (r.mySide === 'B' ? 'b' : null);
    const side = (k, s) => `<div class="ar-side ${r.winner === k ? 'won' : ''}"><div class="ar-side-name">${titledNameHtml(s.name)}${mine === k ? '<small>（あなた）</small>' : ''}${r.winner === k ? '<span class="ar-res win">勝</span>' : ''}</div>${arenaTeamHtml(s.team)}</div>`;
    let body = '';
    if (!r.log) body = `<div class="hint">${esc(r.note || 'ログはありません')}</div>`;
    else {
        if (!r.engineSame) body += `<div class="ar-warn">この対戦のあとで戦闘エンジンが更新されたため、ログは当時と異なる場合があります${r.resultSame ? '' : '（勝敗は記録どおりです）'}</div>`;
        const rows = r.log.filter(e => !e.x);   // x: ビューア用の行（毒・行動できない）
        if (L.view === 'table') body += formatStructuredTableHtml(rows);
        else {
            const allies = (r.sides && (r.mySide ? r.sides[r.mySide] : r.sides.A)) || [];
            body += `<div class="exp-log ar-log-story">` + narrateBattleRounds({ structured: rows }, { partyNames: allies }).map(x => `<div class="n-block">${x}</div>`).join('') + `</div>`;
        }
    }
    box.innerHTML = `<div class="gate-eyebrow">闘技場の対戦</div>
        <div class="ar-sides">${side('a', r.a)}<div class="ar-vs">VS</div>${side('b', r.b)}</div>
        <div class="ar-log-meta">${esc(r.reason || '')}${r.rounds ? '・' + r.rounds + 'R' : ''}</div>
        ${r.log && r.units && typeof bvOpen === 'function' ? `<button type="button" class="btn btn-sm ar-log-bv" onclick="arenaOpenViewer()">▶ バトルを見る</button>` : ''}
        <div class="ar-log-tabs"><button type="button" class="speed-btn${L.view !== 'table' ? ' active' : ''}" onclick="arenaLogView('story')">簡易表示</button><button type="button" class="speed-btn${L.view === 'table' ? ' active' : ''}" onclick="arenaLogView('table')">詳細表示</button></div>
        <div class="ar-log-box">${body}</div>
        <button type="button" class="btn ar-log-close" onclick="arenaLogClose()">閉じる</button>`;
}

/** P9.24.0 対戦ログをバトルビューアで再生 */
function arenaOpenViewer() {
    const L = arenaState.log;
    if (!L || !L.data || !L.data.log) return;
    const r = L.data;
    const mine = r.mySide === 'B' ? 'b' : 'a';
    bvOpen({ units: r.units, log: r.log, mySide: r.mySide || 'A', title: '闘技場の対戦', win: r.winner === mine, rounds: r.rounds,
        sideNames: { A: r.a.name, B: r.b.name }, closeLabel: '閉じる' });
}
