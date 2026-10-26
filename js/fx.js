/* ===== P9.13.0 報酬演出：演出キュー・朱印・トースト・効果音・数値の増減 =====
 * サーバーの応答を反映する前後で状態を比べ（fxSnapshot / fxDiff）、操作ごとに演出を選ぶ（fxAfterOp）。
 * 遠征の演出だけはログの再生が終わるまで待つ（fxReleaseDeferred は batch-ui.js から呼ぶ）。
 */
const FX_KEY = 'gambit_fx_v1';
const fxSettings = (function () {
    const d = { sound: true, motion: 'full' };
    try {
        const v = JSON.parse(localStorage.getItem(FX_KEY) || 'null');
        if (v && typeof v === 'object') {
            if (typeof v.sound === 'boolean') d.sound = v.sound;
            if (v.motion === 'full' || v.motion === 'lite') d.motion = v.motion;
        }
    } catch (e) { /* 保存なしでも動く */ }
    return d;
})();
function fxSaveSettings() { try { localStorage.setItem(FX_KEY, JSON.stringify(fxSettings)); } catch (e) { /* 無視 */ } }
/** 控えめ演出（設定、または OS の「視差効果を減らす」） */
function fxLite() {
    if (fxSettings.motion === 'lite') return true;
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
function fxEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fxFmt(n) { return Math.round(Number(n) || 0).toLocaleString('ja-JP'); }

/* ================= 効果音（WebAudio で合成。音声ファイルは使わない） ================= */
let __fxAc = null;
function fxAudio(force) {
    if (!fxSettings.sound && !force) return null;
    try {
        if (!__fxAc) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            __fxAc = new AC();
        }
        if (__fxAc.state === 'suspended') __fxAc.resume();
        return __fxAc;
    } catch (e) { return null; }
}
// iOS などは「ユーザー操作の中」で一度鳴らす準備をしないと音が出ない
function fxUnlockAudio() { if (fxSettings.sound) fxAudio(); }
if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', fxUnlockAudio, { passive: true });
    document.addEventListener('keydown', fxUnlockAudio);
}
function fxTone(ac, freq, t0, dur, type, gain, freqEnd) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
}
function fxNoise(ac, t0, dur, gain, type, freq) {
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 900;
    const g = ac.createGain(); g.gain.value = gain || 0.3;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t0);
}
const FX_SOUNDS = {
    stamp(ac, t) { fxNoise(ac, t, 0.09, 0.5, 'lowpass', 700); fxTone(ac, 130, t, 0.18, 'sine', 0.35, 55); },
    paper(ac, t) { fxNoise(ac, t, 0.16, 0.12, 'highpass', 2500); },
    chime(ac, t) { fxTone(ac, 880, t, 0.5, 'triangle', 0.12); fxTone(ac, 1318.5, t + 0.09, 0.7, 'triangle', 0.1); },
    coin(ac, t) { fxTone(ac, 1567.98, t, 0.09, 'square', 0.05); fxTone(ac, 2093, t + 0.07, 0.22, 'square', 0.05); },
    levelup(ac, t) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => fxTone(ac, f, t + i * 0.07, 0.28, 'triangle', 0.11)); },
    unlock(ac, t) { fxTone(ac, 659.25, t, 0.25, 'triangle', 0.1); fxTone(ac, 987.77, t + 0.1, 0.5, 'triangle', 0.1); fxNoise(ac, t + 0.1, 0.25, 0.05, 'highpass', 5000); },
    fanfare(ac, t) {
        [523.25, 659.25, 783.99].forEach((f, i) => fxTone(ac, f, t + i * 0.11, 0.22, 'sawtooth', 0.05));
        fxTone(ac, 1046.5, t + 0.36, 0.9, 'triangle', 0.13); fxTone(ac, 783.99, t + 0.36, 0.9, 'triangle', 0.07);
    },
    bell(ac, t) { fxTone(ac, 392, t, 1.4, 'sine', 0.12); fxTone(ac, 784, t, 0.8, 'sine', 0.04); },
    fail(ac, t) { [392, 311.13, 261.63].forEach((f, i) => fxTone(ac, f, t + i * 0.16, 0.35, 'triangle', 0.08)); }
};
function fxSound(name) {
    const ac = fxAudio();
    if (!ac || !FX_SOUNDS[name]) return;
    try { FX_SOUNDS[name](ac, ac.currentTime + 0.01); } catch (e) { /* 鳴らなくても進める */ }
}

