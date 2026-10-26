/**
 * title.js — P9.21.0 タイトル画面・導入ナレーション・始め方の選択
 * まだログインしていない人（はじめて来た人・ログアウトした人）にだけ出す。
 *   タイトル →（はじめてなら）導入ナレーション → 契約（Google で始める／ゲストで始める）
 * ログイン済みの人は今までどおり、起動タイトルのあとすぐ拠点へ。
 * 設定の「導入をもう一度見る」からはナレーションだけを見返せる（最後は閉じるだけ）。
 */
const TITLE_SEEN_KEY = 'sv_prologue_seen_v1';

/** 導入ナレーション。p は段落（\n は段落の中の改行）。bg は背景の絵（img/bg/<bg>.webp） */
const PROLOGUE = [
    { bg: 'top', pos: '46% 45%', p: [
        'ようこそ。これから語られるのは、光と月が入り交じる、昏い世界の物語だ。'
    ] },
    { bg: 'top', pos: '30% 35%', p: [
        'かつて、中央大陸には二つの大きな理が存在した。\n太陽の如き慈悲と寛容を捧げる、聖陽教会を国教とした『ソルグラニア王国』。\nそして、冷徹なる秩序と合理を掲げる、月輪の理を国教とした『ルナリアス王国』。',
        '刃を交えた過酷な歴史の果てに、両国は和解の途を選んだ。辺境を脅かす無秩序な魔物どもを退け、人々は束の間の平穏を享受していたのだ……そう、あの日までは。'
    ] },
    { bg: 'forest', pos: '50% 50%', p: [
        'やがて魔物の中に、異常な凶暴性と知性を備えた『変異体』が現れ始める。\n集落は次々と肉の海へと変わり、二国は合同で大規模な掃討作戦を展開。異形どもを大陸の奈落へと追い落とすことに成功した。',
        '――だが、奴らは滅びてなどいなかった。'
    ] },
    { bg: 'labyrinth', pos: '50% 55%', p: [
        '闇の底で、変異体どもは恐ろしい『術』を獲得していたのだ。\n戦いの中で人間から奪った経験、そして死の間際の怨念……それらを体内で結晶化させる技術を。\n奴らは自らの寿命が来ると、その結晶を――自らの肉体ごと次の世代に喰らわせた。\n先代の記憶と力を継承した新世代は、より凶悪に、より狡猾に進化を遂げ、静かに反撃の時を伺っていたのだ。'
    ] },
    { bg: 'rumerk', pos: '55% 45%', p: [
        '災厄の報せは、南の辺境から届いた。\n蓄えられた暴力の奔流は、駆けつけた討伐隊を容易く破砕。勢いそのままにルナリアス王国の領土へとなだれ込んだ。防衛線は紙切れの如く突破され、王都は焦土と化す。\n遅れて救援に駆けつけたソルグラニア王国の軍勢により、なんとか全滅だけは免れたものの……ルナリアスはその国土の大半を奪われ、世界の均衡は崩壊した。'
    ] },
    { bg: 'top', pos: '28% 30%', p: [
        '危機に瀕した二国は、生き残るために一つとなる途を選ぶ。\nソルグラニアを新たな帝都とし、二つの国から『アウレリア帝国』を樹立した。ルナリアスの王女がソルグラニアの王子へ嫁ぐことで、歪ながらも一つの国家が誕生したのだ。'
    ] },
    { bg: 'home', pos: '50% 50%', p: [
        '――そして、視線を現在（いま）へ移そう。',
        'ここは帝都から遠く離れた最前線、南方防衛ライン『サザン・ヴェイル』。\n表向きは帝国の平穏を隔てる「南方の盾」と呼ばれるが、その裏では、足を踏み入れた者が二度と生きて帰れぬ「幽世（かくりよ）への扉」と揶揄される血の吹き溜まりだ。\n帝国正規軍の姿を見かけることは稀。国は自らの兵を消耗させることを恐れ、金と野望に目が眩んだ『冒険者』どもを買い叩き、肉の壁として戦線を維持している。'
    ] },
    { bg: 'recruit', pos: '70% 50%', p: [
        '……だが、君も聞いたことがあるだろう？\nこの基地の暗がりで囁かれる、不穏な噂を。',
        '奴ら変異体が体内に宿していた力の源――『ソウルシャード』。\nあの禁忌の結晶を、人間の肉体に直接埋め込み、異形と同等の超常を強引に引き出す技術が、実用化されているという話を。',
        'それをもたらしたのは、歴史から消された異端の魔導士か。\nあるいは、人に化けた魔物の血を引く者か……。'
    ] },
    { bg: 'top', pos: '40% 88%', p: [
        'さあ、話はここまでだ。\n目の前に置かれた契約書と、微かに脈打つ蒼い結晶が見えるだろう？',
        '毒を以て、毒を制す。\n己の命を精算の担保とし、過酷な戦場へと踏み出す準備は……できているかい？'
    ] }
];

