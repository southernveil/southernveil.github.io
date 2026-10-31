/**
 * data.js — P8.2.4 クラス／スキル定義
 * uses: -1 = 無制限
 */
const STAT_KEYS = ['hp', 'atk', 'def', 'int', 'mnd', 'agi', 'dex'];
const MAX_LEVEL = 100;   // エンジン/敵の上限（敵は Lv100 まで生成できる）

/** 当面のプレイヤーレベルキャップ（P8.7.1）。引き上げるときはここと XP_COST_TO_REACH を伸ばす */
const PLAYER_LEVEL_CAP = 20;
/**
 * P9 成長費テーブル（確定）。
 * XP_COST_TO_REACH[L] = Lv(L-1)→L に必要な SS。別通貨XPは設けない。
 * 累計は Lv20 でちょうど 2400 SS。
 */
const XP_COST_TO_REACH = {
    2: 30, 3: 40, 4: 50, 5: 60, 6: 75, 7: 85, 8: 95, 9: 105, 10: 115, 11: 125,
    12: 135, 13: 150, 14: 160, 15: 170, 16: 180, 17: 190, 18: 200, 19: 210, 20: 225
};
/** 別名（SS 成長費として参照） */
const SS_COST_TO_REACH = XP_COST_TO_REACH;
/** Lv に到達するまでの累計 SS（Lv1 = 0） */
function xpTotalToReach(level) {
    let t = 0;
    for (let l = 2; l <= Math.min(level, PLAYER_LEVEL_CAP); l++) t += XP_COST_TO_REACH[l] || 0;
    return t;
}
function ssTotalToReach(level) { return xpTotalToReach(level); }

// ---- P9.4.6 引退・SS注入・SS抜き出し ----
/** ヤード総数の上限（引退キャラを含む） */
const YARD_MAX = 50;
/** 広告ポイント（祈りの欠片・仮称）。強さに直結しない便利機能・装飾にだけ使う */
const AD_POINT_NAME = '祈りの欠片';
const AD_POINT_PER_VIEW = 1;
const AD_DAILY_LIMIT = 5;          // 1日（日本時間）に受け取れる回数
const AD_MIN_INTERVAL_MS = 20000;  // 受け取りの最短間隔
const AD_POINT_CAP = 200;          // 所持上限
/** 広告機能のスイッチ（P9.19.1）。false の間は広告ボタンを出さず、サーバーも広告報酬を受け付けない（開発者アカウントは除く）。
 *  本物の広告をつなぐ日に true にして、サーバー用ファイルを作り直す */
const ADS_ENABLED = false;
/** 出撃後の広告ボーナス（P9.15.0）：出撃を AD_BONUS_RUNS 回ためると、結果画面で「SS +20%」か「祈りの欠片 +1」を選べる（10連は1回で達成） */
const AD_BONUS_RUNS = 5;
const AD_BONUS_SS_RATE = 0.2;      // ためた出撃分の報酬SSにかける割合（入場料は含まない）
/** 定型チャット（P9.16.0）。発言は番号(id)だけを保存し、表示時に各自の言語の文に置き換える */
const CHAT_POST_INTERVAL_MS = 10000;   // 1人あたりの発言間隔
const CHAT_KEEP_DAYS = 7;              // チャットの保存期間（古いものはサーバーが削除）
const CHAT_PRESET_CATS = [
    { id: 'greet', ja: 'あいさつ', en: 'Greetings' },
    { id: 'sortie', ja: '遠征', en: 'Expedition' },
    { id: 'react', ja: '反応', en: 'Reactions' },
    { id: 'base', ja: '拠点', en: 'Base' }
];
const CHAT_PRESETS = [
    { id: 'hello', cat: 'greet', ja: 'こんにちは', en: 'Hello' },
    { id: 'morning', cat: 'greet', ja: 'おはようございます', en: 'Good morning' },
    { id: 'evening', cat: 'greet', ja: 'こんばんは', en: 'Good evening' },
    { id: 'nice2meet', cat: 'greet', ja: 'よろしくお願いします', en: 'Nice to meet you' },
    { id: 'thanks', cat: 'greet', ja: 'ありがとう', en: 'Thank you' },
    { id: 'bye', cat: 'greet', ja: 'おつかれさまでした', en: 'Good work today' },
    { id: 'go', cat: 'sortie', ja: '遠征に行ってきます', en: 'Heading out on an expedition' },
    { id: 'back', cat: 'sortie', ja: '無事に帰還しました', en: 'Back safe and sound' },
    { id: 'cleared', cat: 'sortie', ja: '初踏破しました！', en: 'First clear!' },
    { id: 'wiped', cat: 'sortie', ja: '全滅しました…', en: 'We got wiped…' },
    { id: 'tough', cat: 'sortie', ja: 'このダンジョン、手強い', en: 'This dungeon is tough' },
    { id: 'loot', cat: 'sortie', ja: '良いものを拾いました', en: 'Found something good' },
    { id: 'luck', cat: 'sortie', ja: 'ご武運を', en: 'Good luck out there' },
    { id: 'congrats', cat: 'react', ja: 'おめでとう！', en: 'Congrats!' },
    { id: 'welldone', cat: 'react', ja: 'お見事', en: 'Well done' },
    { id: 'ok', cat: 'react', ja: '了解', en: 'Got it' },
    { id: 'sorry', cat: 'react', ja: 'ごめんなさい', en: 'Sorry' },
    { id: 'hmm', cat: 'react', ja: 'うーん…', en: 'Hmm…' },
    { id: 'lol', cat: 'react', ja: '（笑）', en: 'lol' },
    { id: 'recruit', cat: 'base', ja: '新しい仲間が来ました', en: 'A new recruit joined' },
    { id: 'retire', cat: 'base', ja: '仲間が引退しました', en: 'One of mine just retired' },
    { id: 'rules', cat: 'base', ja: 'ルールを練り直し中', en: 'Reworking my rules' },
    { id: 'broke', cat: 'base', ja: 'SSが足りない…', en: 'Out of SS…' },
    { id: 'levelup', cat: 'base', ja: 'レベルが上がりました', en: 'Leveled up' }
];
/** 常設PVP（闘技場・P9.17.0）。数値はここだけで管理する（サーバーとブラウザで共通） */
const PVP_CONFIG = {
    cycleMs: 6 * 3600000,          // 周期：6時間
    tzOffsetMs: 9 * 3600000,       // 時刻は日本時間で考える
    deadlineOfDayMs: (5 * 60 + 50) * 60000,   // 締切 5:50 / 11:50 / 17:50 / 23:50（6時間ごと）
    resultDelayMs: 10 * 60000,     // 締切から結果が出るまでの目安（0:00 / 6:00 / 12:00 / 18:00）
    minPlayers: 5,                 // この人数に満たない周期は対戦しない
    groupSize: 5,                  // 基本のグループ人数（余りは既存グループに1人ずつ足す）
    groupJitter: 60,               // 組分けで MMR に加える揺らぎ（毎回同じ相手になりにくくする）
    inactiveDays: 7,               // この日数操作していないと休止（次のログインで自動復帰）
    mmrDefault: 1500,              // 比べる相手がいないときの初期値
    seedMin: 1200, seedMax: 1800,  // 初期値・シーズン開始時は獲得SSの順位でこの範囲に置く
    k: 32, kNew: 48, newCycles: 5, // Elo の K（参加して最初の5周期だけ大きく）
    keepDays: 30,                  // 詳細ログを再計算できる期間（スナップショットの保存期間）
    tickBudgetMs: 1200,            // 定期処理1回あたりの戦闘処理時間の上限
    rankingTop: 100, aroundN: 3
};
/** 冒険者名：最初の1回は無料、変更は祈りの欠片で行う */
const PLAYER_NAME_MAX = 12;
const PLAYER_NAME_COST = 3;
/** 出撃のクールタイム（P9.14.0）：完了した出撃1回につき30秒。10連なら5分。サーバーが管理する（テスト実行は対象外） */
const EXPEDITION_COOLDOWN_MS_PER_RUN = 30000;
const AD_SHOP = {
    yard:  { label: 'ヤード枠拡張', desc: 'ヤードの上限を +5 体', cost: 10, add: 5, maxExtra: 30 },
    party: { label: 'パーティ枠追加', desc: 'パーティセットを +1 つ', cost: 15, add: 1, maxExtra: 2 }
};
/** 出撃係数：出撃60回（寿命を使い切る）で 1.0、少ないほど比例して下がる（0回で 0） */
function retireExpeditionFactor(ch) {
    const max = (ch && ch.lifespanMax) || (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60);
    const left = (ch && typeof ch.lifespan === 'number') ? ch.lifespan : max;
    const used = Math.max(0, Math.min(max, max - left));
    return max > 0 ? used / max : 0;
}
/** 抜き出し倍率（Lv倍率）：Lv9以下は一律 0.80、Lv10=1.00、Lv20=1.20（Lv10〜20は直線補間）。最終倍率 = Lv倍率 × 出撃係数 */
const RETIRE_MULT_BELOW_10 = 0.80;
const RETIRE_MULT_LV10 = 1.00;
const RETIRE_MULT_LV20 = 1.20;
function retireMultiplier(level) {
    const lv = Math.max(1, Math.min(PLAYER_LEVEL_CAP, level | 0 || 1));
    if (lv < 10) return RETIRE_MULT_BELOW_10;
    if (lv >= 20) return RETIRE_MULT_LV20;
    return RETIRE_MULT_LV10 + (RETIRE_MULT_LV20 - RETIRE_MULT_LV10) * (lv - 10) / 10;
}

