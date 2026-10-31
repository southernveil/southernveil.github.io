/**
 * battleview.js — P9.24.0 バトルビューア（横から見た戦闘の再生）
 *  - サーバーが返した戦闘ログ（行動ごとの HP の写しつき）をそのまま再生する。戦闘の計算はしない
 *  - 左に相手、右に自分の側。顔の絵・HPバー・ダメージ／回復の数字・戦闘不能・大きな技名・下に流れるログ
 *  - 速さ（×1 / ×2 / ×4）と「結果へ」。闘技場の対戦ログとイベントバトルで使う（今後の大会でも使える形）
 *
 * bvOpen({ units, log, mySide, title, sideNames: {A, B}, win, rounds, onClose })
 *   units: [{ id, side: 'A'|'B', name, classId, level, maxHp, portrait }]   portrait は立ち絵のキー、または 'npc:mihal' など
 *   log:   [{ round, actor, action, aid, hp: {id: hp}, st: {id: 'pzs'}, x?: 'dot'|'para'|'sleep'|'skip', skill? }]
 */
const BV = { el: null, opts: null, i: 0, hp: {}, st: {}, skip: false, speed: 1, timer: null, wake: null, done: false, round: 0 };
const BV_SPEED_KEY = 'sv_bv_speed';
const BV_ST = { p: '毒', z: '麻痺', s: '睡眠' };

function bvIsOpen() { return !!(BV.el && document.body.contains(BV.el)); }
function bvT(s) { return (typeof T === 'function') ? T(s) : s; }
function bvUnit(id) { return (BV.opts.units || []).find(u => u.id === id) || null; }
function bvNameOf(u) {
    if (!u) return '';
    return (u.portrait && String(u.portrait).indexOf('npc:') === 0) ? bvT(u.name) : u.name;
}
function bvFace(u) {
    const p = String(u.portrait || '');
    if (p.indexOf('npc:') === 0) {
        const c = typeof STORY_CAST !== 'undefined' ? STORY_CAST[p.slice(4) === 'mihal' ? 'm' : p.slice(4) === 'klaus' ? 'k' : 'g'] : null;
        return c ? (c.battle || c.stand) : '';
    }
    return typeof portraitPresetUrl === 'function' ? portraitPresetUrl(p || portraitDefaultKey(u.classId, u.name), false) : '';
}

function bvOpen(opts) {
    bvClose(true);
    BV.opts = opts; BV.i = 0; BV.skip = false; BV.done = false; BV.round = 0;
    BV.hp = {}; BV.st = {};
    (opts.units || []).forEach(u => { BV.hp[u.id] = u.maxHp; });
    try { BV.speed = Number(localStorage.getItem(BV_SPEED_KEY)) || 1; } catch (e) { BV.speed = 1; }
    if ([1, 2, 4].indexOf(BV.speed) < 0) BV.speed = 1;
    const mine = opts.mySide === 'B' ? 'B' : 'A', foe = mine === 'A' ? 'B' : 'A';
    const sideHtml = (side, cls) => {
        const us = (opts.units || []).filter(u => u.side === side);
        return `<div class="bv-side ${cls}${us.length <= 2 ? ' big' : ''}">` + us.map(u => {
            const npc = String(u.portrait || '').indexOf('npc:') === 0;
            return `<div class="bv-u${npc ? ' npc' : ''}" data-id="${esc(u.id)}" data-no-i18n>
                <div class="bv-face"><img src="${esc(bvFace(u))}" alt="" decoding="async"></div>
                <div class="bv-info"><div class="bv-name">${esc(bvNameOf(u))}</div>
                    <div class="bv-bar"><i style="width:100%"></i></div>
                    <div class="bv-hp"><b>${u.maxHp}</b><span>/${u.maxHp}</span><em class="bv-st"></em></div></div>
                <div class="bv-pop" aria-hidden="true"></div></div>`;
        }).join('') + `</div>`;
    };
    const names = opts.sideNames || {};
    const el = document.createElement('div');
    el.id = 'bv'; el.className = 'bv fx-overlay fx-in';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', opts.title || 'バトル');
    el.innerHTML = `
        <div class="bv-bg" aria-hidden="true"><img src="img/bg/arena-sm.webp" alt="" decoding="async"></div>
        <div class="bv-top">
            <div class="bv-title"><span>${esc(opts.title || 'バトル')}</span><b class="bv-round">R1</b></div>
            <div class="bv-ctl">${[1, 2, 4].map(s => `<button type="button" class="bv-spd${BV.speed === s ? ' on' : ''}" data-s="${s}" onclick="bvSetSpeed(${s})">×${s}</button>`).join('')}
                <button type="button" class="bv-skip" onclick="bvSkip()">結果へ</button></div>
        </div>
        <div class="bv-field">
            <div class="bv-col"><div class="bv-sname" data-no-i18n>${typeof titledNameHtml === 'function' ? titledNameHtml(names[foe] || '') : esc(names[foe] || '')}</div>${sideHtml(foe, 'foe')}</div>
            <div class="bv-col"><div class="bv-sname" data-no-i18n>${typeof titledNameHtml === 'function' ? titledNameHtml(names[mine] || '') : esc(names[mine] || '')}</div>${sideHtml(mine, 'ally')}</div>
            <div class="bv-call" aria-live="polite" data-no-i18n></div>
        </div>
        <div class="bv-log" aria-live="off"></div>
        <div class="bv-end" hidden></div>`;
    document.body.appendChild(el);
    BV.el = el;
    document.addEventListener('keydown', bvKey);
    setTimeout(bvRun, 500);
}
function bvKey(e) {
    if (!bvIsOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); if (BV.done) bvFinish(); else bvSkip(); }
}
function bvSetSpeed(s) {
    BV.speed = s;
    try { localStorage.setItem(BV_SPEED_KEY, String(s)); } catch (e) { /* 無視 */ }
    if (BV.el) BV.el.querySelectorAll('.bv-spd').forEach(b => b.classList.toggle('on', Number(b.dataset.s) === s));
}
function bvSkip() { BV.skip = true; if (BV.wake) BV.wake(); }
function bvWait(ms) {
    if (BV.skip) return Promise.resolve();
    return new Promise(res => { BV.wake = res; BV.timer = setTimeout(res, ms / BV.speed); });
}