/** 固有名詞・かぎかっこの中は行の途中で折り返さない（画面の端で名前が切れないように） */
const TITLE_NOBREAK_JA = /『[^』\n]+』|「[^」\n]+」|現在（いま）|ソルグラニア王国|ルナリアス王国|ソルグラニア|ルナリアス|アウレリア帝国|聖陽教会|月輪の理|中央大陸|サザン・ヴェイル|ソウルシャード/g;
const TITLE_NOBREAK_EN = /Kingdom of Solgrania|Kingdom of Lunarias|Church of the Holy Sun|Creed of the Lunar Ring|Aurelian Empire|Central Continent|Southern Veil|Southern Shield|Gate to the Hollow Beyond|Hollow Beyond|Soul Shard/g;
function titleRich(text) {
    const lang = (typeof I18N !== 'undefined' && I18N.lang === 'en') ? 'en' : 'ja';
    const s = (typeof T === 'function') ? T(text) : text;   // 先に訳してから、名前を囲む
    const e = String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return e.replace(lang === 'en' ? TITLE_NOBREAK_EN : TITLE_NOBREAK_JA, m => '<span class="nb">' + m + '</span>');
}

const TS = { el: null, page: -1, pageEndAt: 0, replay: false, bg: '', front: 0, waitTimer: null };

function titleSeen() { try { return !!localStorage.getItem(TITLE_SEEN_KEY); } catch (e) { return false; } }
function titleMarkSeen() { try { localStorage.setItem(TITLE_SEEN_KEY, '1'); } catch (e) { /* 無視 */ } }
function titleIsOpen() { return !!(TS.el && document.body.contains(TS.el)); }

