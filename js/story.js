/**
 * story.js — P9.22.0 メインクエスト（ギルドマスター・ガレオンの依頼）
 *  - 場面：ギルド酒場の背景にガレオンの立ち絵、下に台詞。タップで1行ずつ進む（スキップあり）
 *  - 出すタイミング：冒険者名の登録のあと／本番の帰還のあと／拠点を開いたとき（順番と踏破の条件は data.js の STORY_STEPS）
 *  - 見た場面はサーバーに保存（どの端末でも続きから）。拠点の「ギルドの依頼」から読み返せる
 *  - 拠点の「ギルドの依頼」カードが、いま何をすればよいかの道しるべを兼ねる
 *  - 強化の案内は、最初に SS を持ち帰ったときにガレオンの一言で1回だけ
 */
const GALEON = 'ガレオン';
/** P9.24.0 話し手。g: ガレオン、k: クラウス、m: ミハル（n は地の文）。stand: 立ち姿、battle: 構え */
const STORY_CAST = {
    g: { name: GALEON, stand: 'img/npc/galeon.webp', face: 'img/npc/galeon-face.webp' },
    k: { name: 'クラウス', stand: 'img/npc/klaus.webp', battle: 'img/npc/klaus-battle.webp', face: 'img/npc/klaus-face.webp' },
    m: { name: 'ミハル', stand: 'img/npc/mihal.webp', battle: 'img/npc/mihal-battle.webp', face: 'img/npc/mihal-face.webp' }
};
const STORY_BGS = {
    guild: '<img src="img/bg/guild-sm.webp" srcset="img/bg/guild-sm.webp 800w, img/bg/guild.webp 1600w" sizes="100vw" alt="" decoding="async">',
    arena: '<img src="img/bg/arena-sm.webp" srcset="img/bg/arena-sm.webp 800w, img/bg/arena.webp 1600w" sizes="100vw" alt="" decoding="async">'
};

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
        ['g', 'お前たちに頼みたい仕事がある'],
        ['g', 'B2 で仕留めたはずの連中の残党が、迷宮の各層で目撃されている。数は少ないが、以前よりも手強いらしい。あの異常な質のシャードと、無関係とは思えない'],
        ['g', 'もう一度潜って、確かめてきてくれ。今度は条件が厳しい。全滅すれば、持ち込んだものは何も戻らない']
    ] },
    // ---- 第2章「還らずの森」（P9.23.0） ----
    c2_start: { title: '還らずの森の捜索依頼', lines: [
        ['g', '迷宮の件、ご苦労だった'],
        ['g', 'さっそくだが、頼みたい仕事がある'],
        ['g', '還らずの森に入った調査隊が、予定の日を過ぎても戻ってこない'],
        ['g', '森はもともと危険な場所だ。多少の遅れなら珍しくもないが、今回は様子が違う'],
        ['g', '調査隊には経験を積んだ冒険者もいた。何の連絡もないまま全員が行方知れずというのは、どうにも引っかかる'],
        ['g', 'お前たちには、森に入って調査隊の足取りを追ってもらいたい'],
        ['g', '無理はしないでくれ。何が起きているのか、まだ分からないからな']
    ] },
    c2_a1: { title: '残された足跡', lines: [
        ['n', '森の入口付近で、調査隊が残したと思われる野営地と荷物を発見した。\n争った形跡は見当たらず、荷物も多くがそのまま残されていた。\n残された足跡は森の奥へと続いている。'],
        ['g', 'なるほど。荷物を残して移動した、か'],
        ['g', '魔物に襲われたのなら、争った跡の一つもあっていいはずだが……'],
        ['g', '足跡が続いているなら、まだ追える。まずはそれをたどってみてくれ'],
        ['g', '何か見つけたら、また知らせてくれ']
    ] },
    c2_a2: { title: '壊れた記録', lines: [
        ['n', '森の奥で、調査隊が残した記録の一部を発見した。\n記録には、隊員たちの様子に異変が起こっていたと読み取れるような記述があった。\nしかし、記録は途中で途切れており、その後の状況は分からない。'],
        ['g', '原因は分からないが、森の奥で何かが起きているのは間違いなさそうだ'],
        ['g', '記録の続きが残っているかもしれない。もう少し奥を調べてきてくれ。……嫌な予感がする']
    ] },
    c2_a3: { title: '帰還者', lines: [
        ['n', '森の奥で、行方不明となっていた調査隊の一員を発見した。\n生存していたものの、ひどく衰弱しており、まともな会話が成立しない。\nどうにか聞き取れた言葉は、断片的なものばかりだった。'],
        ['n', '「……花じゃない」\n「逃げろって、言ったのに……」'],
        ['n', '帰還者はそれ以上、まともに答えることができなかった。\n調査隊の残りの隊員については、依然として行方が分からない。'],
        ['g', '生存者がいたのか……。だが、その様子では詳しい話を聞くのは難しいな'],
        ['g', '何を見たのかは分からない。無理に聞き出そうとしても、今はどうにもならないだろう'],
        ['g', 'ここまで来た以上、調査を打ち切るわけにはいかない'],
        ['g', '足取りは、さらに森の奥へ続いているのだろう？'],
        ['g', '頼む。奥に何があるのか、確かめてきてくれ']
    ] },
    c2_a4: { title: '森の最奥', lines: [
        ['n', '森の最深部で、調査隊が残した装備と、異様な姿をした魔物を発見した。\n激しい戦闘の末、魔物を討伐。調査隊の行方を追う中で遭遇した脅威は、ひとまず排除された。'],
        ['n', '討伐した魔物の身体には、一本の短剣が刺さっていた。\n冒険者たちが使う一般的な武器とは異なる意匠。その柄には、見慣れない紋章が刻まれている。\n短剣を回収してギルドへ持ち帰ることにした。'],
        ['g', 'そうか……。森の奥には、そんな魔物がいたのか'],
        ['g', 'よく戻った。これで森の調査はひとまず終わりだ'],
        ['g', 'だが、行方不明になった者が全員見つかったわけではない。手放しで喜べる結果でもないな'],
        ['g', '……ん？　この短剣は、あの魔物に刺さっていたのか'],
        ['n', 'ガレオンは短剣を受け取り、柄に刻まれた紋章を確かめる。'],
        ['g', '見慣れない紋章だな。少なくとも、俺にはすぐに心当たりが浮かばない'],
        ['g', 'これは俺が預かろう。少し調べてみる'],
        ['g', '何か分かれば知らせる。今は、お前たちも休んでくれ'],
        ['g', '今回の依頼、ご苦労だった'],
        ['n', '還らずの森での捜索依頼は完了した。\n森の奥に潜んでいた脅威は討伐されたものの、行方不明となった冒険者たちのすべてが見つかったわけではない。\nそして、討伐した魔物に刺さっていた、見慣れない紋章の短剣。\nその出所が明らかになることは、まだなかった。']
    ] },
    // ---- P9.24.0 イベント「最強コンビ」ミハル＆クラウス ----
    // cast: 出てくる人（左から）。start: 最初から見えている人。3つめの要素 { enter, exit, pose } で出入りと構えを切り替える
    ev_duo1: { title: 'ギルドでの再会', cast: ['g', 'k', 'm'], start: ['g'], lines: [
        ['n', 'ギルドの扉が開き、二人の冒険者が入ってくる。', { enter: ['k', 'm'] }],
        ['k', 'よう、ガレオン。相変わらず景気の悪そうな顔をしているね'],
        ['g', 'お前も相変わらずだな。無事だったか'],
        ['k', 'おかげさまで。最前線の様子だが、南西側の魔物が少し増えている。今のところ大きな問題はないよ'],
        ['m', '道も少し荒れてた。補給が遅れると困ると思う'],
        ['g', '分かった。こちらからも手を回しておこう。……今回はしばらく滞在するのか？'],
        ['k', 'そうだな。物資の補充もあるし、私もしばらくゆっくりさせてもらうつもりだ'],
        ['g', 'なら、いつもの頼みだ。その間、闘技場で新人どもに稽古をつけてやってくれ'],
        ['m', 'うん。わたしは甘いものがあれば、それでいいよ'],
        ['k', '私は酒で頼む。できれば、いつもより少し良いものを'],
        ['g', '分かった。用意しておく'],
        ['n', 'クラウスはギルド内にいる冒険者たちへ目を向ける。'],
        ['k', 'というわけで、私たちは闘技場にいます。腕に覚えのある方は、いつでもどうぞ'],
        ['m', '待ってるね'],
        ['n', '二人は連れ立ってギルドを出ていった。', { exit: ['k', 'm'] }]
    ] },
    duo_meet: { title: '闘技場での対面', event: true, bg: 'arena', cast: ['k', 'm'], start: [], lines: [
        ['n', '闘技場では、先に別の冒険者が二人に挑んでいた。\nクラウスとミハルの連携の前に、冒険者はあっという間に敗れた。', { enter: ['k', 'm'] }],
        ['k', 'さて、次は君たちかな？'],
        ['m', 'うん。次の人だね。今度はどんな相手かな'],
        ['n', 'ミハルは刀の柄に手をかけ、真剣な面持ちでこちらを見つめる。'],
        ['m', 'クラウス、準備はいい？　全力でいくよ'],
        ['k', '待ちなさい、ミハル。新人相手なんだから、ちゃんと手加減するんだよ'],
        ['m', '……手加減？'],
        ['k', 'そう。いつもの調子で斬り込んだら、稽古にならないだろう？'],
        ['m', 'そっか。分かった。ちゃんと気をつけるね'],
        ['k', '頼むよ。では、始めようか'],
        ['n', '二人がそれぞれの武器を構える。', { pose: 'battle' }],
        ['m', 'よろしくね']
    ] },
    duo_lose1: { title: '初めての敗北', event: true, bg: 'arena', cast: ['k', 'm'], start: ['k', 'm'], lines: [
        ['k', 'お疲れさま。私たちに挑んだその勇気は、称賛に値するよ'],
        ['m', 'うん。……さっきの、ちょっと良かったよ。また来てね'],
        ['k', '急ぐ必要はないさ。いつでも待っているよ']
    ] },
    duo_win1: { title: '二人を撃破', event: true, bg: 'arena', cast: ['k', 'm'], start: ['k', 'm'], lines: [
        ['k', 'いやあ、参ったね。まさか私たちが負けるとは'],
        ['m', '強いね。わたしたちの負けだよ'],
        ['k', '少し手加減しすぎたかな……なんてね。君たちの実力は本物だ'],
        ['m', 'うん。いつか前線で一緒に戦える日が楽しみだね'],
        ['k', 'ああ。その日が来るのを、気長に待っているよ']
    ] }
};
/** 1タップで進む短い会話（再挑戦・2回目以降の敗戦・再勝利）。rounds は敗戦のときの経過ラウンド */
function duoShortLines(kind, rounds) {
    if (kind === 'retry') return [
        ['n', '闘技場を再び訪れると、二人は変わらず待っていた。'],
        ['k', 'おや、また来てくれたんだね。何度でも歓迎するよ'],
        ['m', 'うん。わたしたちはいつでも相手になるよ'],
        ['k', '納得いくまで挑戦してくれ。それでは、始めようか'],
        ['n', '二人が武器を構える。']];
    if (kind === 'lose') return [
        ['k', rounds >= 5 ? '惜しかったね。次は勝てるかもしれないよ' : 'いい筋してると思うよ'],
        ['m', 'うん。また挑戦してね']];
    return [['k', 'またやられたね。もう新人とは呼べないかな']];
}
const STORY_CHAPTERS = { 1: '第1章　はじまりの迷宮', 2: '第2章　還らずの森' };
const STORY_TIP_KEY = 'sv_tip_levelup_v1';

