/**
 * duo.js — P9.24.0 闘技場のイベントバトル「最強コンビ」ミハル＆クラウス
 *  - ギルドでの再会（イベント1）を見たあと、闘技場に入口が出る。何度でも・ペナルティなし
 *  - 初回：対面の会話（1行ずつ）→ 戦闘。2回目から：短い会話（1タップ）→ 戦闘
 *  - 戦闘はサーバー（event_duo）。バトルビューアで再生 → 勝敗の会話 → 結果
 *  - 初勝利で称号【双星を越えし者】
 */
const DUO = { busy: false };
function duoBusy() { return DUO.busy; }
function duoAvailable() { return typeof storySeen === 'function' && storySeen(DUO_EVENT.need); }
function duoRecord() {
    const d = (typeof serverState !== 'undefined' && serverState.meta && serverState.meta.duo) || {};
    return { tries: d.tries | 0, wins: d.wins | 0, losses: d.losses | 0 };
}

/** 闘技場の入口カード */
function duoCardHtml() {
    if (!duoAvailable()) return '';
    const r = duoRecord();
    return `<div class="duo-card">
        <div class="duo-faces" aria-hidden="true"><img src="img/npc/mihal-face.webp" alt=""><img src="img/npc/klaus-face.webp" alt=""></div>
        <div class="duo-main">
            <div class="duo-eyebrow">イベントバトル</div>
            <div class="duo-title">最強コンビに挑む</div>
            <div class="duo-sub"><span>ミハル＆クラウス</span>　<span>パーティAで挑みます</span></div>
            <div class="duo-note">何度でも挑戦できます。寿命・SS・MMR は変わりません</div>
            ${r.tries ? `<div class="duo-rec"><span>挑戦 ${r.tries} 回</span>　<span>勝利 ${r.wins} 回</span></div>` : ''}
        </div>
        <button type="button" class="btn duo-go" onclick="duoStart()">挑む</button>
    </div>`;
}

function duoStart() {
    if (DUO.busy) return;
    if (typeof arenaPartyAEmpty === 'function' && arenaPartyAEmpty()) {
        if (typeof fxToast === 'function') fxToast('<b>パーティAに冒険者がいません</b>', { tone: 'ink', key: 'duo' });
        return;
    }
    DUO.busy = true;
    if (duoRecord().tries === 0) storyOpen('duo_meet', { onDone: duoFight });
    else duoShort('retry', { button: '挑む', pose: 'battle', onDone: duoFight });
}

async function duoFight() {
    let r;
    try { r = await serverCall('event_duo', {}); } catch (e) { r = { ok: false, message: '通信に失敗しました' }; }
    if (!r || !r.ok) {
        DUO.busy = false;
        if (typeof fxToast === 'function') fxToast('<b>' + esc((r && r.message) || '挑戦できませんでした') + '</b>', { tone: 'ink', key: 'duo' });
        return;
    }
    const res = r.result;
    const myName = (typeof myTitledName === 'function' && myTitledName()) || (typeof T === 'function' ? T('パーティA') : 'パーティA');
    bvOpen({ units: res.battle.units, log: res.battle.log, mySide: 'A', title: '最強コンビ', win: res.win, rounds: res.rounds,
        sideNames: { A: myName, B: typeof T === 'function' ? T('ミハル＆クラウス') : 'ミハル＆クラウス' },
        onClose: () => duoAfter(res) });
}

/** 勝敗の会話 → （初勝利なら称号）→ 結果 */
function duoAfter(res) {
    const next = () => duoResult(res);
    if (res.win) {
        if (res.firstWin) storyOpen('duo_win1', { onDone: () => duoTitleAward(res.title || DUO_EVENT.title, next) });
        else duoShort('rewin', { onDone: next });
    } else if (res.firstLoss) storyOpen('duo_lose1', { onDone: next });
    else duoShort('lose', { rounds: res.rounds, onDone: next });
}