function titleBuild() {
    if (titleIsOpen()) return TS.el;
    const el = document.createElement('div');
    el.id = 'title-screen';
    el.className = 'ts';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'サザン・ヴェイル');
    const lang = (typeof I18N !== 'undefined' && I18N.lang === 'en') ? 'ja' : 'en';
    el.innerHTML = `
        <div class="ts-bg" aria-hidden="true"><img class="ts-img" alt=""><img class="ts-img" alt=""></div>
        <div class="ts-shade" aria-hidden="true"></div>
        <section class="ts-step ts-title">
            <div class="ts-logo"><b>サザン・ヴェイル</b><span class="ts-sub" data-no-i18n>SOUTHERN VEIL</span></div>
            <div class="ts-lead">命を担保に契約し、ルールを組んで戦わせる。自動戦闘の育成RPG。</div>
            <button type="button" class="ts-start" onclick="titleStart()">はじめる</button>
            <button type="button" class="ts-link ts-watch" onclick="titlePrologue()">導入を見る</button>
            <div class="ts-foot">
                <a href="#" data-no-i18n onclick="event.preventDefault();i18nSetLang('${lang}')">${lang === 'en' ? 'English' : '日本語'}</a>
                <a href="terms.html" target="_blank" rel="noopener">利用規約</a>
                <a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>
            </div>
        </section>
        <section class="ts-step ts-pro" onclick="titleNext(event)">
            <button type="button" class="ts-skip" onclick="event.stopPropagation();titleSkip()">スキップ</button>
            <div class="ts-text" aria-live="polite"></div>
            <div class="ts-nav"><span class="ts-dots" aria-hidden="true"></span><button type="button" class="ts-next">次へ</button></div>
        </section>
        <section class="ts-step ts-choice">
            <div class="ts-card">
                <div class="ts-eyebrow">契約</div>
                <h2 class="ts-h">冒険者として契約する</h2>
                <button type="button" class="ts-opt ts-opt-google" onclick="titleGoogle()"><b>Google で始める</b><small>どの端末でも続きから遊べます。すでに遊んでいる方もこちら</small></button>
                <button type="button" class="ts-opt ts-opt-guest" onclick="titleGuest()"><b>ゲストで始める</b><small>登録なしで、すぐに始められます。あとから Google と連携できます</small></button>
                <p class="ts-note">ゲストのデータは、ブラウザのデータを消すと失われます。</p>
                <p class="ts-note">始める前に、利用規約とプライバシーポリシーをご確認ください。</p>
                <div class="ts-legal"><a href="terms.html" target="_blank" rel="noopener">利用規約</a><a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></div>
                <div class="ts-err" role="alert"></div>
                <button type="button" class="ts-link" onclick="titlePrologue()">導入をもう一度見る</button>
            </div>
        </section>
        <section class="ts-step ts-busy"><div class="ts-busy-text"></div></section>`;
    document.body.appendChild(el);
    TS.el = el;
    document.addEventListener('keydown', titleKey);
    return el;
}
function titleKey(e) {
    if (!titleIsOpen() || TS.el.dataset.step !== 'pro') return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); titleNext(); }
    else if (e.key === 'Escape') { e.preventDefault(); titleSkip(); }
}
function titleStep(step) {
    TS.el.dataset.step = step;
    const f = TS.el.querySelector('.ts-' + (step === 'pro' ? 'pro' : step) + ' button');
    if (f && step !== 'pro') setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) { /* 無視 */ } }, 60);
}
/** 背景の絵を切り替える（2枚を重ねてクロスフェード） */
function titleBg(key, pos) {
    const imgs = TS.el.querySelectorAll('.ts-img');
    if (TS.bg === key) { imgs[TS.front].style.objectPosition = pos || ''; return; }
    const next = TS.bg ? 1 - TS.front : 0;
    const im = imgs[next];
    im.style.objectPosition = pos || '';
    im.srcset = `img/bg/${key}-sm.webp 800w, img/bg/${key}.webp 1600w`;
    im.sizes = '100vw';
    im.src = `img/bg/${key}-sm.webp`;
    im.classList.add('on');
    if (TS.bg) imgs[TS.front].classList.remove('on');
    TS.front = next; TS.bg = key;
}

/**
 * opts.replay: true なら導入だけを見返す（最後は閉じる）
 */