async function bvRun() {
    const log = BV.opts.log || [];
    while (bvIsOpen() && BV.i < log.length) {
        const e = log[BV.i++];
        if (BV.skip) { bvApply(e, true); continue; }
        await bvStep(e);
    }
    if (bvIsOpen()) bvEnd();
}
/** 1行分：行動した人を前へ → 技名 → 数字と HP バー → ログ */
async function bvStep(e) {
    const actor = BV.el.querySelector(`.bv-u[data-id="${e.aid}"]`);
    if (e.round && e.round !== BV.round) { BV.round = e.round; BV.el.querySelector('.bv-round').textContent = 'R' + e.round; }
    if (!e.x && actor) actor.classList.add('act');
    if (!e.x && e.action) bvCall(e);
    await bvWait(e.x ? 150 : 420);
    bvApply(e, false);
    await bvWait(e.x ? 650 : 900);
    if (actor) actor.classList.remove('act');
}
function bvCall(e) {
    const c = BV.el.querySelector('.bv-call');
    const u = bvUnit(e.aid);
    const plain = e.action === '通常攻撃' || e.action === '防御する';
    c.className = 'bv-call ' + (e.skill ? 'ex' : plain ? 'plain' : 'sk') + ' ' + (u && u.side === (BV.opts.mySide === 'B' ? 'B' : 'A') ? 'mine' : 'foe');
    c.innerHTML = `<small>${esc(bvNameOf(u))}</small><b>${esc(bvT(e.action))}</b>`;
    void c.offsetWidth; c.classList.add('show');
}
/** HP の変化を数字で出し、バー・状態異常・戦闘不能を更新して、ログに1行足す */
function bvApply(e, quiet) {
    const pops = [];
    if (e.hp) Object.keys(e.hp).forEach(id => {
        const before = BV.hp[id], after = e.hp[id];
        if (before == null || after === before) return;
        pops.push({ id: id, d: after - before });
        BV.hp[id] = after;
    });
    const newSt = [];
    if (e.st || e.hp) {
        (BV.opts.units || []).forEach(u => {
            const was = BV.st[u.id] || '', now = (e.st && e.st[u.id]) || '';
            now.split('').forEach(k => { if (was.indexOf(k) < 0) newSt.push({ id: u.id, k: k }); });
            BV.st[u.id] = now;
        });
    }
    (BV.opts.units || []).forEach(u => bvPaint(u, quiet ? null : pops.find(p => p.id === u.id), quiet ? null : newSt.filter(s => s.id === u.id)));
    if (!quiet && e.x && e.x !== 'dot') {
        const box = BV.el.querySelector(`.bv-u[data-id="${e.aid}"] .bv-pop`);
        if (box) bvPop(box, bvT(e.x === 'para' ? '麻痺で動けない' : e.x === 'sleep' ? '眠っている' : '行動できない'), 'note');
    }
    bvLogLine(e, pops, newSt);
}
function bvPaint(u, pop, sts) {
    const el = BV.el.querySelector(`.bv-u[data-id="${u.id}"]`);
    if (!el) return;
    const hp = Math.max(0, BV.hp[u.id] | 0), pct = u.maxHp ? Math.max(0, Math.min(100, hp / u.maxHp * 100)) : 0;
    const bar = el.querySelector('.bv-bar i');
    bar.style.width = pct + '%';
    el.querySelector('.bv-bar').classList.toggle('low', pct <= 30);
    el.querySelector('.bv-hp b').textContent = hp;
    el.querySelector('.bv-st').textContent = (BV.st[u.id] || '').split('').map(k => bvT(BV_ST[k])).join(' ');
    const ko = hp <= 0;
    if (ko && !el.classList.contains('ko')) { el.classList.add('ko'); if (pop !== null) bvPop(el.querySelector('.bv-pop'), bvT('戦闘不能'), 'ko'); }
    else if (!ko) el.classList.remove('ko');
    if (pop) {
        bvPop(el.querySelector('.bv-pop'), (pop.d > 0 ? '+' : '') + pop.d, pop.d > 0 ? 'heal' : 'dmg');
        if (pop.d < 0) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
    }
    (sts || []).forEach(s => bvPop(el.querySelector('.bv-pop'), bvT(BV_ST[s.k]), 'st'));
}
function bvPop(box, text, kind) {
    if (!box) return;
    const s = document.createElement('span');
    s.className = 'bv-num ' + kind;
    s.textContent = text;
    s.style.animationDelay = (box.childElementCount * 0.12) + 's';
    box.appendChild(s);
    setTimeout(() => s.remove(), 1600);
}
function bvLogLine(e, pops, sts) {
    const box = BV.el.querySelector('.bv-log');
    const u = bvUnit(e.aid);
    const name = esc(bvNameOf(u));
    let head;
    if (e.x === 'dot') head = `${esc(bvT('毒'))}`;
    else if (e.x) head = `${name} ${esc(bvT(e.x === 'para' ? '麻痺で動けない' : e.x === 'sleep' ? '眠っている' : '行動できない'))}`;
    else head = `${name} ▸ <b>${esc(bvT(e.action))}</b>`;
    const eff = pops.map(p => {
        const t = bvUnit(p.id);
        return `<span class="${p.d > 0 ? 'heal' : 'dmg'}">${esc(bvNameOf(t))} ${p.d > 0 ? '+' : ''}${p.d}${BV.hp[p.id] <= 0 && p.d < 0 ? ' ✕' : ''}</span>`;
    }).concat(sts.map(s => `<span class="st">${esc(bvNameOf(bvUnit(s.id)))} ${esc(bvT(BV_ST[s.k]))}</span>`)).join(' ');
    const side = u && u.side === (BV.opts.mySide === 'B' ? 'B' : 'A') ? 'mine' : 'foe';
    const row = document.createElement('div');
    row.className = 'bv-line ' + side + (e.x ? ' x' : '');
    row.setAttribute('data-no-i18n', '');
    row.innerHTML = `<i>R${e.round | 0}</i><span>${head}</span>${eff ? `<span class="bv-eff">${eff}</span>` : ''}`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}