/** 累計 SS 消費量からレベルを求める（互換用） */
function levelFromTotalXp(xp) {
    let lv = 1;
    while (lv < PLAYER_LEVEL_CAP && xp >= xpTotalToReach(lv + 1)) lv++;
    return lv;
}
/** 次レベルに必要な SS。キャップ到達時は null */
function ssCostToNextLevel(level) {
    const next = (level | 0) + 1;
    if (next > PLAYER_LEVEL_CAP) return null;
    return XP_COST_TO_REACH[next] != null ? XP_COST_TO_REACH[next] : null;
}

/**
 * アクセサリー強化費（P9 たたき台・未確定）。正式値ではない。
 * ACCESSORY_UPGRADE_COST[L] = Lv(L-1)→L の必要 SS
 */
/** アクセサリー強化費（P9.7.0で従来の10倍）。ACCESSORY_UPGRADE_COST[L] = Lv(L-1)→L の必要 SS。累計 19,000 */
const ACCESSORY_UPGRADE_COST = {
    2: 100, 3: 200, 4: 300, 5: 400, 6: 500, 7: 600, 8: 700, 9: 800, 10: 900,
    11: 1000, 12: 1100, 13: 1200, 14: 1300, 15: 1400, 16: 1500, 17: 1600, 18: 1700, 19: 1800, 20: 1900
};
const ACCESSORY_LEVEL_CAP = 20;
/** アクセサリー能力の確定マイルストーン（中間Lvは線形補間） */
const ACCESSORY_STAT_MILESTONES = { 1: 2, 5: 4, 10: 6, 15: 8, 20: 10 };
const ACCESSORY_RESIST_MILESTONES = { 1: 1, 5: 2, 10: 3, 15: 4, 20: 5 };

/**
 * 戦闘ルール解放費（条件・対象ごと）。key = 条件/対象の表示文字列
 * cost: null = 初期解放 / number = SS費用 / 'drop' = ドロップ専用
 */
const CONDITION_UNLOCK_DEFS = {
    '常に': { cost: null },
    '自身のHPが50%以下': { cost: null },
    '自身のHPが30%以下': { cost: 100 },
    '自身のHPが80%以下': { cost: 100 },
    '自身が状態異常': { cost: null },
    '自身が状態異常ではない': { cost: 100 },
    '自身が強化状態': { cost: null },
    '自身が強化状態でない': { cost: 100 },
    '味方のHPが50%以下': { cost: null },
    '味方のHPが30%以下': { cost: 100 },
    '味方のHPが80%以下': { cost: 100 },
    '味方が状態異常(毒・麻痺・睡眠)': { cost: null },
    '味方が状態異常ではない': { cost: 100 },
    '味方に戦闘不能がいる': { cost: 100 },
    '強化状態の味方がいる': { cost: null },
    '強化状態の味方がいない': { cost: 100 },
    '強化状態の敵がいる': { cost: null },
    '強化状態の敵がいない': { cost: null },
    '敵の数が2体以上': { cost: null },
    '敵の数が1体のみ': { cost: 100 },
    '敵の数が3体以上': { cost: 100 },
    '自身が毒状態ではない': { cost: null },
    'ラウンド1（初手のみ）': { cost: 200 },
    'ラウンド5以降': { cost: 200 },
    'ラウンド10以降': { cost: 200 }
};
const TARGET_UNLOCK_DEFS = {
    '敵1体': { cost: null },
    '敵: HP最低': { cost: 'drop', dropFrom: 'boss_fang' },
    '敵: HP最高': { cost: 'drop', dropFrom: 'boss_mother' },
    '敵: 毒状態': { cost: 200 },
    '敵: 麻痺状態': { cost: 200 },
    '敵: 睡眠状態': { cost: 200 },
    '敵: 強化状態': { cost: null },
    '敵: 強化状態でない': { cost: 100 },
    '状態異常でない敵': { cost: 100 },
    '味方1体': { cost: null },
    '味方: HP最低': { cost: null },
    '味方: HP最高': { cost: 100 },
    '味方: 強化状態': { cost: null },
    '味方: 強化状態でない': { cost: 100 },
    '味方: 戦闘不能': { cost: 200 },
    '自分自身': { cost: null },
    '味方: 状態異常(毒・麻痺・睡眠)': { cost: null }
};

/**
 * アクセサリー入手ルート（P9.7.0）
 * shop: 拠点で購入（誰か1人がLv10に到達していること。初回購入で種別解放、以降は何個でも）
 * drop: 踏破報酬ドロップ（CLEAR_DROP_TABLE 参照）
 */
const ACCESSORY_SHOP_PRICE = 500;
const ACCESSORY_SELL_SS = 50;     // P9.19.6: 上限で受け取れないドロップは自動売却
const ACCESSORY_MAX_COUNT = 5;   // P9.19.5: 同じ種類は5個まで（以前に5個を超えて持っていた分はそのまま）
const ACCESSORY_SHOP_REQUIRE_LEVEL = 10;
const ACCESSORY_UNLOCK_DEFS = {
    guard_band: { cost: ACCESSORY_SHOP_PRICE, source: 'shop' },
    poison_charm: { cost: ACCESSORY_SHOP_PRICE, source: 'shop' },
    iron_band: { cost: 'drop', source: 'drop', dropFrom: 'forest:normal' },
    spirit_ring: { cost: 'drop', source: 'drop', dropFrom: 'forest:normal' },
    paralysis_charm: { cost: 'drop', source: 'drop', dropFrom: 'forest:normal' },
    intellect_ring: { cost: 'drop', source: 'drop', dropFrom: 'labyrinth:challenge' },
    sleep_charm: { cost: 'drop', source: 'drop', dropFrom: 'labyrinth:challenge' }
};
/** 踏破報酬ドロップ表。key = ダンジョンID:モード。踏破時のみ rolls 回抽選（各 rate、当選時は items から等確率） */
const CLEAR_DROP_TABLE = {
    'forest:normal': { rolls: 1, rate: 0.25, items: ['iron_band', 'spirit_ring', 'paralysis_charm'], label: '還らずの森' },
    'labyrinth:challenge': { rolls: 2, rate: 0.25, items: ['intellect_ring', 'sleep_charm'], label: '始まりの迷宮（チャレンジ）' }
};

/** バトルルール行数の解放（P9.7.0）: 初期3行 / Lv10到達で+1 / 迷宮チャレンジB2初踏破で+1 → 最大5 */
const RULE_ROWS_INITIAL = 3;
const RULE_ROWS_MAX = 5;
const RULE_ROWS_LV10_LEVEL = 10;
const RULE_ROWS_B2_KEY = 'labyrinth:b2:challenge';


const conditions = [
    '常に', '自身のHPが50%以下', '味方のHPが50%以下', '味方が状態異常(毒・麻痺・睡眠)',
    '敵の数が2体以上', '自身が毒状態ではない', '味方のHPが80%以下', '味方のHPが30%以下',
    '強化状態の敵がいる', '強化状態の敵がいない', '強化状態の味方がいる', '強化状態の味方がいない',
    // P9.3.6 追加（末尾追記で既存インデックス互換）
    '自身のHPが30%以下', '自身のHPが80%以下', '自身が状態異常', '自身が状態異常ではない',
    '自身が強化状態', '自身が強化状態でない', '味方が状態異常ではない', '味方に戦闘不能がいる',
    '敵の数が1体のみ', '敵の数が3体以上',
    'ラウンド1（初手のみ）', 'ラウンド5以降', 'ラウンド10以降'
];
const targets = [
    '敵: HP最低', '敵1体', '味方: HP最低', '味方: 状態異常(毒・麻痺・睡眠)',
    '自分自身', '敵: HP最高', '敵: 毒状態', '敵: 麻痺状態', '敵: 睡眠状態',
    '敵: 強化状態', '敵: 強化状態でない', '味方: 強化状態', '味方: 強化状態でない',
    '状態異常でない敵', '味方: 戦闘不能',
    // P9.3.6 追加
    '味方1体', '味方: HP最高'
];

const ATTACK_SKILLS = [
    '通常攻撃', 'ダブルアタック', 'リベンジブロウ', 'ガードブレイク', 'ファイア', '毒手', 'セイントストライク', 'ポイズンボム',
    '居合一閃', '魔剣解放', 'メテオ', 'カオスゲート', 'マナブレイク', '深淵の呪詛',
    '幻影剣舞', 'オール・イン', '影分身'
];
const AOE_SKILLS = [
    'サンダーストーム', 'スリープミスト', 'ベノムパラリシス', 'ガードアップ',
    '居合一閃', 'カオスゲート', '大地の恵み', '深淵の呪詛', 'ソウルサクリファイス'
];

