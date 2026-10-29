/**
 * story.js — P9.22.0 メインクエスト（ギルドマスター・ガレオンの依頼）
 *  - 場面：ギルド酒場の背景にガレオンの立ち絵、下に台詞。タップで1行ずつ進む（スキップあり）
 *  - 出すタイミング：冒険者名の登録のあと／本番の帰還のあと／拠点を開いたとき（順番と踏破の条件は data.js の STORY_STEPS）
 *  - 見た場面はサーバーに保存（どの端末でも続きから）。拠点の「ギルドの依頼」から読み返せる
 *  - 拠点の「ギルドの依頼」カードが、いま何をすればよいかの道しるべを兼ねる
 *  - 強化の案内は、最初に SS を持ち帰ったときにガレオンの一言で1回だけ
 */
const GALEON = 'ガレオン';

/** 場面。n: 地の文（ト書き）、g: ガレオンの台詞 */
const STORY_SCENES = {
    c1_intro: { title: '最初の依頼', lines: [
        ['n', 'サザン・ヴェイル前哨基地のギルド酒場。\n喧騒に包まれたフロアの一角で、シャツとベストに身を包んだ大男――ガレオンは、淡々と手元の書類に目を通しながら安煙草の煙をくゆらせていた。\n右目の大きな眼帯と整った身なりが、独特の冷徹な気品を醸し出している。'],
        ['g', '……ほう。見ない顔だな'],
        ['n', '書類から目を離さず、低く落ち着いた声で告げる。'],
        ['g', '一攫千金か、あるいは名誉か。動機は何でも構わないが……言っておく。ここでは血筋や神への祈りなど何の価値もない。俺が評価するのは、お前たちが持ち帰った『ソウルシャード』の純度と量、その結果だけだ'],
        ['g', '俺も昔は前線で戦斧を振るっていたがね。感情で命を賭すほど、戦争は甘くなかった。お前たちが胸に埋めたその蒼い欠片は、命を前借りして稼ぐための力の源泉だ。無事に引退できれば、シャードを引き抜いて一生遊べるだけの対価を支払う。……もっとも、まともに帰ってこられた者は少ないがな'],
        ['n', 'ガレオンは淡々と一枚の羊皮紙をカウンターの端へ滑らせた。'],
        ['g', '最初の仕事だ。基地の直下にある『はじまりの迷宮』へ向かえ。……本来なら深層にいるはずの変異体が、上層で目撃されたらしい'],
        ['g', '奴らは人間の戦術や動きを学習して、効率的に成長する。放置すれば、この基地を脅かす存在になる。……行って、奴らの実態を調べてこい。話はそれからだ']
    ] },
    c1_f1: { title: '初遭遇の報告', lines: [
        ['g', '……戻ったか。どうだ、迷宮の様子は'],
        ['n', '持ち帰った浅層の変異体の残骸を一瞥し、淡々と続ける。'],
        ['g', '浅層に這い上がっていたのは事実らしいな。ただの獣にしては、妙に組織的な動きをしている。……報酬を数えるのはまだ早い。お前の仕事はこれで終わりではない'],
        ['g', 'もう少し深くへ潜れ。次は『B1階層』だ。奴らがどこから這い出しているのか、その巣穴を突き止めてこい']
    ] },
    c1_b1: { title: '目撃情報', lines: [
        ['n', 'カウンターの端で、別のパーティが慌てた様子で報告していくのを見届けてから、ガレオンは低く呟く。'],
        ['g', '……いい時に戻った。お前たちが B1 を荒らしてくれたおかげで、奥に潜んでいた連中の尻尾が掴めた'],
        ['g', 'ほかの冒険者からの情報では、さらに下の『B2階層』で、これまでの個体とは比較にならない上位の変異体が目撃されたそうだ。単なる群れの迷い込みではない。明確な意志を持って、陣地を広げている'],
        ['g', 'お前たちだけで挑むには危険が大きすぎる。……今回は、ほかの冒険者と臨時の合同討伐作戦を組む。B2 の奥地へ突入し、その上位変異体を叩き潰してこい']
    ] },
    c1_b2: { title: '違和感と小休止', lines: [
        ['g', '……よく生還したな。B2 の『上位変異体』の討伐、確かに確認した'],
        ['n', 'ガレオンは腕を組み、険しい顔つきで安煙草の煙を吐き出す。'],
        ['g', '討伐した個体のソウルシャードを解析したが……質が異常に高い。あれほどの代物が、このサザン・ヴェイルの足元、それも浅い階層で育つはずがない。……何者かが意図的に呼び寄せているか、あるいは……'],
        ['g', 'ギルドとしても、この件の裏付けは急ぐ。お前たちの働きは十分だ'],
        ['g', '今日はもう下がれ。次の仕事まで、しっかり体を休めておくことだ']
    ] },
    c1_remnant: { title: '残党の再調査', lines: [
        ['g', '……休めたか。悪いが、もう次の仕事だ'],
        ['g', 'B2 で仕留めたはずの連中の残党が、迷宮の各層で目撃されている。数は少ないが、以前よりも手強いらしい。あの異常な質のシャードと、無関係とは思えない'],
        ['g', 'もう一度潜って、確かめてこい。今度は条件が厳しい。全滅すれば、持ち込んだものは何も戻らない']
    ] }
};
const STORY_CHAPTERS = { 1: '第1章　はじまりの迷宮' };
const STORY_TIP_KEY = 'sv_tip_levelup_v1';