/** justSeen：この表示中（ページを開いてから）に見た場面。later の場面は、前の場面を見た直後には出さない（次に拠点を開いたとき／次の帰還で） */
const SC = { el: null, id: null, i: 0, replay: false, pageAt: 0, justSeen: {}, busy: false, onDone: null };

function storyIsOpen() { return !!(SC.el && document.body.contains(SC.el)); }

/* ---------- 今やること（拠点の「ギルドの依頼」） ---------- */
/**
 * @returns {{title, detail?, go?: string, goLabel?: string, scene?: string, done?: boolean}|null}
 */
function storyObjective() {
    if (typeof storySeen !== 'function' || !storySeen('c1_intro')) return null;
    const pend = storyPending();
    if (pend) {
        const d = storyStepDef(pend);
        if (d && d.event) return { title: 'ギルドに顔を出す', detail: '見慣れない二人組が訪れているらしい', scene: pend, goLabel: '様子を見る', chapter: d.chapter };
        return { title: 'ギルドへ報告する', detail: 'ガレオンが話を待っている', scene: pend, goLabel: '報告する', chapter: d ? d.chapter : 1, reward: d ? d.reward : 0 };
    }
    const wait = { title: '体を休め、次の依頼を待て', detail: '次に拠点へ戻ったとき、ガレオンから話がある', chapter: 1 };
    let main;
    if (!storySeen('c1_f1')) main = { step: 'c1_f1', title: 'はじまりの迷宮 F1 を調査せよ', detail: '上層で目撃された変異体の実態を調べる', go: "expGoTo('labyrinth','f1','normal')", goLabel: '出撃する', chapter: 1 };
    else if (!storySeen('c1_b1')) main = { step: 'c1_b1', title: 'B1 で巣穴を突き止めろ', detail: '変異体がどこから這い出しているのかを探る', go: "expGoTo('labyrinth','b1','normal')", goLabel: '出撃する', chapter: 1 };
    else if (!storySeen('c1_b2')) main = { step: 'c1_b2', title: 'B2 の上位変異体を討て', detail: '臨時の合同討伐作戦', go: "expGoTo('labyrinth','b2','normal')", goLabel: '出撃する', chapter: 1 };
    else if (!storySeen('c2_start')) main = wait;
    else if (!storySeen('c2_a1')) main = { step: 'c2_a1', title: '還らずの森 エリア1 を踏破する', detail: '行方知れずの調査隊の足取りを追う', go: "expGoTo('forest','a1','normal')", goLabel: '出撃する', chapter: 2 };
    else if (!storySeen('c2_a2')) main = { step: 'c2_a2', title: '還らずの森 エリア2 を踏破する', detail: '森の奥へ続く足跡をたどる', go: "expGoTo('forest','a2','normal')", goLabel: '出撃する', chapter: 2 };
    else if (!storySeen('c2_a3')) main = { step: 'c2_a3', title: '還らずの森 エリア3 を踏破する', detail: '途切れた記録の続きを探す', go: "expGoTo('forest','a3','normal')", goLabel: '出撃する', chapter: 2 };
    else if (!storySeen('c2_a4')) main = { step: 'c2_a4', title: '還らずの森 エリア4 を踏破する', detail: '森の最奥に何があるのかを確かめる', go: "expGoTo('forest','a4','normal')", goLabel: '出撃する', chapter: 2 };
    else main = { title: '第2章 完', detail: '次の依頼を待て', done: true, chapter: 2 };
    if (main.step) { const d = storyStepDef(main.step); if (d && d.reward) main.reward = d.reward; }
    // 寄り道：迷宮の残党（チャレンジ）。依頼を受けたあと、踏破していないものを1つ。3つすべて踏破で報酬（1回）
    if (storySeen('c1_remnant')) {
        const ch = ['f1', 'b1', 'b2'].find(s => !isStageCleared('labyrinth', s, 'challenge'));
        if (ch) main.side = { title: `迷宮の残党を調査せよ（チャレンジ ${ch.toUpperCase()}）`, detail: '全滅すると、入場料と持ち帰るはずの SS を失う', go: `expGoTo('labyrinth','${ch}','challenge')`, reward: QUEST_SIDE_REWARD };
    }
    return main;
}