const SKILL_DEFS = {
    attack:         { name: '通常攻撃',           uses: -1, type: 'single', ratio: 1.0, atkStat: 'atk', defStat: 'def', unlockLevel: 1 },
    heavy:          { name: 'ダブルアタック',               uses: 10, type: 'single', ratio: 0.9, hits: 2, atkStat: 'atk', defStat: 'def', unlockLevel: 1 },
    revengeBlow:    { name: 'リベンジブロウ',     uses: 5,  type: 'single', ratio: 1.0, atkStat: 'atk', defStat: 'def', unlockLevel: 10 },
    guardBreak:     { name: 'ガードブレイク',     uses: 10, type: 'single', ratio: 1.2, atkStat: 'atk', defStat: 'def', unlockLevel: 15, defDown: 0.3, defDownTurns: 3 },
    guardUp:        { name: 'ガードアップ',       uses: 10, type: 'aoe',    ratio: 0, unlockLevel: 5 },
    cover:          { name: 'かばう',             uses: 10, type: 'cover',  ratio: 0 },
    provoke:        { name: '挑発',               uses: 10, type: 'single', ratio: 0 },
    guardCounter:   { name: 'ガードカウンター',   uses: 10, type: 'self',   ratio: 0 },
    heal:           { name: 'ヒール',             uses: 10, type: 'single', ratio: 0, unlockLevel: 1 },
    recovery:       { name: 'リカバリー',         uses: 10, type: 'single', ratio: 0, unlockLevel: 5 },
    saintStrike:    { name: 'セイントストライク', uses: 10, type: 'single', ratio: 1.2, atkStat: 'mnd', defStat: 'def', unlockLevel: 10 },
    sleepMist:      { name: 'スリープミスト',     uses: 10, type: 'aoe',    ratio: 0, unlockLevel: 15 },
    fire:           { name: 'ファイア',           uses: 10, type: 'single', ratio: 1.6, atkStat: 'int', defStat: 'mnd', unlockLevel: 1 },
    thunderstorm:   { name: 'サンダーストーム',   uses: 10, type: 'aoe',    ratio: 1.2, atkStat: 'int', defStat: 'mnd', unlockLevel: 10 },
    poisonBomb:     { name: 'ポイズンボム',       uses: 10, type: 'single', ratio: 1.8, atkStat: 'int', defStat: 'mnd', unlockLevel: 15 },
    charge:         { name: 'チャージ',           uses: 10, type: 'self',   ratio: 0, unlockLevel: 5 },
    powerEnchant:   { name: 'パワーエンチャント', uses: 10, type: 'single', ratio: 0, unlockLevel: 1 },
    poisonHand:     { name: '毒手',               uses: 10, type: 'single', ratio: 1.2, atkStat: 'atk', defStat: 'def', unlockLevel: 5 },
    venomParalysis: { name: 'ベノムパラリシス',   uses: 10, type: 'aoe',    ratio: 0, unlockLevel: 10 },
    guardianBarrier:{ name: '守護方陣',           uses: 10, type: 'single', ratio: 0, unlockLevel: 15 },
    // 敵専用（プレイヤー skillsForClass には出さない）
    soulSacrifice:  { name: 'ソウルサクリファイス', uses: 1,  type: 'aoe',    ratio: 2.0, atkStat: 'int', defStat: 'mnd', enemyOnly: true, selfDamage: 100 },
    predation:      { name: '捕食',               uses: 2,  type: 'single', ratio: 0, enemyOnly: true, excludeSelf: true, fixedDamage: 50, selfHeal: 50 },
    reviveAlly:     { name: '蘇生',               uses: 2,  type: 'single', ratio: 0, enemyOnly: true, reviveHpRatio: 0.5 },
    // Lv50 3次固有
    royalGuard:     { name: 'ロイヤルガード',     uses: 2,  type: 'self',   ratio: 0 },
    iaiFlash:       { name: '居合一閃',           uses: 10, type: 'aoe',    ratio: 1.8, atkStat: 'atk', defStat: 'def', hybrid: 'int' },
    magicSword:     { name: '魔剣解放',           uses: 10, type: 'single', ratio: 2.0, atkStat: 'atk', defStat: 'def', hybrid: 'mnd' },
    berserkFeast:   { name: '狂戦士の宴',         uses: 10, type: 'self',   ratio: 0 },
    quartet:        { name: '4重奏',              uses: 10, type: 'self',   ratio: 0 },
    meteor:         { name: 'メテオ',             uses: 10, type: 'single', ratio: 1.5, hits: 3, atkStat: 'int', defStat: 'mnd' },
    chaosGate:      { name: 'カオスゲート',       uses: 10, type: 'aoe',    ratio: 1.5, atkStat: 'int', defStat: 'mnd' },
    manaBreak:      { name: 'マナブレイク',       uses: 10, type: 'self',   ratio: 0 },
    resurrection:   { name: 'リザレクション',     uses: 10, type: 'single', ratio: 0 },
    greatHeal:      { name: 'グレートヒール',     uses: 10, type: 'single', ratio: 0 },
    earthBless:     { name: '大地の恵み',         uses: 10, type: 'aoe',    ratio: 0 },
    abyssCurse:     { name: '深淵の呪詛',         uses: 10, type: 'aoe',    ratio: 2.0, atkStat: 'int', defStat: 'mnd', hybrid: 'mnd' },
    heroTale:       { name: '英雄譚',             uses: 10, type: 'single', ratio: 0 },
    phantomDance:   { name: '幻影剣舞',           uses: 10, type: 'single', ratio: 1.5, hits: 3, atkStat: 'atk', defStat: 'def', hybrid: 'dex' },
    allIn:          { name: 'オール・イン',       uses: 10, type: 'single', ratio: 0, atkStat: 'atk', defStat: 'def', hybrid: 'dex' },
    shadowClone:    { name: '影分身',             uses: 10, type: 'single', ratio: 1.2, hits: 3, atkStat: 'atk', defStat: 'def', hybrid: 'dex' }
};

/** 基本クラスID一覧（編成セレクト用） */
const BASE_CLASS_IDS = ['warrior', 'mage', 'cleric', 'enchanter'];

/**
 * CLASS_DEFS
 * tier1 base+growth / tier2-3 growth null (getClassGrowth) / bonus / classChangeOptions / actions(Lv50)
 */