const SC = { el: null, id: null, i: 0, replay: false, pageAt: 0, b2SeenThisSession: false, returnedSinceB2: false, busy: false };

function storyIsOpen() { return !!(SC.el && document.body.contains(SC.el)); }

/* ---------- 今やること（拠点の「ギルドの依頼」） ---------- */
/**
 * @returns {{title, detail?, go?: string, goLabel?: string, scene?: string, done?: boolean}|null}
 */
function storyObjective() {
    if (typeof storySeen !== 'function' || !storySeen('c1_intro')) return null;
    const pend = storyPending();
    if (pend) return { title: 'ギルドへ報告する', detail: 'ガレオンが話を待っている', scene: pend, goLabel: '報告する' };
    const cl = (s, m) => isStageCleared('labyrinth', s, m || 'normal');
    if (!storySeen('c1_f1')) return { title: 'はじまりの迷宮 F1 を調査せよ', detail: '上層で目撃された変異体の実態を調べる', go: "expGoTo('labyrinth','f1','normal')", goLabel: '出撃する' };
    if (!storySeen('c1_b1')) return { title: 'B1 で巣穴を突き止めろ', detail: '変異体がどこから這い出しているのかを探る', go: "expGoTo('labyrinth','b1','normal')", goLabel: '出撃する' };
    if (!storySeen('c1_b2')) return { title: 'B2 の上位変異体を討て', detail: '臨時の合同討伐作戦', go: "expGoTo('labyrinth','b2','normal')", goLabel: '出撃する' };
    if (!storySeen('c1_remnant')) return { title: '体を休め、次の依頼を待て', detail: '次に拠点へ戻ったとき、ガレオンから話がある' };
    const ch = ['f1', 'b1', 'b2'].find(s => !cl(s, 'challenge'));
    if (ch) return { title: `迷宮の残党を調査せよ（チャレンジ ${ch.toUpperCase()}）`, detail: '全滅すると、入場料と持ち帰るはずの SS を失う', go: `expGoTo('labyrinth','${ch}','challenge')`, goLabel: '出撃する' };
    return { title: '第1章 完', detail: '次の依頼を待て', done: true };
}

/** いま見せてよい場面（順番どおりの最初の1つ。later は時間をおいてから） */
function storyPending() {
    if (typeof STORY_STEPS === 'undefined' || typeof storyCanSee !== 'function') return null;
    for (const s of STORY_STEPS) {
        if (!storyCanSee(s.id)) continue;
        if (s.id === 'c1_intro') return null;   // 依頼は冒険者名の登録のあとにだけ（下の storyAfterName）
        if (s.later && SC.b2SeenThisSession && !SC.returnedSinceB2) return null;
        return s.id;
    }
    return null;
}

/* ---------- 場面を出すきっかけ ---------- */
/** ほかの画面（名前登録・帰還・案内カード・タイトル）が開いていないか */
function storyQuiet() {
    if (typeof serverMode === 'function' && serverMode() && (typeof serverState === 'undefined' || serverState.phase !== 'ready')) return false;
    if (storyIsOpen() || SC.busy) return false;
    if (document.getElementById('pname-overlay') && document.getElementById('pname-overlay').style.display !== 'none') return false;
    if (typeof titleIsOpen === 'function' && titleIsOpen()) return false;
    if (typeof expGate !== 'undefined' && expGate) return false;
    const fx = document.querySelector('.fx-overlay.fx-in:not(#pp-overlay)');
    if (fx && fx.style.display !== 'none') return false;
    return true;
}
/** 見せられる場面があれば出す（なければ何もしない） */
function storyCheck() {
    if (!storyQuiet()) return false;
    if (typeof storySeen === 'function' && !storySeen('c1_intro') && typeof serverState !== 'undefined' && serverState.meta && serverState.meta.playerName) {
        storyOpen('c1_intro'); return true;   // 名前はあるのに依頼をまだ見ていない（以前から遊んでいる人）
    }
    const id = storyPending();
    if (id) { storyOpen(id); return true; }
    return false;
}
/** 冒険者名を登録した直後 */
function storyAfterName() {
    setTimeout(() => { if (typeof storyCanSee === 'function' && storyCanSee('c1_intro')) storyOpen('c1_intro'); }, 350);
}
/** 本番の帰還（結果画面を閉じた）あと */
function storyAfterReturn() {
    if (SC.b2SeenThisSession) SC.returnedSinceB2 = true;
    setTimeout(() => { if (!storyCheck()) storyTipLevelUp(); }, 300);
}