/** いま見せてよい場面（順番どおりの最初の1つ。later は時間をおいてから） */
function storyPending() {
    if (typeof STORY_STEPS === 'undefined' || typeof storyCanSee !== 'function') return null;
    for (const s of STORY_STEPS) {
        if (!storyCanSee(s.id)) continue;
        if (s.id === 'c1_intro') return null;   // 依頼は冒険者名の登録のあとにだけ（下の storyAfterName）
        if (s.later && SC.justSeen[s.need]) continue;   // 前の場面を見た直後は出さない（ほかの場面は先に出してよい）
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
    if (typeof duoBusy === 'function' && duoBusy()) return false;
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
    SC.justSeen = {};   // 帰還したら「次の機会」
    setTimeout(() => { if (!storyCheck()) storyTipLevelUp(); }, 300);
}

/* ---------- 場面の表示 ---------- */
function storyOpen(id, opts) {
    const sc = STORY_SCENES[id];
    if (!sc) return;
    opts = opts || {};
    storyClose(true);
    SC.id = id; SC.i = 0; SC.replay = !!opts.replay; SC.onDone = opts.onDone || null;
    const def = (typeof storyStepDef === 'function') ? storyStepDef(id) : null;
    const label = sc.event ? '闘技場イベント　最強コンビ' : (STORY_CHAPTERS[def ? def.chapter : 1] || '');
    const cast = sc.cast || ['g'];
    // 1人（ガレオンだけ）のときは今までどおり。複数のときは左から並べ、話している人を明るくする
    const figs = cast.length === 1
        ? `<div class="sc-npc" aria-hidden="true"><img src="${STORY_CAST[cast[0]].stand}" alt="" decoding="async"></div>`
        : `<div class="sc-cast n${cast.length}" aria-hidden="true">` + cast.map((c, i) => {
            const shown = !sc.start || sc.start.indexOf(c) >= 0;
            return `<div class="sc-fig p${i}${shown ? ' on' : ''}" data-who="${c}"><img src="${STORY_CAST[c].stand}" alt="" decoding="async"></div>`;
        }).join('') + `</div>`;
    // 構えの絵は先に読み込んでおく
    cast.forEach(c => { if (STORY_CAST[c].battle) { const im = new Image(); im.src = STORY_CAST[c].battle; } });
    const el = document.createElement('div');
    el.id = 'story-scene'; el.className = 'sc' + (cast.length > 1 ? ' multi' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', sc.title);
    el.innerHTML = `
        <div class="sc-bg" aria-hidden="true">${STORY_BGS[sc.bg || 'guild']}</div>
        ${figs}
        <div class="sc-top"><span class="sc-chap"><span>${esc(label)}</span>　<span>${esc(sc.title)}</span></span><button type="button" class="sc-skip" onclick="event.stopPropagation();storyFinish()">スキップ</button></div>
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
/** 台詞をかぎかっこで囲む（英語は “ ”）。ここで訳す（画面の自動翻訳はかっこ付きの文を探せないため） */
function storyQuote(who, text) {
    const en = typeof I18N !== 'undefined' && I18N.lang === 'en';
    const raw = (typeof T === 'function') ? T(text) : text;
    return who === 'n' ? raw : (en ? '\u201c' + raw + '\u201d' : '「' + raw + '」');
}
function storyWhoName(who) { return STORY_CAST[who] ? STORY_CAST[who].name : ''; }
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
    const who = ln[0], talk = who !== 'n';
    const fx = ln[2] || {};
    box.classList.toggle('narr', !talk);
    box.dataset.who = who;
    SC.el.classList.toggle('talking', talk);
    // 出入り・構え・話し手の強調（複数人の場面）
    SC.el.querySelectorAll('.sc-fig').forEach(f => {
        const c = f.dataset.who;
        if (fx.enter && fx.enter.indexOf(c) >= 0) f.classList.add('on');
        if (fx.exit && fx.exit.indexOf(c) >= 0) f.classList.remove('on');
        if (fx.pose && STORY_CAST[c][fx.pose]) { const im = f.querySelector('img'); if (im.getAttribute('src') !== STORY_CAST[c][fx.pose]) { im.src = STORY_CAST[c][fx.pose]; f.classList.remove('pose'); void f.offsetWidth; f.classList.add('pose'); } }
        f.classList.toggle('speak', talk && c === who);
    });
    name.textContent = talk ? ((typeof T === 'function') ? T(storyWhoName(who)) : storyWhoName(who)) : '';
    text.textContent = storyQuote(who, ln[1]);
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
    const id = SC.id, replay = SC.replay, onDone = SC.onDone;
    SC.onDone = null;
    storyClose();
    // 闘技場のイベント会話（依頼の進み具合とは別）：続きの処理へ
    if (onDone) { setTimeout(onDone, replay ? 0 : 380); return; }
    if (replay || !(typeof storyStepDef === 'function' && storyStepDef(id))) return;
    SC.busy = true;
    try {
        if (typeof serverMode === 'function' && serverMode()) {
            const r = await serverCall('story_seen', { id: id });
            if (!r || !r.ok) console.warn('story_seen', r);
            else storyRewardToast(r.result);
        } else if (typeof storyMarkSeen === 'function') {
            storyRewardToast(storyMarkSeen(id));
        }
    } catch (e) { console.warn(e); }
    SC.busy = false;
    SC.justSeen[id] = true;
    if (typeof currentScreen !== 'undefined' && currentScreen === 'home' && typeof renderHomeQuest === 'function') renderHomeQuest();
    setTimeout(() => { if (!storyCheck()) storyTipLevelUp(); }, 450);
}
/** P9.24.0 依頼の報酬（と寄り道の報酬）のお知らせ */
function storyRewardToast(r) {
    if (!r || typeof fxToast !== 'function') return;
    const parts = [];
    if (r.reward > 0) parts.push('依頼の報酬　+' + r.reward + ' SS');
    if (r.side > 0) parts.push('寄り道の報酬　+' + r.side + ' SS');
    if (!parts.length) return;
    fxToast(`<span class="fx-toast-fig"><img class="tip-face" src="img/npc/galeon-face.webp" alt=""></span><span class="fx-toast-main"><b>${esc(GALEON)}</b>${parts.map(t => `<span>${esc(t)}</span>`).join('')}</span>`, { tone: 'gold', sound: 'coin', key: 'quest-reward', ms: 5000 });
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
            <div class="hq-eyebrow"><span>ギルドの依頼</span>　<span>${esc(STORY_CHAPTERS[q.chapter || 1] || '')}</span></div>
            <div class="hq-title">${esc(q.title)}</div>
            ${q.detail ? `<div class="hq-detail">${esc(q.detail)}</div>` : ''}
            ${q.reward ? `<div class="hq-reward">報酬　${q.reward} SS</div>` : ''}
            <div class="hq-btns">${act && q.goLabel ? `<button type="button" class="btn btn-sm hq-go" onclick="${act}">${esc(q.goLabel)}</button>` : ''}<button type="button" class="hq-log" onclick="storyLogOpen()">これまでの依頼</button></div>
            ${q.side ? `<button type="button" class="hq-side" onclick="${q.side.go}"><span class="hq-side-tag">寄り道</span><span class="hq-side-main"><b>${esc(q.side.title)}</b><small>${esc(q.side.detail)}</small><small class="hq-reward">F1・B1・B2 をすべて踏破で報酬 ${q.side.reward} SS</small></span><span class="hq-side-go" aria-hidden="true">›</span></button>` : ''}
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
