/**
 * recruit.js — キャラクター募集（ガチャ）ロジック (P8.4)
 * DOM に依存しない純ロジック。UI は ui.js の renderRecruitScreen。
 *
 * 仕様
 *  - 無料募集 / 有料募集（SS 消費）のどちらも 5 人の候補を表示し、任意の 1 人を加入させる
 *  - クラスは基本 4 クラスから均等
 *  - レアリティ  無料: レア 1% / ノーマル 99%
 *               有料: UR 1% / レア 3% / ノーマル 96%
 *  - ボーナス対象は 7 項目(HP/ATK/DEF/INT/MND/AGI/DEX)から均等ランダム
 *      ノーマル: ボーナスなし
 *      レア    : 初期値ボーナス ×1
 *      UR      : 初期値ボーナス ×1 ＋ 成長率 +0.1 ×1（それぞれ独立抽選。同じ項目に重なることもある）
 *
 * ★ 数値のうち「暫定」と書いたものは仕様未決定。ここだけ書き換えれば全体に反映される。
 */
const RECRUIT_COUNT = 5;

/** P9 たたき台: 有料ガチャ 1 回のコスト（最終価格は未確定） */
const RECRUIT_PAID_COST = 150; // PROVISIONAL

/** 排出率（残りはノーマル）。ユーザー指定値 */
const RECRUIT_RATES = {
    free: { ur: 0,    rare: 0.01 },
    paid: { ur: 0.01, rare: 0.03 }
};

/** 暫定: 初期値ボーナスの大きさ。HP はスケールが違うので別枠 */
const RECRUIT_INIT_BONUS = {
    rare: { hp: 10, other: 2 },
    ur:   { hp: 15, other: 3 }
};

/** UR の成長率ボーナス（ユーザー指定: +0.1） */
const RECRUIT_UR_GROWTH_BONUS = 0.1;

const RARITY_DEFS = {
    normal: { id: 'normal', label: 'N',  name: 'ノーマル' },
    rare:   { id: 'rare',   label: 'R',  name: 'レア' },
    ur:     { id: 'ur',     label: 'UR', name: 'UR' }
};

const RECRUIT_KINDS = {
    free: { id: 'free', name: 'ノーマルガチャ（無料）' },
    paid: { id: 'paid', name: '有料ガチャ（SS）' }
};

function statLabel(k) {
    return String(k).toUpperCase();
}

function pickFrom(arr, rng) {
    return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function rollRarity(kind, rng) {
    rng = rng || Math.random;
    const rt = RECRUIT_RATES[kind] || RECRUIT_RATES.free;
    const r = rng();
    if (r < rt.ur) return 'ur';
    if (r < rt.ur + rt.rare) return 'rare';
    return 'normal';
}

/** 候補 1 人を抽選（rng は [0,1) を返す関数。テスト用に差し替え可） */
function rollCandidate(kind, rng) {
    rng = rng || Math.random;
    const classId = pickFrom(BASE_CLASS_IDS, rng);
    const rarity = rollRarity(kind, rng);
    const initBonus = {};
    const growthBonus = {};
    if (rarity === 'rare' || rarity === 'ur') {
        const stat = pickFrom(STAT_KEYS, rng);
        const tbl = RECRUIT_INIT_BONUS[rarity];
        initBonus[stat] = (stat === 'hp') ? tbl.hp : tbl.other;
    }
    if (rarity === 'ur') {
        const stat = pickFrom(STAT_KEYS, rng);
        growthBonus[stat] = RECRUIT_UR_GROWTH_BONUS;
    }
    return { cid: genId('r'), classId, rarity, initBonus, growthBonus };
}

function rollCandidates(kind, rng) {
    const out = [];
    for (let i = 0; i < RECRUIT_COUNT; i++) out.push(rollCandidate(kind, rng));
    return out;
}

/** Lv1 時点のステータス（基本クラス初期値＋初期値ボーナス）。表示用 */
function candidatePreviewStats(cand) {
    const b = CLASS_DEFS[cand.classId].base;
    const st = {};
    STAT_KEYS.forEach(k => { st[k] = b[k] + ((cand.initBonus && cand.initBonus[k]) || 0); });
    return st;
}

/** 実効成長率（クラス成長率＋ボーナス）。表示用 */
function candidatePreviewGrowth(cand) {
    return getCharGrowth({ growthBonus: cand.growthBonus }, cand.classId);
}

function serializeCandidate(c) {
    return {
        cid: c.cid, classId: c.classId, rarity: c.rarity,
        initBonus: Object.assign({}, c.initBonus), growthBonus: Object.assign({}, c.growthBonus)
    };
}

/** セーブから復元。壊れていれば null（＝未募集扱い） */
function restoreCandidates(arr) {
    if (!Array.isArray(arr) || arr.length === 0 || arr.length > RECRUIT_COUNT) return null;
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (!c || !CLASS_DEFS[c.classId] || CLASS_DEFS[c.classId].tier !== 1) return null;
        if (!RARITY_DEFS[c.rarity]) return null;
        out.push({
            cid: c.cid || genId('r'), classId: c.classId, rarity: c.rarity,
            initBonus: cleanBonusMap(c.initBonus), growthBonus: cleanBonusMap(c.growthBonus)
        });
    }
    return out;
}