/* ---------- 場面の表示 ---------- */
function storyOpen(id, opts) {
    const sc = STORY_SCENES[id];
    if (!sc) return;
    opts = opts || {};
    storyClose(true);
    SC.id = id; SC.i = 0; SC.replay = !!opts.replay;
    const def = (typeof storyStepDef === 'function') ? storyStepDef(id) : null;
    const el = document.createElement('div');
    el.id = 'story-scene'; el.className = 'sc';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', sc.title);
    el.innerHTML = `
        <div class="sc-bg" aria-hidden="true"><img src="img/bg/guild-sm.webp" srcset="img/bg/guild-sm.webp 800w, img/bg/guild.webp 1600w" sizes="100vw" alt="" decoding="async"></div>
        <div class="sc-npc" aria-hidden="true"><img src="img/npc/galeon.webp" alt="" decoding="async"></div>
        <div class="sc-top"><span class="sc-chap"><span>${esc(STORY_CHAPTERS[def ? def.chapter : 1] || '')}</span>　<span>${esc(sc.title)}</span></span><button type="button" class="sc-skip" onclick="event.stopPropagation();storyFinish()">スキップ</button></div>
        <div class="sc-box" onclick="storyNext()">
            <div class="sc-name"></div>
            <div class="sc-text" aria-live="polite" data-no-i18n></div>
            <div class="sc-more" aria-hidden="true">▼</div>
        </div>`;
    el.addEventListener('click', e => { if (!e.target.closest('.sc-top')) storyNext(); });
    document.body.appendChild(el);
    SC.el = el;
    document.addEventListener('keydown', storyKey);
    storyShowLine();
    requestAnimationFrame(() => el.classList.add('in'));
}
function storyKey(e) {
    if (!storyIsOpen()) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); storyNext(); }
    else if (e.key === 'Escape') { e.preventDefault(); storyFinish(); }
}
function storyShowLine() {
    const sc = STORY_SCENES[SC.id];
    const ln = sc.lines[SC.i];
    const box = SC.el.querySelector('.sc-box');
    const name = SC.el.querySelector('.sc-name'), text = SC.el.querySelector('.sc-text');
    const isG = ln[0] === 'g';
    box.classList.toggle('narr', !isG);
    SC.el.classList.toggle('talking', isG);
    name.textContent = isG ? GALEON : '';
    // 台詞はここで訳してから、言語に合ったかぎかっこで囲む（画面の自動翻訳はかっこ付きの文を探せないため）
    const en = typeof I18N !== 'undefined' && I18N.lang === 'en';
    const raw = (typeof T === 'function') ? T(ln[1]) : ln[1];
    text.textContent = isG ? (en ? '\u201c' + raw + '\u201d' : '「' + raw + '」') : raw;
    text.classList.remove('show'); void text.offsetWidth; text.classList.add('show');
    SC.pageAt = Date.now();
    SC.el.querySelector('.sc-more').textContent = SC.i === sc.lines.length - 1 ? '■' : '▼';
}
/** タップ：表示が始まった直後の誤タップは無視して、次の行へ。最後の行なら閉じる */
function storyNext() {
    if (!storyIsOpen() || Date.now() - SC.pageAt < 250) return;
    const sc = STORY_SCENES[SC.id];
    if (SC.i < sc.lines.length - 1) { SC.i++; storyShowLine(); }
    else storyFinish();
}
/** 最後まで読んだ（スキップした）：見たことを記録して閉じ、続きの場面があれば続けて出す */
async function storyFinish() {
    if (!storyIsOpen()) return;
    const id = SC.id, replay = SC.replay;
    storyClose();
    if (replay) return;
    SC.busy = true;
    try {
        if (typeof serverMode === 'function' && serverMode()) {
            const r = await serverCall('story_seen', { id: id });
            if (!r || !r.ok) console.warn('story_seen', r);
        } else if (typeof storyMarkSeen === 'function') {
            storyMarkSeen(id);
        }
    } catch (e) { console.warn(e); }
    SC.busy = false;
    if (id === 'c1_b2') { SC.b2SeenThisSession = true; SC.returnedSinceB2 = false; }
    if (typeof currentScreen !== 'undefined' && currentScreen === 'home' && typeof renderHomeQuest === 'function') renderHomeQuest();
    setTimeout(() => { if (!storyCheck()) storyTipLevelUp(); }, 450);
}
function storyClose(instant) {
    if (!SC.el) return;
    const el = SC.el;
    SC.el = null;
    document.removeEventListener('keydown', storyKey);
    if (instant) { el.remove(); return; }
    el.id = '';   // 消えていく途中の場面と、次の場面が重ならないように
    el.classList.remove('in');
    el.style.pointerEvents = 'none';
    setTimeout(() => { try { el.remove(); } catch (e) { /* 無視 */ } }, 450);
}