/* ---------- 1タップで進む短い会話 ---------- */
function duoShort(kind, opts) {
    opts = opts || {};
    const lines = duoShortLines(kind, opts.rounds | 0);
    const pose = opts.pose || 'stand';
    const ov = document.createElement('div');
    ov.id = 'duo-short'; ov.className = 'scq fx-overlay fx-in';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '最強コンビ');
    const fig = c => `<div class="scq-fig ${c}"><img src="${STORY_CAST[c][pose] || STORY_CAST[c].stand}" alt="" decoding="async"></div>`;
    ov.innerHTML = `<div class="sc-bg" aria-hidden="true">${STORY_BGS.arena}</div>
        <div class="scq-cast" aria-hidden="true">${fig('k')}${fig('m')}</div>
        <div class="scq-box">
            <div class="scq-eyebrow">闘技場イベント　最強コンビ</div>
            ${lines.map(l => l[0] === 'n'
                ? `<p class="scq-n" data-no-i18n>${esc(storyQuote('n', l[1]))}</p>`
                : `<p class="scq-l ${l[0]}"><b>${esc(typeof T === 'function' ? T(storyWhoName(l[0])) : storyWhoName(l[0]))}</b><span data-no-i18n>${esc(storyQuote(l[0], l[1]))}</span></p>`).join('')}
            <button type="button" class="btn scq-go">${esc(opts.button || '次へ')}</button>
        </div>`;
    const t0 = Date.now();
    const go = () => {
        if (Date.now() - t0 < 350 || !ov.isConnected) return;
        document.removeEventListener('keydown', key);
        ov.classList.remove('fx-in'); ov.classList.add('out');
        setTimeout(() => { ov.remove(); if (opts.onDone) opts.onDone(); }, 280);
    };
    const key = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); go(); } };
    ov.addEventListener('click', go);
    document.addEventListener('keydown', key);
    document.body.appendChild(ov);
}

/* ---------- 称号の獲得 ---------- */
function duoTitleAward(titleId, onDone) {
    const name = titleNameOf(titleId);
    const en = typeof I18N !== 'undefined' && I18N.lang === 'en';
    const ov = document.createElement('div');
    ov.id = 'title-award'; ov.className = 'ttl-award fx-overlay fx-in';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const tn = typeof T === 'function' ? T(name) : name;
    ov.innerHTML = `<div class="ta-card" data-no-i18n>
        <div class="ta-eyebrow">${en ? 'TITLE EARNED' : '称号獲得'}</div>
        <div class="ta-line">${en ? 'You earned the title' : '称号'}</div>
        <div class="ta-name">【${esc(tn)}】</div>
        <div class="ta-line">${en ? '' : 'を獲得した'}</div>
        <div class="ta-note">${en ? 'It now appears before your adventurer name.' : '冒険者名の前に表示されます'}</div>
        <div class="ta-tap">${en ? 'Tap to continue' : 'タップで進む'}</div></div>`;
    if (typeof fxSound === 'function') { try { fxSound('fanfare'); } catch (e) { /* 無視 */ } }
    const t0 = Date.now();
    ov.addEventListener('click', () => {
        if (Date.now() - t0 < 900) return;
        ov.classList.remove('fx-in'); ov.classList.add('out');
        setTimeout(() => { ov.remove(); if (typeof renderHomePlayer === 'function') renderHomePlayer(); if (onDone) onDone(); }, 300);
    });
    document.body.appendChild(ov);
}

/* ---------- 結果 ---------- */
function duoResult(res) {
    const rec = res.record || duoRecord();
    const ov = document.createElement('div');
    ov.id = 'duo-result'; ov.className = 'fx-overlay fx-in duo-result';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = `<div class="fx-card duo-res-card">
        <div class="gate-eyebrow">イベントバトル　最強コンビ</div>
        <div class="duo-res ${res.win ? 'win' : 'lose'}">${res.win ? '勝利' : '敗北'}</div>
        <div class="duo-res-sub"><span>${res.rounds | 0} ラウンド</span></div>
        <div class="duo-rec"><span>挑戦 ${rec.tries} 回</span>　<span>勝利 ${rec.wins} 回</span></div>
        <p class="hint">寿命・SS・MMR は変わりません</p>
        <div class="duo-res-btns"><button type="button" class="btn" onclick="duoResultClose(true)">もう一度挑む</button>
        <button type="button" class="btn btn-blue" onclick="duoResultClose(false)">闘技場へ戻る</button></div></div>`;
    document.body.appendChild(ov);
    ov.style.display = 'flex';
}
function duoResultClose(again) {
    const ov = document.getElementById('duo-result');
    if (ov) ov.remove();
    DUO.busy = false;
    if (typeof arenaRender === 'function') arenaRender();
    if (typeof renderHomePlayer === 'function') renderHomePlayer();
    if (again) setTimeout(duoStart, 120);
}