function uniqueCharName(base) {
    const names = {};
    yardChars.forEach(c => { names[c.name] = true; });
    if (!names[base]) return base;
    let i = 2;
    while (names[base + i]) i++;
    return base + i;
}

/** 候補から実キャラを生成（ヤードへは入れない） */
function buildCharFromCandidate(cand) {
    const ch = createChar(cand.classId, uniqueCharName(CLASS_DEFS[cand.classId].name), true);
    ch.rarity = cand.rarity;
    ch.initBonus = Object.assign({}, cand.initBonus);
    ch.growthBonus = Object.assign({}, cand.growthBonus);
    // 候補のときに見せていた絵をそのまま引き継ぐ（キャラIDが変わっても絵が変わらないように）
    if (typeof portraitDefaultKey === 'function') ch.portrait = portraitDefaultKey(cand.classId, cand.cid);
    Object.keys(ch.initBonus).forEach(k => {
        const v = ch.initBonus[k];
        if (k === 'hp') { ch.maxHp += v; ch.hp = ch.maxHp; }
        else ch[k] += v;
    });
    return ch;
}

function afterRecruitChange() {
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderRecruitScreen === 'function') renderRecruitScreen();
}

/** 募集実行。@returns {boolean} 実行できたか */
function recruitDraw(kind) {
    if (!RECRUIT_KINDS[kind]) return false;
    if (isYardFull()) {
        alert('ヤードがいっぱいです（' + yardCap() + '体）。引退させてSSを抜き出すと枠が空きます');
        return false;
    }
    if (kind === 'paid') {
        if (recruitPools.paid && !confirm('未選択の候補があります。破棄して新しく募集しますか？\n（リソースは再度消費されます）')) return false;
        if (!canSpendResource(RECRUIT_PAID_COST)) {
            alert('SS が足りません（必要: ' + RECRUIT_PAID_COST + '）');
            return false;
        }
        spendResource(RECRUIT_PAID_COST);
    }
    recruitPools[kind] = rollCandidates(kind);
    afterRecruitChange();
    return true;
}

/** 候補の index 番目を加入。@returns 加入したキャラ or null */
function recruitJoin(kind, index) {
    const pool = recruitPools[kind];
    if (!pool || !pool[index]) return null;
    if (isYardFull()) {
        alert('ヤードがいっぱいです（' + yardCap() + '体）。引退させてSSを抜き出すと枠が空きます');
        return null;
    }
    const ch = buildCharFromCandidate(pool[index]);
    yardChars.push(ch);
    ruleData[ch.id] = defaultPlayerRules();
    recruitPools[kind] = null;
    if (typeof syncMeta === 'function') syncMeta();
    afterRecruitChange();
    return ch;
}

/** 表示用: レアリティバッジ HTML */
function rarityBadgeHtml(rarity) {
    const d = RARITY_DEFS[rarity] || RARITY_DEFS.normal;
    return `<span class="rarity-badge rarity-${d.id}">${d.label}</span>`;
}

/** 表示用: ボーナス説明テキスト（個体 or 候補） */
function bonusSummaryText(x) {
    const parts = [];
    const ib = x.initBonus || {};
    const gb = x.growthBonus || {};
    Object.keys(ib).forEach(k => parts.push(`初期${statLabel(k)} +${ib[k]}`));
    Object.keys(gb).forEach(k => parts.push(`成長率${statLabel(k)} +${gb[k]}`));
    return parts.join(' / ');
}