function bvEnd() {
    BV.done = true;
    clearTimeout(BV.timer);
    const o = BV.opts;
    const end = BV.el.querySelector('.bv-end');
    BV.el.querySelector('.bv-call').classList.remove('show');
    BV.el.querySelector('.bv-skip').hidden = true;
    end.hidden = false;
    end.innerHTML = `<div class="bv-res ${o.win ? 'win' : 'lose'}"><b>${o.win ? '勝利' : '敗北'}</b>${o.rounds ? `<span>${o.rounds} ラウンド</span>` : ''}</div>
        <button type="button" class="btn bv-close" onclick="bvFinish()">${esc(o.closeLabel || '次へ')}</button>`;
    requestAnimationFrame(() => end.classList.add('in'));
}
function bvFinish() {
    const cb = BV.opts && BV.opts.onClose;
    bvClose();
    if (cb) setTimeout(cb, 200);
}
function bvClose(instant) {
    clearTimeout(BV.timer);
    BV.skip = true;
    if (BV.wake) BV.wake();
    document.removeEventListener('keydown', bvKey);
    const el = BV.el;
    BV.el = null;
    if (!el) return;
    if (instant) { el.remove(); return; }
    el.classList.remove('fx-in'); el.classList.add('out');
    setTimeout(() => { try { el.remove(); } catch (e) { /* 無視 */ } }, 300);
}