/* ================= 数値のカウントアップ ================= */
function fxCount(el, from, to, ms) {
    if (!el) return;
    if (fxLite() || from === to || typeof requestAnimationFrame !== 'function') { el.textContent = fxFmt(to); return; }
    const t0 = performance.now(), dur = ms || 700;
    const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fxFmt(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
/** 表示中の数値を新しい値へ（増えたときは「+N」を浮かせる） */
function fxSetNumber(el, v, opts) {
    if (!el) return;
    const prev = el.dataset.v != null ? Number(el.dataset.v) : null;
    el.dataset.v = String(v);
    if (prev == null || prev === v) { el.textContent = fxFmt(v); return; }
    fxCount(el, prev, v, 650);
    if (opts && opts.float && v > prev && !fxLite()) fxFloat(el, '+' + fxFmt(v - prev));
}
function fxFloat(anchor, text) {
    try {
        const r = anchor.getBoundingClientRect();
        if (!r.width) return;
        const f = document.createElement('div');
        f.className = 'fx-float';
        f.textContent = text;
        f.style.left = Math.round(r.left + r.width / 2) + 'px';
        f.style.top = Math.round(r.top + r.height * 0.55 + window.scrollY) + 'px';
        document.body.appendChild(f);
        setTimeout(() => f.remove(), 1300);
    } catch (e) { /* 無視 */ }
}

/* ================= トースト（流れていく小さな通知） ================= */
function fxToast(html, opts) {
    opts = opts || {};
    let box = document.getElementById('fx-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'fx-toasts'; box.className = 'fx-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    if (opts.key) box.querySelectorAll('[data-key="' + opts.key + '"]').forEach(x => x.remove());
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    if (opts.key) t.dataset.key = opts.key;
    t.className = 'fx-toast fx-tone-' + (opts.tone || 'ink');
    t.innerHTML = /fx-toast-fig/.test(html) ? html : '<span class="fx-toast-main">' + html + '</span>';
    box.appendChild(t);
    const hide = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 260); };
    t.addEventListener('click', hide);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(hide, opts.ms || (fxLite() ? 2200 : 3000));
    if (opts.sound) fxSound(opts.sound);
}

/* ================= 演出カード（順番に1枚ずつ表示） ================= */
const fxQueue = [];
let fxCur = null, fxOpenedAt = 0;
/**
 * card: { eyebrow, title, sub, figure(html), count:{label,from,to,unit}, body(html), stamp, stampTone:'red'|'ink',
 *         tone:'red'|'ink'|'gold', sound, rays, important }
 * 控えめ演出のときは important でないカードをトーストにする
 */
function fxPush(card) {
    if (!card) return;
    if (fxLite() && !card.important) {
        fxToast(`<b>${card.eyebrow ? fxEsc(card.eyebrow) + '　' : ''}${card.title}</b>${card.toastText ? '<span>' + card.toastText + '</span>' : ''}`, { tone: card.tone === 'ink' ? 'ink' : 'red', sound: card.sound });
        return;
    }
    fxQueue.push(card);
    if (!fxCur) fxNext(); else fxRenderActions();
}
/** 表示中のカードのボタン（次へ／閉じる、残り件数）を描き直す */
function fxRenderActions() {
    const el = document.getElementById('fx-overlay');
    const box = el && el.querySelector('.fx-actions');
    if (!box) return;
    const rest = fxQueue.length;
    box.innerHTML = (rest ? '<button type="button" class="btn btn-blue fx-skip">すべて閉じる</button>' : '')
        + `<button type="button" class="btn fx-ok">${rest ? '次へ（あと' + rest + '件）' : '閉じる'}</button>`;
    box.querySelector('.fx-ok').onclick = fxAdvance;
    const sk = box.querySelector('.fx-skip'); if (sk) sk.onclick = () => { fxOpenedAt = 0; fxCloseAll(); };
}
function fxNext() {
    fxCur = fxQueue.shift() || null;
    const el = document.getElementById('fx-overlay');
    if (!fxCur) { if (el) { el.classList.remove('fx-in'); el.style.display = 'none'; el.innerHTML = ''; } document.removeEventListener('keydown', fxKey); return; }
    fxRender(fxCur);
}
function fxAdvance() { if (Date.now() - fxOpenedAt < 350) return; fxNext(); }
function fxCloseAll() { fxQueue.length = 0; fxNext(); }
function fxKey(e) {
    if (!fxCur) return;
    if (e.key === 'Escape') { e.preventDefault(); fxCloseAll(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fxAdvance(); }
}
function fxRender(c) {
    let el = document.getElementById('fx-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'fx-overlay'; el.className = 'fx-overlay';
        el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
        el.addEventListener('click', e => { if (e.target === el) fxAdvance(); });
        document.body.appendChild(el);
    }
    const lite = fxLite(), rest = fxQueue.length;
    const count = c.count ? `<div class="fx-count"><span class="fx-count-label">${fxEsc(c.count.label || '')}</span><b class="fx-count-num">${fxFmt(lite ? c.count.to : (c.count.from || 0))}</b><span class="fx-count-unit">${fxEsc(c.count.unit || 'SS')}</span></div>` : '';
    el.innerHTML = `<div class="fx-card fx-card-${c.tone || 'red'}${lite ? ' fx-lite' : ''}" aria-labelledby="fx-title">
        ${c.rays && !lite ? '<div class="fx-rays" aria-hidden="true"></div>' : ''}
        ${c.eyebrow ? `<div class="fx-eyebrow">${fxEsc(c.eyebrow)}</div>` : ''}
        ${c.figure ? `<div class="fx-figure">${c.figure}</div>` : ''}
        <div class="fx-title" id="fx-title">${c.title}</div>
        ${c.sub ? `<div class="fx-sub">${c.sub}</div>` : ''}
        ${count}
        ${c.body ? `<div class="fx-body">${c.body}</div>` : ''}
        ${c.stamp ? `<div class="fx-stamp fx-stamp-${c.stampTone || 'red'}${lite ? ' on' : ''}" aria-hidden="true"><span>${fxEsc(c.stamp)}</span></div>` : ''}
        <div class="fx-actions"></div>
    </div>`;
    el.style.display = 'flex';
    fxRenderActions();
    document.removeEventListener('keydown', fxKey);
    document.addEventListener('keydown', fxKey);
    fxOpenedAt = Date.now();
    try { el.querySelector('.fx-ok').focus({ preventScroll: true }); } catch (e) { /* 無視 */ }
    if (c.sound) fxSound(c.sound);
    if (lite) { el.classList.add('fx-in'); return; }
    el.classList.remove('fx-in');
    void el.offsetWidth;
    el.classList.add('fx-in');
    const st = el.querySelector('.fx-stamp');
    const card = el.querySelector('.fx-card');
    const num = el.querySelector('.fx-count-num');
    const startCount = () => { if (num && c.count) { fxCount(num, c.count.from || 0, c.count.to, 800); if (c.count.to > (c.count.from || 0)) fxSound('coin'); } };
    if (st) {
        setTimeout(() => {
            if (fxCur !== c) return;
            st.classList.add('on'); card.classList.add('fx-thud'); fxSound('stamp');
            setTimeout(startCount, 180);
        }, 420);
    } else setTimeout(startCount, 300);
}

/* ================= 図版 ================= */
function fxAccIcon(defId) {
    const id = String(defId || '');
    const kind = /_band$/.test(id) ? 'band' : (/_ring$/.test(id) ? 'ring' : 'charm');
    const path = kind === 'band' ? '<rect x="5" y="9" width="22" height="14" rx="7" fill="none" stroke="currentColor" stroke-width="3"/><rect x="11" y="13" width="10" height="6" rx="3" fill="currentColor" opacity=".35"/>'
        : kind === 'ring' ? '<circle cx="16" cy="19" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 9l4-5 4 5-4 3z" fill="currentColor"/>'
        : '<path d="M16 4c5 6 9 10 9 15a9 9 0 0 1-18 0c0-5 4-9 9-15z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="16" cy="19" r="3" fill="currentColor"/>';
    return `<svg class="fx-acc-icon" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">${path}</svg>`;
}
function fxIcon(kind) {
    const P = {
        rule: '<path d="M6 8h20M6 16h20M6 24h12" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="25" cy="24" r="4" fill="currentColor"/>',
        unlock: '<rect x="7" y="14" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M11 14V9a5 5 0 0 1 9.5-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
        gate: '<path d="M5 28V12l11-7 11 7v16" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M12 28v-8h8v8" fill="none" stroke="currentColor" stroke-width="3"/>',
        coin: '<ellipse cx="16" cy="11" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 11v10c0 2.2 4.5 4 10 4s10-1.8 10-4V11" fill="none" stroke="currentColor" stroke-width="3"/>',
        expand: '<path d="M6 12V6h6M26 12V6h-6M6 20v6h6M26 20v6h-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
        prayer: '<path d="M16 3l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor"/>'
    };
    return `<svg class="fx-icon" viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">${P[kind] || P.unlock}</svg>`;
}
function fxStandees(list, size, opts) {
    opts = opts || {};
    if (typeof standeeHtml !== 'function') return '';
    return `<div class="fx-standees${opts.fallen ? ' fallen' : ''}">` + list.map(ch => standeeHtml(ch, size || 'sm')).join('') + '</div>';
}

/* ================= 状態の写しと差分 ================= */
const FX_STATS = [['maxHp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['int', 'INT'], ['mnd', 'MND'], ['agi', 'AGI'], ['dex', 'DEX']];
function fxSnapshot() {
    try {
        const chars = {};
        (yardChars || []).forEach(c => {
            const o = { id: c.id, name: c.name, classId: c.classId, level: c.level || 1, lifespan: c.lifespan, rarity: c.rarity || 'normal',
                initBonus: c.initBonus || {}, growthBonus: c.growthBonus || {} };
            FX_STATS.forEach(([k]) => { o[k] = c[k] | 0; });
            chars[c.id] = o;
        });
        const retired = {};
        (retiredChars || []).forEach(c => { retired[c.id] = { id: c.id, name: c.name, classId: c.classId, level: c.level || 1, lifespan: 0, reason: c.retireReason || 'lifespan' }; });
        const u = accountUnlocks || {};
        const accs = {};
        (accessories || []).forEach(a => { accs[a.id] = { id: a.id, defId: a.defId, level: a.level || 1 }; });
        const chal = [];
        if (typeof DUNGEON_DEFS !== 'undefined' && typeof isChallengeStageUnlocked === 'function') {
            Object.keys(DUNGEON_DEFS).forEach(d => (DUNGEON_DEFS[d].stages || []).forEach(s => {
                if (s.challengeUnlock && isChallengeStageUnlocked(d, s.id)) chal.push(d + ':' + s.id);
            }));
        }
        const lv10 = !!u.lv10Reached;
        return {
            ss: getResource(), chars, retired, accs, chal, lv10,
            conds: Array.isArray(u.conditions) ? u.conditions.slice() : null,
            tgts: Array.isArray(u.targets) ? u.targets.slice() : null,
            accTypes: (u.accessories || []).slice(),
            cleared: Object.keys(u.stageCleared || {}),
            rowLimit: typeof getRuleRowLimit === 'function' ? getRuleRowLimit() : 0,
            yardCap: typeof yardCap === 'function' ? yardCap() : 0,
            partySets: typeof partySetCount === 'function' ? partySetCount() : 0,
            adPoints: u.adPoints | 0,
            partyIds: (partyIds || []).slice()
        };
    } catch (e) { return null; }
}
function fxNewIn(a, b) { const s = new Set(a || []); return (b || []).filter(x => !s.has(x)); }
function fxDiff(a, b) {
    const d = { levelUps: [], joined: [], retiredNew: [], extracted: [], accsNew: [], accUp: [] };
    Object.keys(b.chars).forEach(id => {
        const x = a.chars[id], y = b.chars[id];
        if (!x) { d.joined.push(y); return; }
        if (y.level > x.level) {
            const stats = [];
            FX_STATS.forEach(([k, label]) => { const diff = (y[k] | 0) - (x[k] | 0); if (diff > 0) stats.push({ k, label, diff, to: y[k] }); });
            let newSkills = [];
            if (typeof skillsForClass === 'function') {
                newSkills = skillsForClass(y.classId, y.level).filter(s => s.unlockLevel > x.level && s.unlockLevel <= y.level).map(s => s.name);
            }
            d.levelUps.push({ ch: y, from: x.level, to: y.level, stats, newSkills });
        }
    });
    Object.keys(b.retired).forEach(id => { if (!a.retired[id]) d.retiredNew.push(Object.assign({}, a.chars[id] || {}, b.retired[id])); });
    Object.keys(a.retired).forEach(id => { if (!b.retired[id]) d.extracted.push(a.retired[id]); });
    Object.keys(b.accs).forEach(id => {
        const x = a.accs[id], y = b.accs[id];
        if (!x) d.accsNew.push(y);
        else if (y.level > x.level) d.accUp.push({ id, defId: y.defId, from: x.level, to: y.level });
    });
    d.condsNew = (a.conds && b.conds) ? fxNewIn(a.conds, b.conds) : [];
    d.tgtsNew = (a.tgts && b.tgts) ? fxNewIn(a.tgts, b.tgts) : [];
    d.accTypesNew = fxNewIn(a.accTypes, b.accTypes);
    d.clearedNew = fxNewIn(a.cleared, b.cleared);
    d.chalNew = fxNewIn(a.chal, b.chal);
    d.lv10New = !a.lv10 && b.lv10;
    d.rowLimit = { from: a.rowLimit, to: b.rowLimit };
    d.yardCap = { from: a.yardCap, to: b.yardCap };
    d.partySets = { from: a.partySets, to: b.partySets };
    d.adPoints = { from: a.adPoints, to: b.adPoints };
    d.ss = { from: a.ss, to: b.ss };
    d.partyEmptied = a.partyIds.length > 0 && b.partyIds.length === 0;
    return d;
}

/* ================= 名前の引き当て ================= */
function fxStageName(key) {
    const p = String(key).split(':');
    const dg = typeof getDungeon === 'function' ? getDungeon(p[0]) : null;
    const st = typeof getStage === 'function' ? getStage(p[0], p[1]) : null;
    const md = p[2] && typeof MODE_DEFS !== 'undefined' && MODE_DEFS[p[2]] ? MODE_DEFS[p[2]].name : '';
    return { dungeon: dg ? dg.name : p[0], stage: st ? st.name : (p[1] || ''), mode: md, modeId: p[2] || '' };
}
function fxAccName(defId) { const d = typeof getAccessoryDef === 'function' ? getAccessoryDef(defId) : null; return d ? d.name : defId; }
function fxAccEffect(defId, lv) {
    try { return formatAccessoryEffects(accessoryEffectsAtLevel(defId, lv || 1)); } catch (e) { return ''; }
}
function fxClassName(classId) { return (typeof CLASS_DEFS !== 'undefined' && CLASS_DEFS[classId]) ? CLASS_DEFS[classId].name : classId; }

/* ================= 解放系のまとめ（どの操作の後でも起こりうるもの） ================= */
function fxUnlockFollowups(d, skip) {
    skip = skip || {};
    const cards = [];
    if (d.rowLimit.to > d.rowLimit.from && !skip.rows) {
        const why = d.lv10New ? 'はじめてレベル10に到達した' : (d.clearedNew.indexOf(RULE_ROWS_B2_KEY) >= 0 ? 'はじまりの迷宮（チャレンジ）B2 を初踏破した' : '条件を満たした');
        cards.push({ eyebrow: 'バトルルール', title: 'ルールの行がひとつ増えた', figure: fxIcon('rule'),
            sub: `${why}`, body: `<p>使える行 <b>${d.rowLimit.from} → ${d.rowLimit.to}</b>（最大 ${typeof RULE_ROWS_MAX !== 'undefined' ? RULE_ROWS_MAX : 5}）</p><p class="fx-note">「バトルルール編集」で新しい行を使えます。</p>`,
            toastText: `使える行 ${d.rowLimit.from} → ${d.rowLimit.to}`, stamp: '解放', sound: 'unlock' });
    }
    if (d.lv10New && !skip.shop) {
        const shop = (typeof ACCESSORY_UNLOCK_DEFS !== 'undefined') ? Object.keys(ACCESSORY_UNLOCK_DEFS).filter(k => ACCESSORY_UNLOCK_DEFS[k].source === 'shop').map(fxAccName) : [];
        if (shop.length) cards.push({ eyebrow: 'アクセサリー', title: '拠点で買えるようになった', figure: fxIcon('unlock'),
            body: `<p>${shop.map(fxEsc).join('・')}</p><p class="fx-note">「強化 → アクセサリー」から購入できます。</p>`,
            toastText: shop.join('・'), stamp: '解放', sound: 'unlock' });
    }
    d.tgtsNew.forEach(name => cards.push({ eyebrow: 'バトルルール 対象', title: `「${fxEsc(name)}」`, figure: fxIcon('unlock'),
        body: '<p class="fx-note">「バトルルール編集」で選べるようになりました。</p>', stamp: '習得', sound: 'unlock' }));
    if (!skip.chal) d.chalNew.forEach(k => {
        const n = fxStageName(k);
        cards.push({ eyebrow: 'チャレンジ', title: `${fxEsc(n.dungeon)} ${fxEsc(n.stage)}`, figure: fxIcon('gate'),
            body: '<p>チャレンジに挑めるようになった。</p><p class="fx-note">撤退できない代わりに、失敗プールや踏破報酬があります。</p>', stamp: '解放', sound: 'unlock' });
    });
    return cards;
}

/* ================= 操作ごとの演出 ================= */
const fxDeferred = [];
function fxAfterOp(op, params, res, a, b) {
    if (!a || !b) return;
    let d;
    try { d = fxDiff(a, b); } catch (e) { return; }
    const result = (res && res.result) || {};
    switch (op) {
        case 'level_up': return fxOnLevelUp(d);
        case 'recruit_join': return d.joined.forEach(ch => fxPush(fxRecruitCard(ch)));
        case 'retire': return fxOnRetire(d);
        case 'extract': return fxOnExtract(d, result);
        case 'unlock': return fxOnUnlock(d, params || {}, result);
        case 'accessory_upgrade':
            return d.accUp.forEach(u => fxToast(`<b>${fxEsc(u.id && typeof accessoryLabel === 'function' ? accessoryLabel(u.id, { noLv: true }) : fxAccName(u.defId))}　Lv${u.from} → Lv${u.to}</b><span>${fxEsc(fxAccEffect(u.defId, u.to))}</span>`, { tone: 'red', sound: 'levelup' }));
        case 'ad_claim':
            return fxToast(`<b>${fxEsc(typeof AD_POINT_NAME !== 'undefined' ? AD_POINT_NAME : '祈りの欠片')} +${(d.adPoints.to - d.adPoints.from) || 1}</b><span>所持 ${d.adPoints.to}` + (result.today ? `・本日 ${result.today}/${result.limit} 回` : '') + '</span>', { tone: 'gold', sound: 'chime' });
        case 'ad_shop': return fxOnAdShop(d);
        case 'run_expedition': {
            const cards = fxExpeditionCards(d, result);
            cards.forEach(c => fxDeferred.push(c));
            return;
        }
        default: return;
    }
}
/** 遠征ログの再生が終わったら（または画面を移ったら）出す */
function fxReleaseDeferred(delayMs) {
    if (!fxDeferred.length) return;
    const list = fxDeferred.splice(0, fxDeferred.length);
    const go = () => list.forEach(c => fxPush(c));
    if (delayMs) setTimeout(go, delayMs); else go();
}

function fxOnLevelUp(d) {
    d.levelUps.forEach(u => {
        const stats = u.stats.map(s => `<span class="fx-stat">${s.label}<b>+${s.diff}</b></span>`).join('');
        const milestone = u.newSkills.length || u.to >= (typeof PLAYER_LEVEL_CAP !== 'undefined' ? PLAYER_LEVEL_CAP : 20);
        if (milestone) {
            const cap = u.to >= (typeof PLAYER_LEVEL_CAP !== 'undefined' ? PLAYER_LEVEL_CAP : 20);
            let body = `<div class="fx-stats">${stats}</div>`;
            if (u.newSkills.length) body += `<p>新しいアクション <b>${u.newSkills.map(fxEsc).join('・')}</b> を覚えた。</p><p class="fx-note">「バトルルール編集」でルールに組み込みましょう。</p>`;
            if (cap) body += '<p>最大レベルに到達した。引退時の抜き出し倍率も最大になります。</p>';
            fxPush({ eyebrow: cap ? '最大レベル' : 'レベルアップ', title: fxEsc(u.ch.name), sub: `<span class="fx-lv">Lv${u.from} → <b class="fx-big">Lv${u.to}</b></span>`,
                figure: `<div class="fx-hop">${standeeHtml(u.ch, 'md')}</div>`, body, stamp: cap ? '極' : '成長', sound: 'levelup', rays: cap,
                toastText: u.newSkills.length ? '新アクション: ' + u.newSkills.join('・') : '' });
        } else {
            fxToast(`<span class="fx-toast-fig">${standeeHtml(u.ch, 'sm')}</span><span class="fx-toast-main"><b>${fxEsc(u.ch.name)}　Lv${u.from} → Lv${u.to}</b><span class="fx-stats">${stats}</span></span>`, { tone: 'red', sound: 'levelup', key: 'lv-' + u.ch.id });
            fxFlashStandee(u.ch.id);
        }
    });
    fxUnlockFollowups(d).forEach(fxPush);
}
/** 画面上の同じキャラの駒を小さく跳ねさせる */
function fxFlashStandee(id) {
    if (fxLite()) return;
    try {
        document.querySelectorAll('[data-stand-id="' + id + '"]').forEach(el => {
            el.classList.remove('fx-jump'); void el.offsetWidth; el.classList.add('fx-jump');
        });
    } catch (e) { /* 無視 */ }
}
function fxRecruitCard(ch) {
    const rar = (typeof RARITY_DEFS !== 'undefined' && RARITY_DEFS[ch.rarity]) ? RARITY_DEFS[ch.rarity] : { id: 'normal', name: 'ノーマル' };
    const bonus = typeof bonusSummaryText === 'function' ? bonusSummaryText(ch) : '';
    const full = (partyIds || []).length >= (typeof MAX_PARTY !== 'undefined' ? MAX_PARTY : 4);
    return {
        eyebrow: `${rar.name}　契約成立`, title: fxEsc(ch.name), sub: fxEsc(fxClassName(ch.classId)),
        figure: `<div class="fx-rise">${standeeHtml(ch, 'lg')}</div>`,
        body: (bonus ? `<p class="fx-bonus">${fxEsc(bonus)}</p>` : '') + `<p class="fx-note">${full ? 'ヤードで待機します。' : '「パーティ編集」で出撃メンバーに加えられます。'}</p>`,
        stamp: '契約', tone: rar.id === 'ur' ? 'gold' : 'red', rays: rar.id !== 'normal',
        sound: rar.id === 'ur' ? 'fanfare' : (rar.id === 'rare' ? 'chime' : 'paper'), important: rar.id === 'ur'
    };
}
function fxOnRetire(d) {
    d.retiredNew.forEach(r => {
        fxToast(`<span class="fx-toast-fig fallen">${standeeHtml(Object.assign({}, r, { lifespan: 0 }), 'sm')}</span><span class="fx-toast-main"><b>${fxEsc(r.name)} が引退しました</b><span>パーティ編集の下の「引退したキャラ」からSSを抜き出せます</span></span>`, { tone: 'ink', sound: 'bell', ms: 4000 });
    });
    if (d.partyEmptied) fxToast('<b>パーティが空になりました</b><span>パーティ編集で出撃メンバーを選んでください</span>', { tone: 'ink', ms: 4000 });
}
function fxOnExtract(d, r) {
    const who = d.extracted[0] || { name: r.name };
    const body = (r.total > 0)
        ? `<p>成長に使ったSS ${fxFmt(r.held)} × ${Number(r.mult || 0).toFixed(2)} = ${fxFmt(r.base)}${r.dice ? `　＋ ダイス <b>${r.dice}</b>` : ''}</p>`
        : '<p>Lv1 のため抜き出せるSSはありませんでした。</p>';
    fxPush({ eyebrow: '精算', title: `${fxEsc(who.name)} から抜き出した`, figure: fxIcon('coin'),
        count: { label: '受取', from: 0, to: r.total | 0, unit: 'SS' }, body: body + '<p class="fx-note">ヤードの枠がひとつ空きました。</p>',
        stamp: '済', sound: 'paper', toastText: `+${fxFmt(r.total)} SS` });
}
function fxOnUnlock(d, p, r) {
    if (p.kind === 'cond' || p.kind === 'tgt') {
        const names = p.kind === 'cond' ? d.condsNew : d.tgtsNew;
        (names.length ? names : [p.id]).forEach(name => fxPush({
            eyebrow: p.kind === 'cond' ? 'バトルルール 条件' : 'バトルルール 対象', title: `「${fxEsc(name)}」`, figure: fxIcon('unlock'),
            body: '<p class="fx-note">「バトルルール編集」で選べるようになりました。</p>' + (r.cost ? `<p class="fx-cost">−${fxFmt(r.cost)} SS</p>` : ''),
            stamp: '解放', sound: 'unlock' }));
        return;
    }
    if (p.kind === 'acc') {
        const got = d.accsNew[0];
        const defId = got ? got.defId : p.id;
        const cnt = (typeof accessories !== 'undefined' && Array.isArray(accessories)) ? accessories.filter(a => a.defId === defId).length : 1;
        if (d.accTypesNew.length || r.newly) {
            fxPush({ eyebrow: 'アクセサリー', title: fxEsc(fxAccName(defId)), figure: `<div class="fx-acc">${fxAccIcon(defId)}</div>`,
                body: `<p>${fxEsc(fxAccEffect(defId, 1))}</p><p class="fx-note">キャラ詳細の「装備」から付けられます。強化は「強化 → アクセサリー」。</p>`,
                stamp: '入手', sound: 'chime' });
        } else {
            fxToast(`<b>${fxEsc(fxAccName(defId))} Lv1 を購入</b><span>所持 ${cnt} 個</span>`, { tone: 'red', sound: 'coin' });
        }
    }
}
function fxOnAdShop(d) {
    if (d.yardCap.to > d.yardCap.from) fxPush({ eyebrow: '拡張', title: `ヤード枠 +${d.yardCap.to - d.yardCap.from}`, figure: fxIcon('expand'),
        body: `<p>上限 ${d.yardCap.from} → <b>${d.yardCap.to}</b> 体</p>`, stamp: '拡張', sound: 'unlock' });
    if (d.partySets.to > d.partySets.from) {
        const letters = [];
        for (let i = d.partySets.from; i < d.partySets.to; i++) letters.push('パーティ' + String.fromCharCode(65 + i));
        fxPush({ eyebrow: '拡張', title: 'パーティ枠 +' + (d.partySets.to - d.partySets.from), figure: fxIcon('expand'),
            body: `<p>${letters.join('・')} が使えるようになりました。</p>`, stamp: '拡張', sound: 'unlock' });
    }
}

/** 遠征の後に出すカード（いつもの踏破では出さない。初めての出来事・入手・引退だけ） */
function fxExpeditionCards(d, result) {
    const cards = [];
    const runs = (result && result.runs) || [];
    // 初踏破（どのパーティで踏破したかを駒で見せる）
    d.clearedNew.forEach(key => {
        const n = fxStageName(key);
        const run = runs.find(r => r.dungeonId + ':' + r.stageId + ':' + r.mode === key) || runs[0];
        const party = run ? (run.partyIds || []).map(id => (yardChars || []).find(c => c.id === id) || (retiredChars || []).find(c => c.id === id)).filter(Boolean) : [];
        const extras = [];
        d.chalNew.forEach(k => { const m = fxStageName(k); extras.push(`チャレンジ「${fxEsc(m.dungeon)} ${fxEsc(m.stage)}」に挑めるようになった`); });
        if (key === (typeof RULE_ROWS_B2_KEY !== 'undefined' ? RULE_ROWS_B2_KEY : '') && d.rowLimit.to > d.rowLimit.from) extras.push(`バトルルールの行がひとつ増えた（${d.rowLimit.from} → ${d.rowLimit.to}）`);
        cards.push({ eyebrow: '初踏破', title: `${fxEsc(n.dungeon)}　${fxEsc(n.stage)}`, sub: fxEsc(n.mode),
            figure: party.length ? fxStandees(party, 'sm') : fxIcon('gate'),
            body: extras.length ? '<ul class="fx-list">' + extras.map(x => `<li>${x}</li>`).join('') + '</ul>' : '<p>はじめてこの階層を踏破した。</p>',
            stamp: '踏破', rays: true, sound: 'fanfare', toastText: extras.join(' / ') });
    });
    const coveredRows = d.clearedNew.indexOf(typeof RULE_ROWS_B2_KEY !== 'undefined' ? RULE_ROWS_B2_KEY : '') >= 0;
    // 入手したアクセサリー（まとめて1枚）
    if (d.accsNew.length) {
        const by = {};
        d.accsNew.forEach(a => { by[a.defId] = (by[a.defId] || 0) + 1; });
        const items = Object.keys(by).map(defId => `<li>${fxAccIcon(defId)}<span>${fxEsc(fxAccName(defId))} Lv1${by[defId] > 1 ? ' ×' + by[defId] : ''}</span>${d.accTypesNew.indexOf(defId) >= 0 ? '<em>NEW</em>' : ''}</li>`).join('');
        cards.push({ eyebrow: '踏破報酬', title: '入手したもの', body: `<ul class="fx-items">${items}</ul><p class="fx-note">キャラ詳細の「装備」から付けられます。</p>`,
            stamp: '入手', sound: 'chime', toastText: Object.keys(by).map(fxAccName).join('・') });
    }
    const runsFull = runs.filter(r => (r.drops || []).some(x => /所持上限/.test(x)));
    if (runsFull.length) cards.push({ eyebrow: '踏破報酬', title: '所持上限のため受け取れなかった', body: '<p class="fx-note">アクセサリーは種類ごとに 99 個までです。</p>', tone: 'ink', stamp: '満', stampTone: 'ink' });
    fxUnlockFollowups(d, { rows: coveredRows, chal: d.clearedNew.length > 0, shop: true }).forEach(c => cards.push(c));
    // 寿命による引退（大事な知らせなので控えめ演出でもカードで出す）
    const gone = d.retiredNew.filter(r => r.reason !== 'manual');
    if (gone.length) {
        cards.push({ eyebrow: '寿命', title: '引退した仲間', figure: fxStandees(gone.map(r => Object.assign({}, r, { lifespan: 0 })), 'sm', { fallen: true }),
            body: `<p>${gone.map(r => fxEsc(r.name) + '（Lv' + r.level + '）').join('、')}</p><p class="fx-note">おつかれさまでした。パーティ編集の下の「引退したキャラ」からSSを抜き出せます。</p>`
                + (d.partyEmptied ? '<p class="fx-warn">パーティが空になりました。パーティ編集で出撃メンバーを選んでください。</p>' : ''),
            tone: 'ink', stamp: '引退', stampTone: 'ink', sound: 'bell', important: true });
    }
    return cards;
}

/* ================= はじめに（初回だけ。設定からもう一度見られる） ================= */
const FX_INTRO_KEY = 'gambit_intro_v1';
const FX_INTRO = [
    { eyebrow: 'はじめに　1 / 3', title: '遠征で SS を稼ぐ', figure: fxIcon('gate'),
      body: '<p>拠点の「遠征」から迷宮へ送り出します。戦闘は自動で進み、勝てば <b>SS（ソウルシャード）</b> を持ち帰ります。</p><p class="fx-note">最初は「はじまりの迷宮 F1」から。テスト実行にチェックを入れると、SSや寿命を減らさずに試せます。</p>' },
    { eyebrow: 'はじめに　2 / 3', title: 'バトルルールで戦い方を決める', figure: fxIcon('rule'),
      body: '<p>キャラごとに「もし〇〇なら → 誰に → 何をする」を並べます。自分の番が来るたびに上の行から順に判定し、最初に当てはまった行を実行します。</p><p class="fx-note">よい並べ方を見つけるのがこのゲームの肝です。</p>' },
    { eyebrow: 'はじめに　3 / 3', title: 'SS で育て、寿命を見届ける', figure: fxIcon('coin'),
      body: '<p>SS でレベルを上げ、ルールの条件や対象を解放します。冒険者には寿命があり、遠征のたびに減っていきます。</p><p class="fx-note">寿命が尽きると引退します。育成に使った SS の一部は抜き出せます。仲間が減ったら「募集」で迎えましょう（無料募集はいつでも使えます）。</p>' }
];
function fxShowIntro() { FX_INTRO.forEach(c => fxPush(Object.assign({ important: true }, c))); }
function fxIntroOnce() {
    try {
        if (localStorage.getItem(FX_INTRO_KEY)) return;
        localStorage.setItem(FX_INTRO_KEY, '1');
    } catch (e) { return; }
    fxShowIntro();
}

/* ================= 設定パネル ================= */
function fxSettingsHtml() {
    return `<div class="fx-settings">
        <label class="fx-switch"><input type="checkbox" id="fx-opt-sound" ${fxSettings.sound ? 'checked' : ''} onchange="fxSetSound(this.checked)"> 効果音</label>
        <label class="fx-switch"><input type="checkbox" id="fx-opt-lite" ${fxSettings.motion === 'lite' ? 'checked' : ''} onchange="fxSetLite(this.checked)"> 演出を控えめにする（カードを出さず短い通知だけ）</label>
        <div><button type="button" class="btn btn-sm btn-blue" onclick="if (typeof closeSettings === 'function') closeSettings(); fxShowIntro();">遊び方をもう一度見る</button>
            ${typeof titleOpen === 'function' ? `<button type="button" class="btn btn-sm btn-blue" onclick="if (typeof closeSettings === 'function') closeSettings(); titleOpen({ replay: true });">導入をもう一度見る</button>` : ''}</div>
    </div>`;
}
function fxSetSound(on) { fxSettings.sound = !!on; fxSaveSettings(); if (on) fxSound('chime'); }
function fxSetLite(on) { fxSettings.motion = on ? 'lite' : 'full'; fxSaveSettings(); }