/* ---------- 読み返す ---------- */
function storyLogOpen() {
    const seen = (typeof STORY_STEPS !== 'undefined') ? STORY_STEPS.filter(s => storySeen(s.id)) : [];
    const ov = document.createElement('div');
    ov.id = 'story-log'; ov.className = 'fx-overlay story-log';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'これまでの依頼');
    ov.addEventListener('click', e => { if (e.target === ov) storyLogClose(); });
    const byCh = {};
    seen.forEach(s => { (byCh[s.chapter] = byCh[s.chapter] || []).push(s); });
    const body = Object.keys(byCh).map(c => `<div class="sl-chap">${esc(STORY_CHAPTERS[c] || '')}</div>` + byCh[c].map(s =>
        `<button type="button" class="sl-item" onclick="storyLogClose();storyOpen('${s.id}',{replay:true})">${esc(STORY_SCENES[s.id].title)}</button>`).join('')).join('')
        || '<p class="hint">まだ読み返せる話はありません</p>';
    ov.innerHTML = `<div class="fx-card sl-card"><div class="gate-eyebrow">ギルドの依頼</div><div class="pp-title">これまでの依頼</div>${body}
        <button type="button" class="btn pp-close" onclick="storyLogClose()">閉じる</button></div>`;
    document.body.appendChild(ov);
    ov.style.display = 'flex';
    requestAnimationFrame(() => ov.classList.add('fx-in'));
}
function storyLogClose() { const ov = document.getElementById('story-log'); if (ov) ov.remove(); }

/* ---------- 拠点の「ギルドの依頼」カード ---------- */
function renderHomeQuest() {
    const box = document.getElementById('home-quest');
    if (!box) return;
    const q = storyObjective();
    if (!q) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    const act = q.scene ? `storyOpen('${q.scene}')` : (q.go || '');
    box.innerHTML = `<div class="hq${q.done ? ' hq-done' : ''}">
        <img class="hq-face" src="img/npc/galeon-face.webp" alt="" decoding="async">
        <div class="hq-main">
            <div class="hq-eyebrow"><span>ギルドの依頼</span>　<span>${esc(STORY_CHAPTERS[1])}</span></div>
            <div class="hq-title">${esc(q.title)}</div>
            ${q.detail ? `<div class="hq-detail">${esc(q.detail)}</div>` : ''}
            <div class="hq-btns">${act && q.goLabel ? `<button type="button" class="btn btn-sm hq-go" onclick="${act}">${esc(q.goLabel)}</button>` : ''}<button type="button" class="hq-log" onclick="storyLogOpen()">これまでの依頼</button></div>
        </div></div>`;
}

/* ---------- 控えめな案内 ---------- */
/** 誰かのレベルを上げられるだけの SS があるか（パーティの中で） */
function storyCanLevelSomeone() {
    try {
        const ss = getResource();
        return getPartyChars().some(c => { const cost = ssCostToNextLevel(c.level || 1); return cost != null && ss >= cost; });
    } catch (e) { return false; }
}
/** 「強化」に印を付ける（レベルを上げられるとき） */
function storyNavDot() {
    const b = document.querySelector('.nav-btn[data-screen="enhance"]');
    if (b) b.classList.toggle('has-dot', storyCanLevelSomeone());
    const t = document.querySelector('.enhance-item-main');
    if (t) t.classList.toggle('has-dot', storyCanLevelSomeone());
}
/** 最初に SS を持ち帰ったときの一言（1回だけ） */
function storyTipLevelUp() {
    let done = false;
    try { done = !!localStorage.getItem(STORY_TIP_KEY); } catch (e) { done = true; }
    if (done || !storyCanLevelSomeone() || typeof fxToast !== 'function' || !storyQuiet()) return;
    try { localStorage.setItem(STORY_TIP_KEY, '1'); } catch (e) { /* 無視 */ }
    fxToast(`<span class="fx-toast-fig"><img class="tip-face" src="img/npc/galeon-face.webp" alt=""></span><span class="fx-toast-main"><b>${esc(GALEON)}</b><span>持ち帰ったシャードで、冒険者を鍛えておけ。「強化」の「キャラ育成」でレベルを上げられる</span></span>`, { tone: 'ink', key: 'tip-lv', ms: 9000 });
}