function titleOpen(opts) {
    opts = opts || {};
    titleBuild();
    TS.replay = !!opts.replay;
    if (typeof bootSplashHide === 'function') bootSplashHide();
    TS.el.classList.toggle('seen', titleSeen());
    if (TS.replay) { titlePrologue(); }
    else { titleBg('top', '46% 50%'); titleStep('title'); }
    requestAnimationFrame(() => TS.el.classList.add('in'));
}
function titleClose() {
    if (!titleIsOpen()) return;
    const el = TS.el;
    if (TS.waitTimer) { clearInterval(TS.waitTimer); TS.waitTimer = null; }
    document.removeEventListener('keydown', titleKey);
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => { try { el.remove(); } catch (e) { /* 無視 */ } }, 650);
    TS.el = null; TS.bg = ''; TS.page = -1;
}
/** 「はじめる」：はじめての人は導入から、見たことがある人は契約へ */
function titleStart() {
    if (titleSeen()) titleChoice(); else titlePrologue();
}
function titlePrologue() {
    TS.page = -1;
    titleStep('pro');
    titleShowPage(0);
}
function titleShowPage(i) {
    const pg = PROLOGUE[i];
    if (!pg) return;
    TS.page = i;
    titleBg(pg.bg, pg.pos);
    const box = TS.el.querySelector('.ts-text');
    const step = 900;   // 段落を順に出す間隔（ms）
    box.innerHTML = '';
    box.classList.remove('all');
    pg.p.forEach((t, k) => {
        const p = document.createElement('p');
        p.className = 'ts-para';
        p.style.animationDelay = (k * step) + 'ms';
        p.setAttribute('data-no-i18n', '');   // ここで訳してから入れる（名前の囲みで文が分かれても訳せるように）
        p.innerHTML = titleRich(t);
        box.appendChild(p);
    });
    TS.pageEndAt = Date.now() + (pg.p.length - 1) * step + 600;
    box.scrollTop = 0;
    TS.el.querySelector('.ts-dots').innerHTML = PROLOGUE.map((_, k) => `<i class="${k === i ? 'on' : (k < i ? 'done' : '')}"></i>`).join('');
    TS.el.querySelector('.ts-next').textContent = (i === PROLOGUE.length - 1) ? (TS.replay ? '閉じる' : '契約へ') : '次へ';
}
/** タップ・次へ：まだ文が出きっていなければ全部出す。出ていれば次のページへ */
function titleNext(e) {
    if (e && e.target && e.target.closest && e.target.closest('a')) return;
    if (!titleIsOpen() || TS.page < 0) return;
    const box = TS.el.querySelector('.ts-text');
    if (Date.now() < TS.pageEndAt && !box.classList.contains('all')) { box.classList.add('all'); TS.pageEndAt = 0; return; }
    if (TS.page < PROLOGUE.length - 1) titleShowPage(TS.page + 1);
    else titleSkip();
}
function titleSkip() {
    titleMarkSeen();
    if (TS.replay) { titleClose(); return; }
    titleChoice();
}
function titleChoice() {
    titleMarkSeen();
    TS.page = -1;
    titleBg('top', '40% 80%');
    TS.el.querySelector('.ts-err').textContent = '';
    titleStep('choice');
}
function titleBusy(text) {
    TS.el.querySelector('.ts-busy-text').textContent = text;
    titleStep('busy');
}
function titleError(msg) {
    titleChoice();
    TS.el.querySelector('.ts-err').textContent = msg || 'うまく始められませんでした。時間をおいてもう一度お試しください';
}
async function titleGoogle() {
    titleBusy('Google に移動します…');
    let err = '';
    try { err = (typeof cloudSignInGoogle === 'function') ? await cloudSignInGoogle() : 'ログインの準備ができていません'; } catch (e) { err = String(e && e.message || e); }
    if (err) titleError(err);
    // 成功したら Google の画面へ移動する（戻ってくるとログイン済みで始まる）
}
async function titleGuest() {
    titleBusy('契約を結んでいます…');
    if (typeof cloudState !== 'undefined') cloudState.allowAnon = true;
    if (typeof cloudWriteMeta === 'function') cloudWriteMeta({ loggedOut: false });
    // 接続が終わったら閉じる（冒険者名の登録・遊び方の案内はそのあとに出る）
    if (TS.waitTimer) clearInterval(TS.waitTimer);
    const t0 = Date.now();
    TS.waitTimer = setInterval(() => {
        const ph = (typeof serverState !== 'undefined' && serverState) ? serverState.phase : 'ready';
        if (ph === 'ready') { titleClose(); return; }
        if (ph === 'viewonly' || ph === 'blocked') { titleClose(); return; }   // エラーの表示は server.js が出す
        if (Date.now() - t0 > 120000) { clearInterval(TS.waitTimer); TS.waitTimer = null; titleError('接続に時間がかかっています。ページを読み込み直してください'); }
    }, 150);
    try { if (typeof cloudInit === 'function') await cloudInit(); } catch (e) { titleError(String(e && e.message || e)); }
}