const CLASS_DEFS = {
    warrior: {
        classId: 'warrior', name: '戦士', tier: 1, axis: null, baseClassId: 'warrior', unlockLevel: 1,
        base: { hp: 110, atk: 18, def: 12, int: 9, mnd: 9, agi: 7, dex: 9 },
        growth: { hp: 1.7, atk: 1.7, def: 1.4, int: 1.0, mnd: 1.1, agi: 1.2, dex: 1.3 },
        bonus: {}, classChangeOptions: { '陽光': 'paladin', '月輪': 'rune_knight' },
        skillKeys: ['attack', 'heavy', 'guardUp', 'revengeBlow', 'guardBreak'], actions: []
    },
    mage: {
        classId: 'mage', name: '魔法使い', tier: 1, axis: null, baseClassId: 'mage', unlockLevel: 1,
        base: { hp: 80, atk: 7, def: 6, int: 18, mnd: 12, agi: 13, dex: 10 },
        growth: { hp: 1.3, atk: 1.0, def: 1.2, int: 1.7, mnd: 1.5, agi: 1.4, dex: 1.3 },
        bonus: {}, classChangeOptions: { '陽光': 'mage_sun', '月輪': 'sorcerer' },
        skillKeys: ['attack', 'fire', 'thunderstorm', 'poisonBomb', 'charge'], actions: []
    },
    cleric: {
        classId: 'cleric', name: '僧侶', tier: 1, axis: null, baseClassId: 'cleric', unlockLevel: 1,
        base: { hp: 100, atk: 10, def: 10, int: 10, mnd: 18, agi: 10, dex: 10 },
        growth: { hp: 1.5, atk: 1.0, def: 1.3, int: 1.4, mnd: 1.7, agi: 1.3, dex: 1.4 },
        bonus: {}, classChangeOptions: { '陽光': 'priest_sun', '月輪': 'shaman' },
        skillKeys: ['attack', 'heal', 'recovery', 'saintStrike', 'sleepMist'], actions: []
    },
    enchanter: {
        classId: 'enchanter', name: '付術士', tier: 1, axis: null, baseClassId: 'enchanter', unlockLevel: 1,
        base: { hp: 90, atk: 14, def: 9, int: 12, mnd: 14, agi: 15, dex: 12 },
        growth: { hp: 1.4, atk: 1.2, def: 1.2, int: 1.3, mnd: 1.3, agi: 1.6, dex: 1.5 },
        bonus: {}, classChangeOptions: { '陽光': 'bard', '月輪': 'trickster' },
        skillKeys: ['attack', 'powerEnchant', 'poisonHand', 'venomParalysis', 'guardianBarrier'], actions: []
    },
    // 2次
    paladin: {
        classId: 'paladin', name: 'パラディン', tier: 2, axis: '陽光', baseClassId: 'warrior', unlockLevel: 20,
        base: null, growth: null, bonus: { hp: 30, def: 5, mnd: 2 },
        classChangeOptions: { '陽光': 'lord', '月輪': 'samurai' }, skillKeys: [], actions: []
    },
    rune_knight: {
        classId: 'rune_knight', name: 'ルーンナイト', tier: 2, axis: '月輪', baseClassId: 'warrior', unlockLevel: 20,
        base: null, growth: null, bonus: { atk: 10, def: 5, agi: 2 },
        classChangeOptions: { '陽光': 'mystic_knight', '月輪': 'berserker' }, skillKeys: [], actions: []
    },
    mage_sun: {
        classId: 'mage_sun', name: 'メイジ', tier: 2, axis: '陽光', baseClassId: 'mage', unlockLevel: 20,
        base: null, growth: null, bonus: { int: 10, mnd: 5, hp: 10 },
        classChangeOptions: { '陽光': 'archmage', '月輪': 'stargazer' }, skillKeys: [], actions: []
    },
    sorcerer: {
        classId: 'sorcerer', name: 'ソーサラー', tier: 2, axis: '月輪', baseClassId: 'mage', unlockLevel: 20,
        base: null, growth: null, bonus: { int: 10, hp: 15, def: 2 },
        classChangeOptions: { '陽光': 'warlock', '月輪': 'sage' }, skillKeys: [], actions: []
    },
    priest_sun: {
        classId: 'priest_sun', name: 'プリースト', tier: 2, axis: '陽光', baseClassId: 'cleric', unlockLevel: 20,
        base: null, growth: null, bonus: { hp: 30, mnd: 5, def: 2 },
        classChangeOptions: { '陽光': 'archbishop', '月輪': 'high_priest' }, skillKeys: [], actions: []
    },
    shaman: {
        classId: 'shaman', name: 'シャーマン', tier: 2, axis: '月輪', baseClassId: 'cleric', unlockLevel: 20,
        base: null, growth: null, bonus: { mnd: 10, int: 5, agi: 2 },
        classChangeOptions: { '陽光': 'druid', '月輪': 'cursemaker' }, skillKeys: [], actions: []
    },
    bard: {
        classId: 'bard', name: 'バード', tier: 2, axis: '陽光', baseClassId: 'enchanter', unlockLevel: 20,
        base: null, growth: null, bonus: { hp: 30, atk: 5, mnd: 2 },
        classChangeOptions: { '陽光': 'minstrel', '月輪': 'sword_dancer' }, skillKeys: [], actions: []
    },
    trickster: {
        classId: 'trickster', name: 'トリックスター', tier: 2, axis: '月輪', baseClassId: 'enchanter', unlockLevel: 20,
        base: null, growth: null, bonus: { dex: 10, atk: 5, hp: 10 },
        classChangeOptions: { '陽光': 'gambler', '月輪': 'ninja' }, skillKeys: [], actions: []
    },
    // 3次 戦士
    lord: {
        classId: 'lord', name: 'ロード', tier: 3, axis: '陽光', baseClassId: 'warrior', unlockLevel: 40,
        base: null, growth: null, bonus: { hp: 50, def: 10, atk: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['royalGuard']
    },
    samurai: {
        classId: 'samurai', name: 'サムライ', tier: 3, axis: '月輪', baseClassId: 'warrior', unlockLevel: 40,
        base: null, growth: null, bonus: { atk: 15, int: 10, hp: 10 },
        classChangeOptions: {}, skillKeys: [], actions: ['iaiFlash']
    },
    mystic_knight: {
        classId: 'mystic_knight', name: 'ミスティックナイト', tier: 3, axis: '陽光', baseClassId: 'warrior', unlockLevel: 40,
        base: null, growth: null, bonus: { mnd: 15, atk: 10, agi: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['magicSword']
    },
    berserker: {
        classId: 'berserker', name: 'ベルセルク', tier: 3, axis: '月輪', baseClassId: 'warrior', unlockLevel: 40,
        base: null, growth: null, bonus: { atk: 15, hp: 20, agi: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['berserkFeast']
    },
    // 3次 魔法
    archmage: {
        classId: 'archmage', name: 'アークメイジ', tier: 3, axis: '陽光', baseClassId: 'mage', unlockLevel: 40,
        base: null, growth: null, bonus: { int: 15, mnd: 10, def: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['quartet']
    },
    stargazer: {
        classId: 'stargazer', name: 'スターゲイザー', tier: 3, axis: '月輪', baseClassId: 'mage', unlockLevel: 40,
        base: null, growth: null, bonus: { int: 15, hp: 20, agi: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['meteor']
    },
    warlock: {
        classId: 'warlock', name: 'ウォーロック', tier: 3, axis: '陽光', baseClassId: 'mage', unlockLevel: 40,
        base: null, growth: null, bonus: { int: 15, def: 10, agi: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['chaosGate']
    },
    sage: {
        classId: 'sage', name: 'セージ', tier: 3, axis: '月輪', baseClassId: 'mage', unlockLevel: 40,
        base: null, growth: null, bonus: { int: 15, hp: 20, mnd: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['manaBreak']
    },
    // 3次 僧侶
    archbishop: {
        classId: 'archbishop', name: 'アークビショップ', tier: 3, axis: '陽光', baseClassId: 'cleric', unlockLevel: 40,
        base: null, growth: null, bonus: { hp: 50, mnd: 10, def: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['resurrection']
    },
    high_priest: {
        classId: 'high_priest', name: 'ハイプリースト', tier: 3, axis: '月輪', baseClassId: 'cleric', unlockLevel: 40,
        base: null, growth: null, bonus: { mnd: 15, def: 10, hp: 10 },
        classChangeOptions: {}, skillKeys: [], actions: ['greatHeal']
    },
    druid: {
        classId: 'druid', name: 'ドルイド', tier: 3, axis: '陽光', baseClassId: 'cleric', unlockLevel: 40,
        base: null, growth: null, bonus: { mnd: 15, int: 10, agi: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['earthBless']
    },
    cursemaker: {
        classId: 'cursemaker', name: 'カースメーカー', tier: 3, axis: '月輪', baseClassId: 'cleric', unlockLevel: 40,
        base: null, growth: null, bonus: { int: 15, mnd: 10, agi: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['abyssCurse']
    },
    // 3次 付術士
    minstrel: {
        classId: 'minstrel', name: 'ミンストレル', tier: 3, axis: '陽光', baseClassId: 'enchanter', unlockLevel: 40,
        base: null, growth: null, bonus: { hp: 50, def: 10, mnd: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['heroTale']
    },
    sword_dancer: {
        classId: 'sword_dancer', name: 'ソードダンサー', tier: 3, axis: '月輪', baseClassId: 'enchanter', unlockLevel: 40,
        base: null, growth: null, bonus: { atk: 15, hp: 20, def: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['phantomDance']
    },
    gambler: {
        classId: 'gambler', name: 'ギャンブラー', tier: 3, axis: '月輪', baseClassId: 'enchanter', unlockLevel: 40,
        base: null, growth: null, bonus: { dex: 15, hp: 20, atk: 5 },
        classChangeOptions: {}, skillKeys: [], actions: ['allIn']
    },
    ninja: {
        classId: 'ninja', name: 'ニンジャ', tier: 3, axis: '月輪', baseClassId: 'enchanter', unlockLevel: 40,
        base: null, growth: null, bonus: { dex: 15, atk: 10, hp: 10 },
        classChangeOptions: {}, skillKeys: [], actions: ['shadowClone']
    }
};

// 3次の axis: 陽光→月輪 は 2次の軸と異なる場合がある。表示用に 2次軸は history で表現。
// 表の通り axis は「最後に選んだ軸」として設定。gambler/ninja は月輪経路。

function getClassDef(classId) {
    return CLASS_DEFS[classId] || null;
}
/**
 * P9.22.0 メインクエスト（ギルドマスター・ガレオンの依頼）の進み具合
 * 場面の文章は js/story.js（画面側）。ここは「どの順に・何を満たしたら見られるか」だけ（サーバーも検証に使う）
 *   need: 先に見ている必要がある場面 / clear: 本番で踏破している必要があるステージ（dungeon:stage:mode）
 *   later: 前の場面を見たのとは別の機会（次に拠点を開いたとき・次の帰還）に出す
 */
const STORY_STEPS = [
    { id: 'c1_intro', chapter: 1, need: null },
    { id: 'c1_f1', chapter: 1, need: 'c1_intro', clear: 'labyrinth:f1:normal', reward: 50 },
    { id: 'c1_b1', chapter: 1, need: 'c1_f1', clear: 'labyrinth:b1:normal', reward: 50 },
    { id: 'c1_b2', chapter: 1, need: 'c1_b1', clear: 'labyrinth:b2:normal', reward: 100 },
    // P9.23.0 第2章「還らずの森」。開始は第1章の結びの次の機会。森エリア1の踏破後、次の機会に迷宮の残党（チャレンジ）
    { id: 'c2_start', chapter: 2, need: 'c1_b2', later: true },
    { id: 'c2_a1', chapter: 2, need: 'c2_start', clear: 'forest:a1:normal', reward: 50 },
    { id: 'c1_remnant', chapter: 1, need: 'c2_a1', later: true },
    { id: 'c2_a2', chapter: 2, need: 'c2_a1', clear: 'forest:a2:normal', reward: 50 },
    { id: 'c2_a3', chapter: 2, need: 'c2_a2', clear: 'forest:a3:normal', reward: 50 },
    // P9.24.0 イベント「ギルドでの再会」（ミハルとクラウス）。森エリア3の報告のあと、次の機会に拠点で
    { id: 'ev_duo1', chapter: 2, need: 'c2_a3', later: true, event: true },
    { id: 'c2_a4', chapter: 2, need: 'c2_a3', clear: 'forest:a4:normal', reward: 100 }
];
/** P9.24.0 寄り道（迷宮の残党：チャレンジ F1・B1・B2 をすべて踏破）の報酬。1回だけ。総獲得SSには数えない */
const QUEST_SIDE_REWARD = 150;
const QUEST_SIDE_STAGES = ['labyrinth:f1:challenge', 'labyrinth:b1:challenge', 'labyrinth:b2:challenge'];

/* ---- P9.24.0 称号（冒険者名の前に【】で付く。名前の文字数には数えない）---- */
const TITLE_DEFS = { twinstar: { name: '双星を越えし者' } };
function titleNameOf(id) { return (id && TITLE_DEFS[id]) ? TITLE_DEFS[id].name : ''; }
/** 表示名（称号つき）。meta はサーバー側のアカウント情報（playerName / title） */
function playerDisplayName(meta) {
    if (!meta || typeof meta.playerName !== 'string' || !meta.playerName) return '';
    const t = titleNameOf(meta.title);
    return (t ? '【' + t + '】' : '') + meta.playerName;
}

/* ---- P9.24.0 イベントバトル「最強コンビ」ミハル＆クラウス（闘技場）----
 * 何度でも・ペナルティなし（寿命・SS・MMR は変わらない）。相手はパーティA。
 * ルールは文字列で書き、読み込むときに条件・対象・アクションの番号に直す。acts は戦闘ログでの技名（専用名）
 */
const DUO_EVENT = {
    need: 'ev_duo1', title: 'twinstar', rowLimit: 4,
    units: [
        { key: 'mihal', name: 'ミハル', classId: 'samurai', level: 50, classHistory: ['warrior', 'paladin', 'samurai'],
            stats: { maxHp: 237, maxMp: 0, atk: 120, def: 38, int: 72, mnd: 69, agi: 70, dex: 77 },
            rules: [
                ['自身のHPが30%以下', '敵: HP最高', 'リベンジブロウ'],
                ['自身のHPが50%以下', '敵: HP最高', '居合一閃'],
                ['自身のHPが80%以下', '敵: HP最高', 'ダブルアタック'],
                ['常に', '自分自身', 'ガードアップ']
            ],
            acts: { 'リベンジブロウ': '日輪月蝕流 奥ノ型・天ノ逆鉾', '居合一閃': '日輪月蝕流 参ノ型・煌月天照', 'ダブルアタック': '日輪月蝕流 壱ノ型・双月連斬', 'ガードアップ': '日輪月蝕流 弐ノ型・陽炎' } },
        { key: 'klaus', name: 'クラウス', classId: 'high_priest', level: 50, classHistory: ['cleric', 'priest_sun', 'high_priest'],
            stats: { maxHp: 218, maxMp: 0, atk: 63, def: 40, int: 83, mnd: 125, agi: 78, dex: 83 },
            rules: [
                ['味方のHPが30%以下', '味方: HP最低', 'グレートヒール'],
                ['味方のHPが50%以下', '味方: HP最低', 'ヒール'],
                ['味方が状態異常(毒・麻痺・睡眠)', '味方: 状態異常(毒・麻痺・睡眠)', 'リカバリー'],
                ['常に', '敵: HP最低', 'セイントストライク']
            ],
            acts: { 'グレートヒール': '聖王の大慈悲', 'ヒール': '聖母の抱擁', 'リカバリー': '原罪洗礼', 'セイントストライク': 'ランス・オブ・ジャッジメント' } }
    ]
};
/** 対戦用のデータ（pvpBattle にそのまま渡せる形） */
function duoSnapshot() {
    return { v: 1, name: 'ミハル＆クラウス', rowLimit: DUO_EVENT.rowLimit, units: DUO_EVENT.units.map(u => {
        const all = skillsForClass(u.classId, u.level);
        return {
            name: u.name, classId: u.classId, level: u.level, classHistory: u.classHistory.slice(), portrait: 'npc:' + u.key,
            stats: Object.assign({ poisonResist: 0, paralysisResist: 0, sleepResist: 0 }, u.stats),
            skills: all.map(s => s.id),
            rules: u.rules.map(r => ({ active: true, cond: conditions.indexOf(r[0]), tgt: targets.indexOf(r[1]), skill: all.findIndex(s => s.name === r[2]) }))
        };
    }) };
}
/** 戦闘ログの技名を専用名に（name: ユニット名、action: 元の技名） */
function duoActName(name, action) {
    const u = DUO_EVENT.units.find(x => x.name === name);
    return (u && u.acts[action]) || action;
}
function storyStepDef(id) { return STORY_STEPS.find(s => s.id === id) || null; }

/**
 * P9.20.0 立ち絵のプリセット。img/pt/<key>.webp（駒用・上半身）と img/pt/<key>-full.webp（全身）
 * 性別などの区別はシステムに持たせない。どのキャラにも好きな絵を選べる（選んでいなければクラスの2枚から自動）
 */
const PORTRAIT_PRESETS = ['warrior_m', 'warrior_f', 'mage_m', 'mage_f', 'cleric_m', 'cleric_f', 'enchanter_m', 'enchanter_f'];
function portraitPresetOk(key) { return typeof key === 'string' && PORTRAIT_PRESETS.indexOf(key) >= 0; }
/** 絵のクラス（warrior など） */
function portraitPresetClass(key) { return String(key || '').replace(/_[a-z]+$/, ''); }
/** 選んでいないときの絵：基本クラスの絵から、seed（キャラID など）で決める */
function portraitDefaultKey(classId, seed) {
    const base = getBaseClassId(classId);
    const list = PORTRAIT_PRESETS.filter(k => portraitPresetClass(k) === base);
    if (!list.length) return PORTRAIT_PRESETS[0];
    let h = 0; const s = String(seed == null ? '' : seed);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return list[h % list.length];
}
/** キャラの絵（選んだもの、なければ自動） */
function portraitKeyOf(ch) {
    if (!ch) return PORTRAIT_PRESETS[0];
    return portraitPresetOk(ch.portrait) ? ch.portrait : portraitDefaultKey(ch.classId, ch.id != null ? ch.id : ch.cid);
}

function getBaseClassId(classId) {
    const d = getClassDef(classId);
    return d ? (d.baseClassId || classId) : classId;
}
function getClassGrowth(classId) {
    const d = getClassDef(classId);
    if (!d) return {};
    if (d.growth) return Object.assign({}, d.growth);
    const bg = (getClassDef(d.baseClassId || classId) || {}).growth || {};
    const add = d.tier === 3 ? 0.2 : (d.tier === 2 ? 0.1 : 0);
    const out = {};
    STAT_KEYS.forEach(k => {
        const v = bg[k];
        out[k] = (typeof v === 'number') ? Math.round((v + add) * 10) / 10 : v;
    });
    return out;
}
/**
 * 個体の実効成長率 = クラス成長率 + 個体成長率ボーナス(ch.growthBonus)
 * classId を渡すとそのクラス基準で計算（Lv再計算時に基本クラスを指定するため）
 */
function getCharGrowth(ch, classId) {
    const g = getClassGrowth(classId || (ch && ch.classId));
    const gb = (ch && ch.growthBonus) || {};
    const out = {};
    STAT_KEYS.forEach(k => {
        const v = g[k];
        out[k] = (typeof v === 'number' && gb[k])
            ? Math.round((v + gb[k]) * 10) / 10
            : v;
    });
    return out;
}
function getClassBonus(classId) {
    const d = getClassDef(classId);
    return (d && d.bonus) ? Object.assign({}, d.bonus) : {};
}
function getClassChangeOptions(classId) {
    const d = getClassDef(classId);
    return (d && d.classChangeOptions) ? Object.assign({}, d.classChangeOptions) : {};
}
function getClassName(classId) {
    const d = getClassDef(classId);
    return d ? d.name : classId;
}
function usesLabel(uses) {
    return (uses === undefined || uses === null || uses < 0) ? '∞' : String(uses);
}
function rollGrowth(rate) {
    const p2 = Math.max(0, Math.min(1, rate - 1));
    return Math.random() < p2 ? 2 : 1;
}

/** classHistory に含まれるか */
function historyHasClass(ch, classId) {
    if (!ch) return false;
    if (ch.classId === classId) return true;
    return Array.isArray(ch.classHistory) && ch.classHistory.indexOf(classId) >= 0;
}

/**
 * Lv30 強化を加味したスキル戦闘パラメータ
 * 戻り: { ratio, hits, healPct, poisonTurns, guardTurns, powerPlus, guardMnd }
 */
function getSkillCombatParams(ch, skillName) {
    const lv = (ch && ch.level) || 1;
    const base = {
        ratio: null, hits: null, healPct: null, poisonTurns: 3,
        guardTurns: 2, powerPlus: false, guardMnd: false
    };
    const def = Object.values(SKILL_DEFS).find(s => s.name === skillName);
    if (def) {
        base.ratio = def.ratio;
        base.hits = def.hits || 1;
    }
    if (lv < 30) return base;

    if (skillName === 'ガードアップ' && historyHasClass(ch, 'paladin')) {
        base.guardTurns = 3;
        base.guardMnd = true;
    }
    if (skillName === 'ダブルアタック' && historyHasClass(ch, 'rune_knight')) {
        base.ratio = 0.7;
        base.hits = 3;
    }
    if (skillName === 'ファイア' && historyHasClass(ch, 'mage_sun')) {
        base.ratio = (base.ratio || 1.6) + 0.2;
    }
    if (skillName === 'サンダーストーム' && historyHasClass(ch, 'sorcerer')) {
        base.ratio = (base.ratio || 1.2) + 0.3;
    }
    if (skillName === 'ヒール' && historyHasClass(ch, 'priest_sun')) {
        base.healPct = 0.55;
    }
    if (skillName === 'パワーエンチャント' && historyHasClass(ch, 'bard')) {
        base.powerPlus = true;
    }
    if (skillName === '毒手' && historyHasClass(ch, 'trickster')) {
        base.ratio = (base.ratio || 1.2) + 0.3;
        base.poisonTurns = 4;
    }
    return base;
}


/* =====================================================================
 * P8.5 Phase1: ダンジョン / 敵テンプレ / 撤退プロトコル（外部マスタ）
 * ★「暫定」は仕様未決定のたたき台。数値はここだけ直せば反映される。
 * ===================================================================== */

/** 1 出撃あたりの連戦数（3〜5 でランダム） */
/** @deprecated P9.1: 敵はテンプレ基礎値+成長。倍率は使わない */
const ENEMY_STAT_RATE = 1.0;
const EXPEDITION_BATTLES = [3, 5];
/** 暫定: 戦闘後の自動回復は、HP がこの割合未満の味方がいなくなるまで行う */
const POST_HEAL_THRESHOLD = 0.7;
/** 事後回復で使う回復系スキル（「残りヒール使用回数」の集計対象でもある） */
const HEAL_SKILL_NAMES = ['ヒール', 'グレートヒール', '大地の恵み'];

/**
 * P9.1 敵テンプレート
 * - base: Lv1 基礎ステ（ボスで fixedLevel がある場合は固定ステ）
 * - growth: 各ステ成長率（味方と同じ rollGrowth を使用）。fixedLevel ボスは成長しない
 * - rules: [条件, 対象, スキル名] 上から優先。敵専用AIは禁止
 * - drops: [{ type:'target'|'condition', id, rate }]
 */
const ENEMY_TEMPLATES = {
    // --- はじまりの迷宮（指示書確定） ---
    mut_claw: {
        id: 'mut_claw', name: '変異体・爪牙', classId: 'warrior',
        base: { hp: 75, atk: 12, def: 8, int: 6, mnd: 6, agi: 5, dex: 6 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    mut_weaver: {
        id: 'mut_weaver', name: '変異体・呪紡ぎ', classId: 'mage',
        base: { hp: 55, atk: 5, def: 4, int: 12, mnd: 8, agi: 9, dex: 7 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['常に', '敵1体', 'ファイア']
        ]
    },
    ghoul_priest: {
        id: 'ghoul_priest', name: '遺骸の僧兵', classId: 'cleric',
        base: { hp: 70, atk: 7, def: 7, int: 7, mnd: 12, agi: 7, dex: 7 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['味方のHPが50%以下', '味方: HP最低', 'ヒール'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    shard_stray: {
        id: 'shard_stray', name: '墜ちた野良冒険者', classId: 'enchanter',
        base: { hp: 65, atk: 10, def: 6, int: 8, mnd: 10, agi: 11, dex: 8 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['強化状態の味方がいない', '味方: 強化状態でない', 'パワーエンチャント'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },

    // --- はじまりの迷宮・チャレンジ用（P9.4.2） ---
    erode_claw: {
        id: 'erode_claw', name: '浸蝕体・爪牙', classId: 'warrior',
        base: { hp: 99, atk: 16, def: 9, int: 6, mnd: 6, agi: 5, dex: 6 },
        growth: { hp: 1.5, atk: 1.7, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['自身のHPが50%以下', '敵: HP最低', 'リベンジブロウ'],
            ['常に', '敵: HP最低', 'ダブルアタック']
        ]
    },
    erode_weaver: {
        id: 'erode_weaver', name: '浸蝕体・呪紡ぎ', classId: 'mage',
        base: { hp: 72, atk: 5, def: 4, int: 16, mnd: 9, agi: 10, dex: 7 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.7, mnd: 1.5, agi: 1.5, dex: 1.5 },
        extraSkills: ['soulSacrifice'],
        rules: [
            ['自身のHPが30%以下', '敵1体', 'ソウルサクリファイス'],
            ['常に', '自分自身', 'チャージ'],
            ['常に', '敵: HP最低', 'ファイア']
        ]
    },
    fanatic_priest: {
        id: 'fanatic_priest', name: '狂信の僧兵', classId: 'cleric',
        base: { hp: 90, atk: 7, def: 7, int: 7, mnd: 16, agi: 7, dex: 7 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.7, agi: 1.5, dex: 1.5 },
        rules: [
            ['味方が状態異常(毒・麻痺・睡眠)', '味方: 状態異常(毒・麻痺・睡眠)', 'リカバリー'],
            ['味方のHPが50%以下', '味方: HP最低', 'ヒール'],
            ['常に', '敵: HP最低', 'セイントストライク']
        ]
    },
    regret_vanguard: {
        id: 'regret_vanguard', name: '無念の先遣隊', classId: 'enchanter',
        base: { hp: 81, atk: 13, def: 6, int: 10, mnd: 11, agi: 13, dex: 8 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.7, dex: 1.5 },
        rules: [
            ['ラウンド1（初手のみ）', '味方: HP最高', 'パワーエンチャント'],
            ['味方のHPが50%以下', '味方: HP最低', '守護方陣'],
            ['常に', '敵: HP最低', '毒手']
        ]
    },
    boss_soul_fang: {
        id: 'boss_soul_fang', name: '蝕魂の牙王', classId: 'warrior',
        isBoss: true, fixedLevel: 20,
        base: { hp: 280, atk: 65, def: 40, int: 50, mnd: 40, agi: 40, dex: 50 },
        extraSkills: ['predation', 'reviveAlly'],
        rules: [
            ['自身のHPが50%以下', '味方: HP最低', '捕食'],
            ['味方に戦闘不能がいる', '味方: 戦闘不能', '蘇生'],
            ['常に', '敵: HP最低', 'ダブルアタック']
        ]
    },

    boss_fang: {
        id: 'boss_fang', name: '変異体・牙王', classId: 'warrior',
        isBoss: true, fixedLevel: 9,
        // 指示書の固定ステ（Lv9）。成長率行はデータ保持のみ（成長処理はしない）
        base: { hp: 150, atk: 33, def: 20, int: 19, mnd: 19, agi: 17, dex: 19 },
        growthNote: [110, 18, 12, 9, 9, 7, 9],
        rules: [
            ['自身のHPが50%以下', '敵: HP最低', 'リベンジブロウ'],
            ['常に', '敵1体', 'ダブルアタック']
        ],
        drops: [
            { type: 'target', id: '敵: HP最低', rate: 0.5, label: '敵最低HP（ターゲット）' }
        ]
    },

    // --- 還らずの森・ノーマル（指示書確定） ---
    spore_wolf: {
        id: 'spore_wolf', name: '変異体・胞子狼', classId: 'warrior',
        base: { hp: 75, atk: 14, def: 8, int: 6, mnd: 6, agi: 5, dex: 6 },
        growth: { hp: 1.2, atk: 1.7, def: 1.5, int: 1.5, mnd: 1.2, agi: 1.3, dex: 1.5 },
        rules: [
            ['自身のHPが50%以下', '敵: HP最低', 'ダブルアタック'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    venom_bloom: {
        id: 'venom_bloom', name: '毒花の魔導', classId: 'mage',
        base: { hp: 55, atk: 5, def: 4, int: 14, mnd: 8, agi: 9, dex: 7 },
        growth: { hp: 1.2, atk: 1.5, def: 1.2, int: 1.7, mnd: 1.5, agi: 1.3, dex: 1.5 },
        rules: [
            ['自身のHPが50%以下', '敵: HP最低', 'ファイア'],
            ['常に', '敵1体', 'サンダーストーム']
        ]
    },
    mire_shaman: {
        id: 'mire_shaman', name: '沼の祈祷師', classId: 'cleric',
        base: { hp: 70, atk: 7, def: 7, int: 7, mnd: 14, agi: 7, dex: 7 },
        growth: { hp: 1.2, atk: 1.5, def: 1.2, int: 1.5, mnd: 1.7, agi: 1.3, dex: 1.5 },
        rules: [
            ['味方のHPが50%以下', '味方: HP最低', 'ヒール'],
            ['常に', '敵: HP最低', 'セイントストライク']
        ]
    },
    rot_dancer: {
        id: 'rot_dancer', name: '腐朽の舞い手', classId: 'enchanter',
        base: { hp: 65, atk: 10, def: 6, int: 8, mnd: 10, agi: 13, dex: 8 },
        growth: { hp: 1.2, atk: 1.5, def: 1.2, int: 1.5, mnd: 1.2, agi: 1.7, dex: 1.5 },
        rules: [
            ['味方のHPが50%以下', '味方: HP最低', '守護方陣'],
            ['常に', '敵: HP最低', '毒手']
        ]
    },
    boss_mother: {
        id: 'boss_mother', name: '胞子の母', classId: 'cleric',
        isBoss: true, fixedLevel: 20,
        // Lv20固定ステ（成長しない）
        base: { hp: 250, atk: 38, def: 38, int: 38, mnd: 60, agi: 38, dex: 38 },
        rules: [
            ['自身のHPが50%以下', '敵: HP最低', 'セイントストライク'],
            ['味方が状態異常(毒・麻痺・睡眠)', '敵1体', 'スリープミスト'],
            ['常に', '味方: HP最低', 'ヒール']
        ],
        drops: [
            { type: 'target', id: '敵: HP最高', rate: 0.5, label: '敵最高HP（ターゲット）' }
        ]
    },

    // --- 骸道の都（既存維持・形式移行） ---
    husk_knight: {
        id: 'husk_knight', name: '骸の騎士', classId: 'warrior',
        base: { hp: 90, atk: 15, def: 12, int: 6, mnd: 7, agi: 7, dex: 7 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['味方のHPが80%以下', '味方: HP最低', 'ガードアップ'],
            ['自身のHPが50%以下', '敵: HP最低', 'リベンジブロウ'],
            ['常に', '敵1体', 'ダブルアタック'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    husk_caster: {
        id: 'husk_caster', name: '汚濁の詠唱者', classId: 'mage',
        base: { hp: 62, atk: 5, def: 5, int: 15, mnd: 10, agi: 9, dex: 8 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['常に', '自分自身', 'チャージ'],
            ['敵の数が2体以上', '敵: HP最低', 'サンダーストーム'],
            ['常に', '敵: 毒状態', 'ポイズンボム'],
            ['常に', '敵1体', 'ファイア'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    husk_priest: {
        id: 'husk_priest', name: '呪われた司祭', classId: 'cleric',
        base: { hp: 75, atk: 7, def: 8, int: 8, mnd: 14, agi: 7, dex: 7 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['味方のHPが50%以下', '味方: HP最低', 'ヒール'],
            ['味方が状態異常(毒・麻痺・睡眠)', '味方: 状態異常(毒・麻痺・睡眠)', 'リカバリー'],
            ['常に', '状態異常でない敵', 'スリープミスト'],
            ['常に', '敵1体', 'セイントストライク'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    husk_trader: {
        id: 'husk_trader', name: '屍商人', classId: 'enchanter',
        base: { hp: 70, atk: 10, def: 7, int: 9, mnd: 11, agi: 11, dex: 9 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['強化状態の味方がいない', '味方: 強化状態でない', 'パワーエンチャント'],
            ['味方のHPが50%以下', '味方: HP最低', '守護方陣'],
            ['常に', '状態異常でない敵', '毒手'],
            ['常に', '敵1体', '通常攻撃']
        ]
    },
    boss_king: {
        id: 'boss_king', name: '骸道の王', classId: 'cursemaker', isBoss: true,
        base: { hp: 180, atk: 12, def: 12, int: 18, mnd: 16, agi: 11, dex: 10 },
        growth: { hp: 1.5, atk: 1.5, def: 1.5, int: 1.5, mnd: 1.5, agi: 1.5, dex: 1.5 },
        rules: [
            ['敵の数が2体以上', '敵: HP最低', '深淵の呪詛'],
            ['常に', '敵1体', 'セイントストライク'],
            ['常に', '敵1体', '通常攻撃']
        ]
    }
};

/** 新規ゲーム時に初期解放のターゲット（指示書準拠。ドロップ/SS購入は含めない） */
const DEFAULT_UNLOCKED_TARGETS = [
    '敵1体', '敵: 強化状態',
    '味方1体', '味方: HP最低', '味方: 強化状態',
    '自分自身', '味方: 状態異常(毒・麻痺・睡眠)'
];
/** 新規ゲーム時に初期解放の条件 */
const DEFAULT_UNLOCKED_CONDITIONS = [
    '常に', '自身のHPが50%以下', '自身が状態異常', '自身が強化状態',
    '味方のHPが50%以下', '味方が状態異常(毒・麻痺・睡眠)',
    '強化状態の味方がいる', '強化状態の敵がいる', '強化状態の敵がいない',
    '敵の数が2体以上', '自身が毒状態ではない'
];




/** モード。ノーマル=全滅で獲得SS半減 / チャレンジ=入場料(デポジット)必須・全滅で全ロスト */
const MODE_DEFS = {
    normal:    { id: 'normal',    name: '周回（ノーマル）',   rewardMult: 1.0, needDeposit: false, purity: '通常' },
    // challenge の rewardMult は使わない（ステージ別 challengeSsPerEnemy を使用）
    challenge: { id: 'challenge', name: '挑戦（チャレンジ）', rewardMult: 1.0, needDeposit: true,  purity: 'チャレンジ' }
};

/**
 * 公開コンテンツ（P9.4.5）。ここに無い／false のダンジョン×モードは出撃できない。
 * 開発環境(isDevEnvironment)では全て選べる（検証用）。
 */
const PUBLIC_CONTENT = {
    labyrinth: { normal: true,  challenge: true  },
    forest:    { normal: true,  challenge: false },
    rumerk:    { normal: false, challenge: false, hidden: true }   // hidden: 未実装。開発環境でも出さない
};
function isContentPublic(dungeonId, mode) {
    if (PUBLIC_CONTENT[dungeonId] && PUBLIC_CONTENT[dungeonId].hidden) return false;
    if (typeof isDevEnvironment === 'function' && isDevEnvironment()) return true;
    const e = PUBLIC_CONTENT[dungeonId];
    return !!(e && e[mode]);
}
function isDungeonPublic(dungeonId) {
    return Object.keys(MODE_DEFS).some(m => isContentPublic(dungeonId, m));
}

/** 失敗プール：システム回収率 / 仮上限（テスト後に確定） */
const FAILURE_POOL_SYSTEM_RATE = 0.30;
const FAILURE_POOL_CLAIM_PER_CLEAR = 500;  // 確定(2026-10-11) 1回上限
const FAILURE_POOL_CLAIM_DAILY = 1000;     // 確定(2026-10-11) 1日上限（フロア合算）


/**
 * 撤退プロトコル（出撃前に 1 つだけ設定）。戦闘後の自動回復のあとに判定し、満たせば「無事帰還」。
 * def = 既定値 / min,max = 入力範囲
 */
const RETREAT_PROTOCOLS = {
    none:     { id: 'none',     name: '撤退しない（最後まで進む）', unit: '',   def: 0,  min: 0, max: 0 },
    down:     { id: 'down',     name: '戦闘不能者が N 名以上',       unit: '名', def: 1,  min: 1, max: 4 },
    healLeft: { id: 'healLeft', name: '残りヒール使用回数が N 回以下', unit: '回', def: 0,  min: 0, max: 99 },
    avgHp:    { id: 'avgHp',    name: 'パーティ平均HPが N% 以下',    unit: '%',  def: 50, min: 1, max: 99 }
};

/**
 * ダンジョン定義。stages[].lv=[最小,最大] の範囲で敵レベルを抽選、size=[最小,最大] 体で編成。
 * boss があるステージは「最後の 1 戦」がボス編成。env は常時の環境効果、challengeEnv はチャレンジ時の追加縛り。
 *   env: { slipPct: 味方側へ毎ラウンド最大HPの割合ダメージ, noPostHeal: 戦闘間の回復不可, enemyMult: 敵ステ倍率, label: 表示名 }
 */
const DUNGEON_DEFS = {
    labyrinth: {
        id: 'labyrinth', name: 'はじまりの迷宮', tag: '入門',
        pool: ['mut_claw', 'mut_weaver', 'ghoul_priest', 'shard_stray'],
        env: null,
        challengeEnv: { noPostHeal: true, label: '闇の遺構（戦闘間の回復不可）' },
        flavorShort: '『サザン・ヴェイル』の地下深くに穿たれた、現世と幽世の境界線。\nかつて打ち捨てられた要塞遺構には、今も異形どもの残党と、先立った冒険者たちの遺骸が眠る。\n胸に宿したソウルシャードの脈動を感じながら、お前は昏い闇の奥へと足を踏み入れる。',
        stages: []
    },
    forest: {
        id: 'forest', name: '還らずの森', tag: '毒環境',
        pool: ['spore_wolf', 'venom_bloom', 'mire_shaman', 'rot_dancer'],
        env: { slipPct: 0.03, label: '毒の胞子（毎ラウンド最大HPの3%）' },
        challengeEnv: { slipPct: 0.02, enemyMult: 1.1, label: '濃霧の迷妄（胞子+2%・敵+10%）' },
        flavorShort: 'かつて王国の誇りであった樹林は、変異体の毒と怨念に侵され、戻れぬ迷妄の樹海と化した。\n狂った胞子が視界を奪い、死していった冒険者たちの残響が惑わす。\n陽光（寛容）も月光（合理）も届かぬ深緑の闇で、お前の覚悟が試される。',
        stages: []
    },
    rumerk: {
        id: 'rumerk', name: '骸道の都ルメルク', tag: 'エンド',
        pool: ['husk_knight', 'husk_caster', 'husk_priest', 'husk_trader'],
        env: null,
        challengeEnv: { enemyMult: 1.15, noPostHeal: true, label: '負の質量（敵+15%・戦闘間の回復不可）' },
        flavorShort: 'かつて無数の商人と旅人で賑わった大交易都市は、大侵攻の夜に死者の都へと堕ちた。\n路地を埋め尽くすのは、喰らい尽くされた人々の無念と、汚濁したソウルシャードが動かす不浄の骸。\nかつての繁栄の面影を破棄し、お前は死者どもの呻きが響く石畳へと歩みを進める。',
        stages: []
    }
};

(function buildDungeonStages() {
    // P9: 敵1体あたり SS / 戦闘数 / 敵数 / チャレンジ入場料
    // deposit はチャレンジ時のみ消費。labyrinth 入場料は確定値（F1=60 / B1=80 / B2=100）。
    // forest 入場料は未確定のため PROVISIONAL。rumerk は未設定（0）。
    // shards は旧互換フィールド（報酬計算は ssPerEnemy × 撃破数を使用）。
    const S = (id, name, lv, size, battles, ssPerEnemy, deposit, boss) =>
        ({ id, name, lv, size, battles: battles, ssPerEnemy: ssPerEnemy,
           shards: [0, 0], deposit: deposit, boss: boss || null, secPerBattle: 60 });
    // はじまりの迷宮
    // チャレンジ: challengeLv / challengeSize / challengeSsPerEnemy / challengePool / challengeBoss
    // チャレンジ入場料確定。解放: F1=B2通常踏破 / B1=F1チャレ踏破 / B2=B1チャレ踏破
    // チャレンジの雑魚（P9.19.3：基礎ステータスを一律 −10%）
    const CH_POOL = ['erode_claw', 'erode_weaver', 'fanatic_priest', 'regret_vanguard'];
    DUNGEON_DEFS.labyrinth.stages = [
        Object.assign(S('f1', 'F1', [1, 3], [2, 2], 3, 10, 60), {
            challengeLv: [12, 14], challengeSize: [3, 3], challengeSsPerEnemy: 20,
            challengePool: CH_POOL.slice(),
            // P9.23.0 チャレンジは森エリア1の踏破で解放（第2章の途中で「残党の再調査」）
            challengeUnlock: { type: 'stageClear', dungeonId: 'forest', stageId: 'a1', mode: 'normal' }
        }),
        Object.assign(S('b1', 'B1', [4, 6], [2, 2], 3, 12, 80), {
            challengeLv: [15, 17], challengeSize: [3, 3], challengeSsPerEnemy: 24,
            challengePool: CH_POOL.slice(),
            challengeUnlock: { type: 'stageClear', dungeonId: 'labyrinth', stageId: 'f1', mode: 'challenge' }
        }),
        Object.assign(S('b2', 'B2', [7, 9], [3, 3], 3, 14, 100, ['boss_fang', 'mut_weaver', 'ghoul_priest']), {
            challengeLv: [18, 20], challengeSize: [3, 3], challengeSsPerEnemy: 26,
            challengePool: CH_POOL.slice(),
            challengeBoss: ['boss_soul_fang', 'erode_weaver', 'fanatic_priest'],
            challengeUnlock: { type: 'stageClear', dungeonId: 'labyrinth', stageId: 'b1', mode: 'challenge' }
        })
    ];
    // 還らずの森（敵数3・バトル数3）
    // P9.23.0 ノーマルの解放：エリア1は第2章の依頼を受けたら、以降は前のエリアの踏破で
    const FU = (st) => ({ type: 'stageClear', dungeonId: 'forest', stageId: st, mode: 'normal' });
    DUNGEON_DEFS.forest.stages = [
        Object.assign(S('a1', 'エリア1', [10, 12], [3, 3], 3, 16, 200), { unlock: { type: 'story', id: 'c2_start' } }),
        Object.assign(S('a2', 'エリア2', [13, 15], [3, 3], 3, 18, 250), { unlock: FU('a1') }),
        Object.assign(S('a3', 'エリア3', [16, 18], [3, 3], 3, 20, 300), { unlock: FU('a2') }),
        Object.assign(S('a4', 'エリア4', [19, 20], [3, 3], 3, 22, 350, ['boss_mother', 'venom_bloom', 'rot_dancer']), { unlock: FU('a3') })
    ];
    // 骸道の都ルメルク（SS/入場料は未確定 → 0。敵Lv帯のみ従来踏襲）
    const lvs = [[21, 24], [25, 28], [29, 32], [33, 36], [37, 40], [41, 44], [45, 48], [49, 52], [53, 56]];
    DUNGEON_DEFS.rumerk.stages = lvs.map((lv, i) => {
        return S('a' + (i + 1), 'エリア' + (i + 1), lv, [3, 4], 4, 0, 0,
            i === 8 ? ['boss_king', 'husk_priest', 'husk_knight'] : null);
    });
})();


/** モードに応じた敵Lv帯 */
function stageLvRange(stage, mode) {
    if (mode === 'challenge' && stage && stage.challengeLv) return stage.challengeLv;
    return stage ? stage.lv : [1, 1];
}
/** モードに応じた敵数帯 */
function stageSizeRange(stage, mode) {
    if (mode === 'challenge' && stage && stage.challengeSize) return stage.challengeSize;
    return stage ? stage.size : [1, 1];
}

function getDungeon(dungeonId) { return DUNGEON_DEFS[dungeonId] || null; }
function getStage(dungeonId, stageId) {
    const d = getDungeon(dungeonId);
    return d ? (d.stages.find(s => s.id === stageId) || null) : null;
}

/** 常時env + (チャレンジなら)縛りを合成 */
function mergeEnv(dungeon, mode) {
    const out = { slipPct: 0, noPostHeal: false, enemyMult: 1, labels: [] };
    const add = e => {
        if (!e) return;
        if (e.slipPct) out.slipPct += e.slipPct;
        if (e.noPostHeal) out.noPostHeal = true;
        if (e.enemyMult) out.enemyMult *= e.enemyMult;
        if (e.label) out.labels.push(e.label);
    };
    add(dungeon.env);
    if (mode === 'challenge') add(dungeon.challengeEnv);
    out.enemyMult = Math.round(out.enemyMult * 1000) / 1000;
    return out;
}

/**
 * P8.6 アクセサリー定義
 * effects の数値は TEST ONLY（正式バランスではない）
 */
const ACCESSORY_DEFS = {
    iron_band: {
        id: 'iron_band', name: '鉄の腕輪', statKey: 'atk', kind: 'stat'
    },
    guard_band: {
        id: 'guard_band', name: '守りの腕輪', statKey: 'def', kind: 'stat'
    },
    intellect_ring: {
        id: 'intellect_ring', name: '知力の指輪', statKey: 'int', kind: 'stat'
    },
    spirit_ring: {
        id: 'spirit_ring', name: '精神の指輪', statKey: 'mnd', kind: 'stat'
    },
    poison_charm: {
        id: 'poison_charm', name: '毒除けのお守り', resistKey: 'poisonResist', kind: 'resist'
    },
    paralysis_charm: {
        id: 'paralysis_charm', name: '麻痺除けのお守り', resistKey: 'paralysisResist', kind: 'resist'
    },
    sleep_charm: {
        id: 'sleep_charm', name: '眠気覚ましのお守り', resistKey: 'sleepResist', kind: 'resist'
    }
};
/** 旧ID互換マップ */
const ACCESSORY_ID_ALIASES = {
    test_atk_band: 'iron_band',
    test_def_band: 'guard_band',
    test_int_band: 'intellect_ring',
    test_mnd_band: 'spirit_ring',
    test_poison_charm: 'poison_charm',
    test_paralysis_charm: 'paralysis_charm',
    test_sleep_charm: 'sleep_charm'
};

/** Lv5 刻みの段階上昇。中間Lvは直前マイルストーンの効果を維持 */
function accessoryEffectValueAtLevel(def, level) {
    const lv = Math.max(1, Math.min(ACCESSORY_LEVEL_CAP, level | 0));
    const milestones = (def.kind === 'resist') ? ACCESSORY_RESIST_MILESTONES : ACCESSORY_STAT_MILESTONES;
    const keys = Object.keys(milestones).map(Number).sort((a, b) => a - b);
    let best = keys[0];
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] <= lv) best = keys[i];
        else break;
    }
    return milestones[best];
}

function accessoryEffectsAtLevel(defId, level) {
    const def = getAccessoryDef(defId);
    if (!def) return {};
    const v = accessoryEffectValueAtLevel(def, level);
    if (def.kind === 'stat' && def.statKey) return { [def.statKey]: v };
    if (def.kind === 'resist' && def.resistKey) return { [def.resistKey]: v };
    return {};
}

function getAccessoryDef(defId) {
    if (!defId) return null;
    if (ACCESSORY_DEFS[defId]) return ACCESSORY_DEFS[defId];
    const alias = ACCESSORY_ID_ALIASES[defId];
    return alias ? (ACCESSORY_DEFS[alias] || null) : null;
}

function formatAccessoryEffects(effects) {
    if (!effects) return '';
    const labels = {
        atk: 'ATK+', def: 'DEF+', int: 'INT+', mnd: 'MND+',
        poisonResist: '毒耐性+', paralysisResist: '麻痺耐性+', sleepResist: '睡眠耐性+'
    };
    const parts = [];
    Object.keys(labels).forEach(k => {
        if (effects[k]) parts.push(labels[k] + effects[k]);
    });
    return parts.join(' / ');
}

/** プレイヤーのアクション解放判定。敵は常に true（呼び出し側で分岐） */
function getSkillUnlockLevel(skillNameOrDef) {
    if (!skillNameOrDef) return 1;
    if (typeof skillNameOrDef === 'object') return skillNameOrDef.unlockLevel != null ? skillNameOrDef.unlockLevel : 1;
    const def = Object.values(SKILL_DEFS).find(s => s.name === skillNameOrDef || s.id === skillNameOrDef);
    return def && def.unlockLevel != null ? def.unlockLevel : 1;
}
function isSkillUnlockedForLevel(skillNameOrDef, level) {
    const ul = getSkillUnlockLevel(skillNameOrDef);
    return (level || 1) >= ul;
}
