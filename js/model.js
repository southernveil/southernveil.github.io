/**
 * model.js — ヤード / パーティ / 敵 / 互換 charMeta (P7-7 ヤード)
 *
 * yardChars  … 所持キャラ（味方・永続個体 charId）
 * partyIds  … 出撃メンバーの charId[]（1〜MAX_PARTY）
 * enemyChars … 敵グループ（当面は直接編集）
 * ruleData  … charId 単位のルール（ヤードに残る）
 */
function skillsForClass(classId, level, opts) {
    opts = opts || {};
    const d = getClassDef(classId) || CLASS_DEFS[classId];
    if (!d) return [];
    const lv = level != null ? level : 1;
    let keys = (d.skillKeys && d.skillKeys.length) ? d.skillKeys.slice() : null;
    if (!keys || !keys.length) {
        const base = getClassDef(getBaseClassId(classId));
        keys = (base && base.skillKeys) ? base.skillKeys.slice() : [];
    }
    // Lv50: 3次固有アクション（キャップ外。データは残す）
    if (d.tier === 3 && lv >= 50 && Array.isArray(d.actions)) {
        d.actions.forEach(k => {
            if (keys.indexOf(k) < 0) keys.push(k);
        });
    }
    // インデックス安定のため全スキルを返す。locked フラグで解放状態を示す。
    // ignoreUnlock: 敵・検証用に locked を付けない
    return keys.map(k => {
        const def = SKILL_DEFS[k];
        if (!def || !def.name) return null;
        const unlockLevel = def.unlockLevel != null ? def.unlockLevel : 1;
        const locked = !opts.ignoreUnlock && lv < unlockLevel;
        return Object.assign({ id: k, unlockLevel: unlockLevel, locked: locked }, def);
    }).filter(Boolean);
}

/** プレイヤーが現在レベルで使用可能か（通常攻撃は常に可） */
function canUseSkillAtLevel(skillObjOrName, level, isPlayer) {
    if (isPlayer === false) return true; // 敵は解放制限なし
    const name = typeof skillObjOrName === 'string' ? skillObjOrName : (skillObjOrName && skillObjOrName.name);
    if (!name || name === '通常攻撃' || name === '防御') return true;
    return isSkillUnlockedForLevel(skillObjOrName, level || 1);
}


function createChar(classId, name, isPlayer) {
    const def = getClassDef(classId) || CLASS_DEFS[classId];
    const baseId = (def && def.baseClassId) ? def.baseClassId : classId;
    const baseDef = getClassDef(baseId) || def;
    const b = baseDef.base;
    const id = genId('c');
    return {
        id, charId: id, classId, name, isPlayer: !!isPlayer,
        level: 1,
        classHistory: [classId],
        hp: b.hp, maxHp: b.hp,
        atk: b.atk, def: b.def, int: b.int, mnd: b.mnd, agi: b.agi, dex: b.dex,
        mp: 0, maxMp: 0,
        accessoryId: null,
        lifespanMax: (typeof DEFAULT_LIFESPAN !== 'undefined') ? DEFAULT_LIFESPAN : 60,
        lifespan: (typeof DEFAULT_LIFESPAN !== 'undefined') ? DEFAULT_LIFESPAN : 60,
        retired: false,
        growthSs: 0   // レベル上げに使った SS の累計（引退時に抜き出す元金）
    };
}

function findCharById(charId) {
    return yardChars.find(c => c.id === charId) || enemyChars.find(c => c.id === charId) || null;
}

/** 現在クラスの成長率で1レベル分だけ成長（過去分は触らない） */
function growCharOneLevel(ch) {
    const g = getCharGrowth(ch, ch.classId);
    STAT_KEYS.forEach(k => {
        const gain = rollGrowth(g[k] != null ? g[k] : 1);
        if (k === 'hp') {
            ch.maxHp += gain;
            ch.hp = Math.min(ch.maxHp, (ch.hp || 0) + gain);
        } else {
            ch[k] = (ch[k] || 0) + gain;
        }
    });
    ch.level = (ch.level || 1) + 1;
}

/**
 * P9: SS を消費して 1 レベル成長。別通貨 XP は使わない。
 * @returns {{ok:boolean, reason?:string, cost?:number, level?:number}}
 */
function levelUpWithSs(charId) {
    const ch = findCharById(charId);
    if (!ch) return { ok: false, reason: 'キャラクターが見つかりません' };
    if (ch.retired) return { ok: false, reason: '引退済みです' };
    const lv = ch.level || 1;
    if (lv >= PLAYER_LEVEL_CAP) return { ok: false, reason: 'レベル上限です（Lv' + PLAYER_LEVEL_CAP + '）' };
    const cost = (typeof ssCostToNextLevel === 'function') ? ssCostToNextLevel(lv) : (XP_COST_TO_REACH[lv + 1]);
    if (cost == null) return { ok: false, reason: '成長費が未定義です' };
    if (!canSpendResource(cost)) return { ok: false, reason: 'SS が足りません（必要: ' + cost + '）', cost: cost };
    spendResource(cost);
    ch.growthSs = (ch.growthSs | 0) + cost;
    growCharOneLevel(ch);
    noteLevelReached();
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return { ok: true, cost: cost, level: ch.level };
}

/** キャラを現役（ヤード・パーティ）から引退欄へ移す共通処理。装備中のアクセサリーは外す */
function moveCharToRetired(ch, reason) {
    ch.retired = true;
    ch.retiredAt = Date.now();
    ch.retireReason = reason || 'lifespan';
    ch.accessoryId = null;
    yardChars = yardChars.filter(c => c.id !== ch.id);
    partyIds = partyIds.filter(id => id !== ch.id);
    if (typeof partySets !== 'undefined') {
        partySets.forEach(s => { s.partyIds = s.partyIds.filter(id => id !== ch.id); });
    }
    if (!retiredChars.some(c => c.id === ch.id)) retiredChars.push(ch);
}


/** 探索1回分の寿命消費。challengeDeathIds: チャレンジで戦闘不能だった charId 配列 */
function applyExpeditionLifespan(partyIdsList, challengeDeathIds) {
    const deaths = {};
    (challengeDeathIds || []).forEach(id => { deaths[id] = true; });
    const retiredNow = [];
    (partyIdsList || []).forEach(id => {
        const ch = findCharById(id);
        if (!ch || ch.retired) return;
        if (typeof ch.lifespan !== 'number') {
            ch.lifespanMax = ch.lifespanMax || (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60);
            ch.lifespan = ch.lifespanMax;
        }
        ch.lifespan = Math.max(0, ch.lifespan - 1);
        if (deaths[id]) ch.lifespan = Math.max(0, ch.lifespan - 1);
        if (ch.lifespan <= 0) {
            ch.retired = true;
            retiredNow.push(ch);
        }
    });
    retiredNow.forEach(ch => moveCharToRetired(ch, 'lifespan'));
    if (typeof cloudNoteSortie === 'function') cloudNoteSortie();
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return retiredNow;
}

/** 全員から固定量だけ寿命を減らす（チャレンジ失敗 −2 用） */
function applyExpeditionLifespanFlat(partyIdsList, amount) {
    const n = Math.max(0, amount | 0);
    const retiredNow = [];
    (partyIdsList || []).forEach(id => {
        const ch = findCharById(id);
        if (!ch || ch.retired) return;
        if (typeof ch.lifespan !== 'number') {
            ch.lifespanMax = ch.lifespanMax || (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60);
            ch.lifespan = ch.lifespanMax;
        }
        ch.lifespan = Math.max(0, ch.lifespan - n);
        if (ch.lifespan <= 0) {
            ch.retired = true;
            retiredNow.push(ch);
        }
    });
    retiredNow.forEach(ch => moveCharToRetired(ch, 'lifespan'));
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return retiredNow;
}

function stageClearKey(dungeonId, stageId, mode) {
    return dungeonId + ':' + stageId + ':' + (mode || 'normal');
}
function markStageCleared(dungeonId, stageId, mode) {
    ensureAccountUnlocksShape();
    accountUnlocks.stageCleared[stageClearKey(dungeonId, stageId, mode)] = true;
    if (typeof persist === 'function') persist();
}
function isStageCleared(dungeonId, stageId, mode) {
    ensureAccountUnlocksShape();
    return !!accountUnlocks.stageCleared[stageClearKey(dungeonId, stageId, mode)];
}
/** P9.23.0 ノーマルのステージが解放されているか（stage.unlock が無ければ常に解放） */
function isNormalStageUnlocked(dungeonId, stageId) {
    const stage = typeof getStage === 'function' ? getStage(dungeonId, stageId) : null;
    if (!stage || !stage.unlock) return true;
    const u = stage.unlock;
    if (u.type === 'story') return typeof storySeen === 'function' && storySeen(u.id);
    if (u.type === 'stageClear') return isStageCleared(u.dungeonId, u.stageId, u.mode || 'normal');
    return true;
}
/** ダンジョンに1つでも入れるステージがあるか */
function isDungeonUnlocked(dungeonId) {
    const d = (typeof DUNGEON_DEFS !== 'undefined') ? DUNGEON_DEFS[dungeonId] : null;
    return !!(d && d.stages.some(s => isNormalStageUnlocked(dungeonId, s.id)));
}
function isChallengeStageUnlocked(dungeonId, stageId) {
    const stage = typeof getStage === 'function' ? getStage(dungeonId, stageId) : null;
    if (!stage || !stage.challengeUnlock) return true;
    const u = stage.challengeUnlock;
    if (u.type === 'stageClear') {
        return isStageCleared(u.dungeonId, u.stageId, u.mode || 'normal');
    }
    return true;
}

function failurePoolKey(dungeonId, stageId) {
    return dungeonId + ':' + stageId;
}
function addToFailurePool(dungeonId, stageId, totalLost) {
    ensureAccountUnlocksShape();
    const key = failurePoolKey(dungeonId, stageId);
    const lost = Math.max(0, Math.floor(totalLost || 0));
    const rate = (typeof FAILURE_POOL_SYSTEM_RATE === 'number') ? FAILURE_POOL_SYSTEM_RATE : 0.3;
    const systemCut = Math.floor(lost * rate);
    const added = Math.max(0, lost - systemCut);
    if (!failurePool[key]) failurePool[key] = { amount: 0, updatedAt: Date.now() };
    failurePool[key].amount = (failurePool[key].amount || 0) + added;
    failurePool[key].updatedAt = Date.now();
    if (typeof persist === 'function') persist();
    return { added: added, systemCut: systemCut, total: failurePool[key].amount };
}
function getFailurePoolAmount(dungeonId, stageId) {
    ensureAccountUnlocksShape();
    const e = failurePool[failurePoolKey(dungeonId, stageId)];
    return e ? (e.amount | 0) : 0;
}
function todayStr() {
    const d = (typeof __ctx !== 'undefined' && __ctx && __ctx.now) ? new Date(__ctx.now) : new Date();
    if (typeof __TZ_OFFSET_MIN !== 'undefined') {   // サーバー実行時: 日本時間で日付を決める
        const j = new Date(d.getTime() + __TZ_OFFSET_MIN * 60000);
        return j.getUTCFullYear() + '-' + String(j.getUTCMonth() + 1).padStart(2, '0') + '-' + String(j.getUTCDate()).padStart(2, '0');
    }
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getPoolClaimRemainingToday() {
    ensureAccountUnlocksShape();
    const daily = (typeof FAILURE_POOL_CLAIM_DAILY === 'number') ? FAILURE_POOL_CLAIM_DAILY : 1000;
    const day = todayStr();
    if (poolClaims.date !== day) return daily;
    let totalClaimedToday = 0;
    Object.keys(poolClaims.claimedToday || {}).forEach(k => {
        totalClaimedToday += poolClaims.claimedToday[k] | 0;
    });
    return Math.max(0, daily - totalClaimedToday);
}

/** 失敗プール受取。applySideEffects:false なら残高・SSを変更せず試算のみ */
function claimFailurePool(dungeonId, stageId, applySideEffects) {
    ensureAccountUnlocksShape();
    const doApply = applySideEffects !== false;
    const key = failurePoolKey(dungeonId, stageId);
    const pool = failurePool[key] ? (failurePool[key].amount | 0) : 0;
    if (pool <= 0) return { ok: false, amount: 0, remaining: 0, dailyLeft: getPoolClaimRemainingToday(), reason: 'プール空', capped: false };
    const day = todayStr();
    if (poolClaims.date !== day) {
        if (doApply) {
            poolClaims.date = day;
            poolClaims.claimedToday = {};
        }
    }
    const perClear = (typeof FAILURE_POOL_CLAIM_PER_CLEAR === 'number') ? FAILURE_POOL_CLAIM_PER_CLEAR : 500;
    const dailyLeft = getPoolClaimRemainingToday();
    const raw = Math.min(pool, perClear, dailyLeft);
    const amount = Math.max(0, raw);
    const capped = amount < pool && amount < perClear ? false : (amount < Math.min(pool, perClear));
    if (amount <= 0) {
        return { ok: false, amount: 0, remaining: pool, dailyLeft: dailyLeft, reason: '本日の受取上限', capped: true };
    }
    if (!doApply) {
        return { ok: true, amount: amount, remaining: pool - amount, dailyLeft: dailyLeft - amount, reason: '', capped: amount < Math.min(pool, perClear) || amount < pool };
    }
    if (!failurePool[key]) failurePool[key] = { amount: 0, updatedAt: Date.now() };
    if (poolClaims.date !== day) {
        poolClaims.date = day;
        poolClaims.claimedToday = {};
    }
    failurePool[key].amount = pool - amount;
    failurePool[key].updatedAt = Date.now();
    poolClaims.claimedToday[key] = (poolClaims.claimedToday[key] | 0) + amount;
    if (typeof addResource === 'function') addResource(amount);
    if (typeof persist === 'function') persist();
    const dailyLeftAfter = getPoolClaimRemainingToday();
    return {
        ok: true,
        amount: amount,
        remaining: failurePool[key].amount,
        dailyLeft: dailyLeftAfter,
        reason: '',
        capped: amount < Math.min(pool, perClear) || (amount === perClear && pool > perClear) || (amount === dailyLeft && dailyLeft < Math.min(pool, perClear))
    };
}

/**
 * テスト用: 基本クラス初期値から level まで再成長。
 * クラスは基本クラスに戻し、classHistory も基本のみにする。
 */
function applyLevelFromBase(ch, level) {
    const baseId = getBaseClassId(ch.classId);
    const baseDef = getClassDef(baseId);
    if (!baseDef || !baseDef.base) return;
    const b = baseDef.base;
    const g = getCharGrowth(ch, baseId);
    const lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    ch.classId = baseId;
    ch.classHistory = [baseId];
    ch.level = 1;
    ch.maxHp = b.hp;
    ch.hp = b.hp;
    ch.atk = b.atk;
    ch.def = b.def;
    ch.int = b.int;
    ch.mnd = b.mnd;
    ch.agi = b.agi;
    ch.dex = b.dex;
    // 募集個体の初期値ボーナスは Lv1 に戻しても維持する
    const ib = ch.initBonus || {};
    STAT_KEYS.forEach(k => {
        const v = ib[k];
        if (!v) return;
        if (k === 'hp') { ch.maxHp += v; ch.hp = ch.maxHp; }
        else ch[k] = (ch[k] || 0) + v;
    });
    for (let i = 1; i < lv; i++) {
        STAT_KEYS.forEach(k => {
            const gain = rollGrowth(g[k] != null ? g[k] : 1);
            if (k === 'hp') {
                ch.maxHp += gain;
                ch.hp = ch.maxHp;
            } else {
                ch[k] = (ch[k] || 0) + gain;
            }
        });
        ch.level = i + 1;
    }
    ch.level = lv;
    ch.hp = ch.maxHp;
}

/** レベル指定。上げるときは増分のみ成長。下げるときは基本クラスへ戻して再成長（テスト用） */
function setCharLevel(charId, levelInput) {
    const ch = findCharById(charId);
    if (!ch) return null;
    let lv = parseInt(levelInput, 10);
    if (isNaN(lv)) {
        alert('レベルは数値で入力してください');
        if (typeof renderAll === 'function') renderAll();
        return null;
    }
    lv = Math.max(1, Math.min(PLAYER_LEVEL_CAP, lv));
    const cur = ch.level || 1;
    if (lv === cur) {
        if (typeof renderAll === 'function') renderAll();
        return cur;
    }
    if (lv > cur) {
        while ((ch.level || 1) < lv) growCharOneLevel(ch);
    } else {
        applyLevelFromBase(ch, lv);
    }
    noteLevelReached();
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
    return ch.level;
}

function levelUpChar(charId) {
    const ch = findCharById(charId);
    if (!ch) return null;
    return setCharLevel(charId, (ch.level || 1) + 1);
}

/** 1次Lv20 / 2次Lv40 でクラスチェンジ可能 */
function canClassChange(ch) {
    // P9: 当面クラスチェンジなし（Lv20キャップのみ）
    if (typeof CLASS_CHANGE_ENABLED !== 'undefined' && !CLASS_CHANGE_ENABLED) return false;
    if (!ch) return false;
    const def = getClassDef(ch.classId);
    if (!def) return false;
    const lv = ch.level || 1;
    if (def.tier === 1) return lv >= 20;
    if (def.tier === 2) return lv >= 40;
    return false;
}

/**
 * Lv20 クラスチェンジ実行
 * - classId 更新
 * - classHistory に追加
 * - 固定 bonus を一度だけ加算
 * - 過去の成長は再計算しない
 */
function performClassChange(charId, targetClassId) {
    const ch = findCharById(charId);
    if (!ch) {
        alert('キャラクターが見つかりません');
        return false;
    }
    if (!canClassChange(ch)) {
        alert('クラスチェンジできません（1次はLv20、2次はLv40）');
        return false;
    }
    const curDef = getClassDef(ch.classId);
    const opts = getClassChangeOptions(ch.classId) || {};
    const allowed = Object.keys(opts).map(k => opts[k]).filter(Boolean);
    if (allowed.indexOf(targetClassId) < 0) {
        alert('選択できないクラスです');
        return false;
    }
    const targetDef = getClassDef(targetClassId);
    const expectTier = curDef.tier + 1;
    if (!targetDef || targetDef.tier !== expectTier) {
        alert('クラスデータが不正です');
        return false;
    }

    const bonus = getClassBonus(targetClassId) || {};
    // 固定ボーナス適用（データから）
    STAT_KEYS.forEach(k => {
        const v = bonus[k];
        if (!v) return;
        if (k === 'hp') {
            ch.maxHp = (ch.maxHp || 0) + v;
            ch.hp = (ch.hp || 0) + v;
        } else {
            ch[k] = (ch[k] || 0) + v;
        }
    });

    if (!Array.isArray(ch.classHistory) || !ch.classHistory.length) {
        ch.classHistory = [ch.classId];
    }
    // 現在クラスが末尾に無い場合は足す（通常は既にいる）
    if (ch.classHistory[ch.classHistory.length - 1] !== ch.classId) {
        ch.classHistory.push(ch.classId);
    }
    ch.classId = targetClassId;
    if (ch.classHistory[ch.classHistory.length - 1] !== targetClassId) {
        ch.classHistory.push(targetClassId);
    }

    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
    return true;
}
/** レベル1・クラス初期ステータスに戻す（名前・ルール・IDは維持） */
function resetCharToLv1(charId) {
    const ch = findCharById(charId);
    if (!ch) return;
    if (!confirm(ch.name + ' を Lv1 初期ステータスに戻しますか？\n（名前・ルールは残ります）')) return;
    applyLevelFromBase(ch, 1);
    ch.growthSs = 0;
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
}


/** パーティ実体（戦闘・表示用） */
function getPartyChars() {
    return partyIds
        .map(id => yardChars.find(c => c.id === id))
        .filter(Boolean);
}

function isInParty(charId) {
    return partyIds.indexOf(charId) >= 0;
}

function rebuildCharMetaAndSkills() {
    const partyChars = getPartyChars();
    const all = partyChars.concat(enemyChars);
    const cm = {};
    const sk = {};
    all.forEach(ch => {
        const fx = (typeof getAccessoryEffects === 'function') ? getAccessoryEffects(ch) : {};
        cm[ch.id] = {
            id: ch.id, name: ch.name, level: ch.level || 1,
            hp: ch.hp, maxHp: ch.maxHp, mp: ch.mp || 0, maxMp: ch.maxMp || 0,
            atk: (ch.atk || 0) + (fx.atk || 0),
            def: (ch.def || 0) + (fx.def || 0),
            int: (ch.int || 0) + (fx.int || 0),
            mnd: (ch.mnd || 0) + (fx.mnd || 0),
            agi: ch.agi, dex: ch.dex,
            isPlayer: ch.isPlayer, classId: ch.classId, charId: ch.charId,
            poisonResist: fx.poisonResist || 0,
            paralysisResist: fx.paralysisResist || 0,
            sleepResist: fx.sleepResist || 0,
            accessoryId: ch.accessoryId || null
        };
        sk[ch.id] = skillsForClass(ch.classId, ch.level || 1, { ignoreUnlock: !ch.isPlayer });
        // 敵テンプレの extraSkills を付与
        if (!ch.isPlayer && ch.templateId && typeof ENEMY_TEMPLATES !== 'undefined') {
            const tpl = ENEMY_TEMPLATES[ch.templateId];
            if (tpl && Array.isArray(tpl.extraSkills)) {
                tpl.extraSkills.forEach(key => {
                    const def = SKILL_DEFS[key];
                    if (!def || !def.name) return;
                    if (sk[ch.id].some(x => x.name === def.name)) return;
                    sk[ch.id].push(Object.assign({ id: key, unlockLevel: 1, locked: false }, def));
                });
            }
        }
        if (!ruleData[ch.id]) ruleData[ch.id] = emptyRules();
    });
    // ヤード内のルールは残す（パーティ外でも消さない）
    yardChars.forEach(ch => {
        if (!ruleData[ch.id]) ruleData[ch.id] = emptyRules();
    });
    // 敵・ヤードのどちらにもいない ruleData だけ掃除
    const alive = {};
    yardChars.forEach(c => { alive[c.id] = true; });
    enemyChars.forEach(c => { alive[c.id] = true; });
    Object.keys(ruleData).forEach(k => {
        if (!alive[k]) delete ruleData[k];
    });
    return { cm, sk };
}

let yardChars = [];
let retiredChars = [];  // P9 引退キャラ
/** アカウント単位の戦術解放（ターゲット等） */
let accountUnlocks = {
    targets: null,       // null = 旧セーブ互換で全ターゲット解放
    conditions: null,    // null = 旧セーブ互換で全条件解放
    accessories: [],     // 解放済みアクセサリー defId 一覧
    reachedStages: {},   // { dungeonId: [stageId, ...] }
    stageCleared: {},    // { 'labyrinth:b2:normal': true, ... }
};
/** 失敗プール（ローカル・本人分のみ） floorKey -> { amount, updatedAt } */
let failurePool = {};
/** プール受取記録 { date: 'YYYY-MM-DD', claimedToday: { floorKey: number } } */
let poolClaims = { date: '', claimedToday: {} };


let partyIds = [];
let enemyChars = [];
let ruleData = {};

// 互換: 旧コードが partyChars 配列を参照する場合は syncMeta で更新
let partyChars = [];

// ---- P8.4 募集：未確定の候補（保存対象。リロードで引き直せないようにする） ----
let recruitPools = { free: null, paid: null };

// ---- P8.6 アクセサリー所持 ----
let accessories = [];


// ---- P8.3 統合リソース ----
let gameResource = (typeof PROVISIONAL_RESOURCE_INIT !== 'undefined') ? PROVISIONAL_RESOURCE_INIT : 0;

function getResource() {
    return gameResource | 0;
}

/** 総獲得 SS（遠征・プール受取・広告・抜き出しの増加分）。注入の戻り分・開発用加算は含めない */
let totalEarnedSs = 0;

/** opts.noEarn = true なら総獲得 SS に数えない */
function addResource(amount, opts) {
    const n = Math.floor(Number(amount) || 0);
    if (n > 0) {
        gameResource = (gameResource | 0) + n;
        if (!(opts && opts.noEarn)) totalEarnedSs = (totalEarnedSs | 0) + n;
    }
    if (typeof updateResourceUI === 'function') updateResourceUI();
    return gameResource | 0;
}

function canSpendResource(amount) {
    const n = Math.floor(Number(amount) || 0);
    if (n <= 0) return true;
    return (gameResource | 0) >= n;
}

/** @returns {boolean} 消費できたか */
function spendResource(amount) {
    const n = Math.floor(Number(amount) || 0);
    if (n <= 0) return true;
    if (!canSpendResource(n)) return false;
    gameResource = (gameResource | 0) - n;
    if (typeof updateResourceUI === 'function') updateResourceUI();
    return true;
}

// ---- P8.3 複数パーティセット ----
let partySets = [];
let activePartySetIndex = 0;

/** パーティセット数（基本 + 広告ポイントで追加した分） */
function partySetCount() {
    const ex = (typeof accountUnlocks !== 'undefined' && accountUnlocks) ? (accountUnlocks.partyExtra | 0) : 0;
    return PARTY_SET_COUNT + Math.max(0, Math.min(AD_SHOP.party.maxExtra, ex));
}
/** ヤード上限（基本 + 広告ポイントで拡張した分） */
function yardCap() {
    const ex = (typeof accountUnlocks !== 'undefined' && accountUnlocks) ? (accountUnlocks.yardExtra | 0) : 0;
    return YARD_MAX + Math.max(0, Math.min(AD_SHOP.yard.maxExtra, ex));
}
function makeEmptyPartySets() {
    const out = [];
    for (let i = 0; i < partySetCount(); i++) out.push({ name: 'パーティ' + String.fromCharCode(65 + i), partyIds: [] });
    return out;
}

function ensurePartySets() {
    if (!Array.isArray(partySets) || !partySets.length) {
        partySets = makeEmptyPartySets();
    }
    while (partySets.length < partySetCount()) partySets.push({ name: 'パーティ' + String.fromCharCode(65 + partySets.length), partyIds: [] });
    if (partySets.length > partySetCount()) partySets.length = partySetCount();
    partySets.forEach((s, i) => {
        if (!s || typeof s !== 'object') partySets[i] = { name: 'パーティ' + String.fromCharCode(65 + i), partyIds: [] };
        if (!Array.isArray(partySets[i].partyIds)) partySets[i].partyIds = [];
        if (!partySets[i].name) partySets[i].name = 'パーティ' + String.fromCharCode(65 + i);
    });
    if (activePartySetIndex < 0 || activePartySetIndex >= partySetCount()) activePartySetIndex = 0;
}

/** 現在の partyIds をアクティブセットへ書き戻す */
function syncPartyIdsToActiveSet() {
    ensurePartySets();
    partySets[activePartySetIndex].partyIds = partyIds.slice();
}

/** charId が「アクティブ以外」のどのパーティに所属しているか。なければ -1 */
function getOtherPartySetIndexOf(charId) {
    syncPartyIdsToActiveSet();
    for (let i = 0; i < partySets.length; i++) {
        if (i === activePartySetIndex) continue;
        if (partySets[i].partyIds.indexOf(charId) >= 0) return i;
    }
    return -1;
}

/** 同一キャラの重複所属を解消（アクティブセット優先、次に番号順）。ヤードにいないIDも除去 */
function dedupePartySets() {
    const seen = {};
    const order = [activePartySetIndex];
    for (let i = 0; i < partySets.length; i++) if (i !== activePartySetIndex) order.push(i);
    order.forEach(i => {
        partySets[i].partyIds = partySets[i].partyIds.filter(id => {
            if (seen[id] || !yardChars.some(c => c.id === id)) return false;
            seen[id] = true;
            return true;
        }).slice(0, MAX_PARTY);
    });
}

function switchPartySet(idx) {
    ensurePartySets();
    idx = idx | 0;
    if (idx < 0 || idx >= partySetCount()) return;
    syncPartyIdsToActiveSet();
    activePartySetIndex = idx;
    dedupePartySets();
    // セット内IDでヤードに存在するものだけ採用
    partyIds = partySets[idx].partyIds.filter(id => yardChars.some(c => c.id === id));
    if (partyIds.length > MAX_PARTY) partyIds = partyIds.slice(0, MAX_PARTY);
    partyChars = getPartyChars();
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
}

function renamePartySet(idx, name) {
    ensurePartySets();
    if (idx < 0 || idx >= partySetCount()) return;
    const n = String(name || '').trim();
    if (!n) return;
    partySets[idx].name = n.slice(0, 20);
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
}

function initDefaultRoster() {
    yardChars = [
        createChar('enchanter', '付術士', true),
        createChar('mage', '魔法使い', true),
        createChar('cleric', '僧侶', true),
        createChar('warrior', '戦士', true)
    ];
    partyIds = yardChars.map(c => c.id);

    enemyChars = [
        createChar('cleric', '敵B (僧侶)', false),
        createChar('mage', '敵C (魔法)', false),
        createChar('warrior', '敵A (戦士)', false)
    ];

    ruleData = {};
    yardChars.forEach(ch => { ruleData[ch.id] = defaultPlayerRules(); });
    enemyChars.forEach(ch => { ruleData[ch.id] = emptyRules(); });

    const eB = enemyChars[0].id, eC = enemyChars[1].id, eA = enemyChars[2].id;
    ruleData[eA][0] = { active: true, cond: 0, tgt: 1, skill: 0 };
    ruleData[eB][0] = { active: true, cond: 2, tgt: 2, skill: 1 };
    ruleData[eB][1] = { active: true, cond: 0, tgt: 0, skill: 0 };
    ruleData[eC][0] = { active: true, cond: 0, tgt: 4, skill: 4 };
    ruleData[eC][1] = { active: true, cond: 0, tgt: 0, skill: 1 };

    partySets = makeEmptyPartySets();
    partySets[0].partyIds = partyIds.slice();
    activePartySetIndex = 0;
    recruitPools = { free: null, paid: null };
    gameResource = (typeof PROVISIONAL_RESOURCE_INIT !== 'undefined') ? PROVISIONAL_RESOURCE_INIT : 0;
    totalEarnedSs = 0;
    retiredChars = [];
    accessories = [];
    if (typeof ensureTestAccessories === 'function') ensureTestAccessories();
    if (typeof initAccountUnlocksForNewGame === 'function') initAccountUnlocksForNewGame();
}


initDefaultRoster();
partyChars = getPartyChars();
let _pack = rebuildCharMetaAndSkills();
let charMeta = _pack.cm;
let skills = _pack.sk;

function syncMeta() {
    partyChars = getPartyChars();
    const pack = rebuildCharMetaAndSkills();
    charMeta = pack.cm;
    skills = pack.sk;
    Object.keys(charMeta).forEach(id => {
        const ch = getPartyChars().concat(enemyChars).find(c => c.id === id);
        if (ch) {
            charMeta[id].hp = ch.maxHp;
            charMeta[id].mp = ch.maxMp;
            ch.hp = ch.maxHp;
            ch.mp = ch.maxMp;
        }
    });
}

/** ヤードに新規キャラを追加（クラス選択） */
function addToYard() {
    if (typeof isDevEnvironment === 'function' && !isDevEnvironment()) return alert('開発環境でのみ使用できます');
    if (isYardFull()) return alert('ヤードがいっぱいです（' + yardCap() + '体）。引退させてSSを抜き出すと枠が空きます');
    const sel = document.getElementById('add-yard-class');
    if (!sel) return;
    const classId = sel.value;
    const baseName = CLASS_DEFS[classId].name;
    const same = yardChars.filter(c => c.classId === classId).length;
    const name = same ? baseName + (same + 1) : baseName;
    const ch = createChar(classId, name, true);
    yardChars.push(ch);
    ruleData[ch.id] = defaultPlayerRules();
    // パーティに空きがあれば自動で入れる
    if (partyIds.length < MAX_PARTY) {
        partyIds.push(ch.id);
    }
    syncMeta();
    currentChar = ch.id;
    activeGroup = 'player';
    if (typeof persist === "function") persist();
    renderAll();
}

/** ヤードから削除（パーティにいれば外す） */
function removeFromYard(charId) {
    const target = yardChars.find(c => c.id === charId);
    if (target && (target.growthSs | 0) > 0) return alert('成長にSSを使ったキャラは削除できません。引退させてSSを抜き出してください');
    yardChars = yardChars.filter(c => c.id !== charId);
    partyIds = partyIds.filter(id => id !== charId);
    partySets.forEach(st => { st.partyIds = st.partyIds.filter(id => id !== charId); });
    // ruleData はヤードにいなければ掃除（rebuildで）
    syncMeta();
    if (!yardChars.find(c => c.id === currentChar) && !enemyChars.find(c => c.id === currentChar)) {
        currentChar = partyIds[0] || (yardChars[0] && yardChars[0].id) || null;
        activeGroup = 'player';
    }
    if (typeof persist === "function") persist();
    renderAll();
}


/** パーティ出撃順：上へ */
function movePartyUp(charId) {
    const i = partyIds.indexOf(charId);
    if (i <= 0) return;
    const t = partyIds[i - 1];
    partyIds[i - 1] = partyIds[i];
    partyIds[i] = t;
    partyChars = getPartyChars();
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
}

/** パーティ出撃順：下へ */
function movePartyDown(charId) {
    const i = partyIds.indexOf(charId);
    if (i < 0 || i >= partyIds.length - 1) return;
    const t = partyIds[i + 1];
    partyIds[i + 1] = partyIds[i];
    partyIds[i] = t;
    partyChars = getPartyChars();
    if (typeof syncPartyIdsToActiveSet === "function") syncPartyIdsToActiveSet();
    if (typeof persist === 'function') persist();
    if (typeof renderAll === 'function') renderAll();
}

/** 名前変更（ヤード・敵共通） */
function renameChar(charId) {
    const ch = yardChars.find(c => c.id === charId) || enemyChars.find(c => c.id === charId);
    if (!ch) return;
    const next = prompt('新しい名前', ch.name);
    if (next === null) return;
    const name = String(next).trim();
    if (!name) return alert('名前が空です');
    if (name.length > 20) return alert('名前は20文字以内にしてください');
    ch.name = name;
    if (typeof persist === 'function') persist();
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof renderAll === 'function') renderAll();
}

/** パーティに入れる */
function addToParty(charId) {
    if (isInParty(charId)) return;
    if (partyIds.length >= MAX_PARTY) return alert('パーティは最大' + MAX_PARTY + '人です');
    if (!yardChars.find(c => c.id === charId)) return;
    const other = getOtherPartySetIndexOf(charId);
    if (other >= 0) return alert('このキャラは「' + partySets[other].name + '」に所属しています。先にそちらから外してください');
    partyIds.push(charId);
    syncMeta();
    currentChar = charId;
    activeGroup = 'player';
    if (typeof persist === "function") persist();
    renderAll();
}

/** パーティから外す（ヤードには残る） */
function removeFromParty(charId) {
    partyIds = partyIds.filter(id => id !== charId);
    if (typeof syncPartyIdsToActiveSet === 'function') syncPartyIdsToActiveSet();
    syncMeta();
    if (currentChar === charId) {
        currentChar = partyIds[0] || null;
    }
    activeGroup = 'player';
    if (typeof persist === "function") persist();
    renderAll();
}

/** 敵の追加（従来どおり） */
function addEnemyMember() {
    const sel = document.getElementById('add-enemy-class');
    if (!sel) return;
    if (enemyChars.length >= MAX_PARTY) return alert('敵は最大' + MAX_PARTY + '体です');
    const classId = sel.value;
    const baseName = CLASS_DEFS[classId].name;
    const same = enemyChars.filter(c => c.classId === classId).length;
    const name = '敵 (' + baseName + ')' + (same ? same + 1 : '');
    const ch = createChar(classId, name, false);
    enemyChars.push(ch);
    ruleData[ch.id] = emptyRules();
    syncMeta();
    currentChar = ch.id;
    activeGroup = 'enemy';
    if (typeof persist === "function") persist();
    renderAll();
}

function removeEnemyMember(id) {
    if (enemyChars.length <= 1) return alert('敵は最低1体必要です');
    enemyChars = enemyChars.filter(c => c.id !== id);
    syncMeta();
    currentChar = enemyChars[0].id;
    activeGroup = 'enemy';
    if (typeof persist === "function") persist();
    renderAll();
}

// 旧UI互換名
function addPartyMember(isPlayer) {
    if (isPlayer) addToYard();
    else addEnemyMember();
}
function removeMember(id) {
    if (enemyChars.some(c => c.id === id)) removeEnemyMember(id);
    else removeFromYard(id);
}

let currentChar = partyIds[0];
let activeGroup = 'player';
let structuredLog = [];
let debugPlainLines = [];

// ========== P8.6 アクセサリー API ==========
function getAccessoryInstance(accId) {
    if (!accId) return null;
    return accessories.find(a => a.id === accId) || null;
}

function getAccessoryEffects(ch) {
    if (!ch || !ch.accessoryId) return {};
    const inst = getAccessoryInstance(ch.accessoryId);
    if (!inst) return {};
    const lv = inst.level || 1;
    if (typeof accessoryEffectsAtLevel === 'function') {
        return accessoryEffectsAtLevel(inst.defId, lv);
    }
    const def = getAccessoryDef(inst.defId);
    return (def && def.effects) ? Object.assign({}, def.effects) : {};
}

function getEffectiveStat(ch, key) {
    if (!ch) return 0;
    const base = (typeof ch[key] === 'number') ? ch[key] : 0;
    const fx = getAccessoryEffects(ch);
    if (key === 'atk' || key === 'def' || key === 'int' || key === 'mnd') {
        return base + (fx[key] || 0);
    }
    return base;
}

function getStatusResist(chOrMeta, statusKey) {
    // statusKey: 'poison' | 'paralysis' | 'sleep'
    if (!chOrMeta) return 0;
    // charMeta に既に載っている場合
    if (statusKey === 'poison' && typeof chOrMeta.poisonResist === 'number') return chOrMeta.poisonResist || 0;
    if (statusKey === 'paralysis' && typeof chOrMeta.paralysisResist === 'number') return chOrMeta.paralysisResist || 0;
    if (statusKey === 'sleep' && typeof chOrMeta.sleepResist === 'number') return chOrMeta.sleepResist || 0;
    // キャラ実体
    const fx = getAccessoryEffects(chOrMeta);
    const map = { poison: 'poisonResist', paralysis: 'paralysisResist', sleep: 'sleepResist' };
    return fx[map[statusKey]] || 0;
}

function grantAccessory(defId, level) {
    const def = getAccessoryDef(defId);
    if (!def) return null;
    const canon = def.id;
    const id = genId('acc');
    const lv = Math.max(1, Math.min(
        (typeof ACCESSORY_LEVEL_CAP !== 'undefined' ? ACCESSORY_LEVEL_CAP : 20),
        (level | 0) || 1
    ));
    accessories.push({ id: id, defId: canon, level: lv });
    return id;
}

/** 同種アクセサリーの所持個体一覧 */
function listAccessoryInstances(defId) {
    const def = getAccessoryDef(defId);
    const canon = def ? def.id : defId;
    return (accessories || []).filter(a => {
        const d = getAccessoryDef(a.defId);
        return d && d.id === canon;
    });
}
/** 同じ種類の中での番号（手に入れた順に 1, 2, 3 …） */
function accessoryNo(accId) {
    const inst = getAccessoryInstance(accId);
    if (!inst) return 0;
    return listAccessoryInstances(inst.defId).findIndex(a => a.id === accId) + 1;
}
/** 個体の表示名：同じ種類を2個以上持っているときは「鉄の腕輪 #2 Lv3」のように番号を付ける */
function accessoryLabel(accId, opts) {
    const inst = getAccessoryInstance(accId);
    const def = inst ? getAccessoryDef(inst.defId) : null;
    if (!def) return '';
    const many = listAccessoryInstances(inst.defId).length > 1;
    return def.name + (many ? ' #' + accessoryNo(accId) : '') + ((opts && opts.noLv) ? '' : ' Lv' + (inst.level || 1));
}
function countOwnedAccessory(defId) {
    return listAccessoryInstances(defId).length;
}
function findOwnedAccessoryByDef(defId) {
    const list = listAccessoryInstances(defId);
    return list.length ? list[0] : null;
}
/** 未装備の個体を1つ返す */
function findFreeAccessoryInstance(defId) {
    return listAccessoryInstances(defId).find(a => !whoEquipsAccessory(a.id)) || null;
}
/** 装備中の個体数 */
function countEquippedAccessory(defId) {
    return listAccessoryInstances(defId).filter(a => !!whoEquipsAccessory(a.id)).length;
}

/** 装備中キャラの id を返す。未装備なら null */
function whoEquipsAccessory(accId) {
    if (!accId) return null;
    const all = (yardChars || []).concat(enemyChars || []);
    const ch = all.find(c => c.accessoryId === accId);
    return ch ? ch.id : null;
}

function unequipAccessory(charId) {
    const ch = findCharById(charId);
    if (!ch) return false;
    ch.accessoryId = null;
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return true;
}

/**
 * アクセサリー個体を装備。
 * - 1個体は同時に1キャラのみ装備可
 * - 既に別アクセを装備中なら付け替え（旧個体は空きに戻る）
 */
function equipAccessory(charId, accId) {
    const ch = findCharById(charId);
    if (!ch) return { ok: false, reason: 'キャラクターが見つかりません' };
    if (!ch.isPlayer) return { ok: false, reason: '味方のみ装備できます' };
    const inst = getAccessoryInstance(accId);
    if (!inst) return { ok: false, reason: 'アクセサリーが見つかりません' };
    const owner = whoEquipsAccessory(accId);
    if (owner && owner !== charId) {
        return { ok: false, reason: '他のキャラクターが装備中です（所持枠が埋まっています）' };
    }
    // 付け替え
    ch.accessoryId = accId;
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return { ok: true };
}

/** 同種の空き個体があれば装備。なければ失敗 */
function equipAccessoryByDef(charId, defId) {
    const ch = findCharById(charId);
    if (!ch) return { ok: false, reason: 'キャラクターが見つかりません' };
    // 既に同種を装備中ならそのまま成功
    if (ch.accessoryId) {
        const cur = getAccessoryInstance(ch.accessoryId);
        const def = getAccessoryDef(defId);
        const curDef = cur ? getAccessoryDef(cur.defId) : null;
        if (curDef && def && curDef.id === def.id) return { ok: true, already: true };
    }
    let inst = findFreeAccessoryInstance(defId);
    // 自分が装備中の同種があればそれを使う
    if (!inst && ch.accessoryId) {
        const cur = getAccessoryInstance(ch.accessoryId);
        const def = getAccessoryDef(defId);
        const curDef = cur ? getAccessoryDef(cur.defId) : null;
        if (curDef && def && curDef.id === def.id) inst = cur;
    }
    if (!inst) {
        const owned = countOwnedAccessory(defId);
        if (owned <= 0) return { ok: false, reason: '所持していません' };
        return { ok: false, reason: '所持数分はすべて他キャラが装備中です' };
    }
    return equipAccessory(charId, inst.id);
}

/** 互換: 旧セーブでアクセサリーが空なら何もしない（テスト全付与は廃止） */
function ensureTestAccessories() {
    if (!Array.isArray(accessories)) accessories = [];
}

function getDefaultUnlockedTargets() {
    return (typeof DEFAULT_UNLOCKED_TARGETS !== 'undefined')
        ? DEFAULT_UNLOCKED_TARGETS.slice()
        : [];
}
function getDefaultUnlockedConditions() {
    return (typeof DEFAULT_UNLOCKED_CONDITIONS !== 'undefined')
        ? DEFAULT_UNLOCKED_CONDITIONS.slice()
        : [];
}

function ensureAccountUnlocksShape() {
    if (!accountUnlocks || typeof accountUnlocks !== 'object') {
        accountUnlocks = { targets: null, conditions: null, accessories: [], reachedStages: {}, stageCleared: {}, lv10Reached: false };
    }
    if (!Array.isArray(accountUnlocks.story)) accountUnlocks.story = [];
    ['adPoints', 'adToday', 'adLastAt', 'yardExtra', 'partyExtra'].forEach(k => { if (!(accountUnlocks[k] >= 0)) accountUnlocks[k] = 0; });
    if (typeof accountUnlocks.adDay !== 'string') accountUnlocks.adDay = '';
    if (!Array.isArray(accountUnlocks.accessories)) accountUnlocks.accessories = [];
    if (!accountUnlocks.reachedStages || typeof accountUnlocks.reachedStages !== 'object') {
        accountUnlocks.reachedStages = {};
    }
    if (!accountUnlocks.stageCleared || typeof accountUnlocks.stageCleared !== 'object') {
        accountUnlocks.stageCleared = {};
    }
    if (!failurePool || typeof failurePool !== 'object') failurePool = {};
    if (!poolClaims || typeof poolClaims !== 'object') poolClaims = { date: '', claimedToday: {} };
    if (!poolClaims.claimedToday) poolClaims.claimedToday = {};
}
/* ---- P9.22.0 メインクエストの進み具合 ---- */
function storySeen(id) { ensureAccountUnlocksShape(); return accountUnlocks.story.indexOf(id) >= 0; }
/** この場面を今見てよいか（順番と踏破の条件。later の時間差は画面側で見る） */
function storyCanSee(id) {
    const d = (typeof storyStepDef === 'function') ? storyStepDef(id) : null;
    if (!d || storySeen(id)) return false;
    if (d.need && !storySeen(d.need)) return false;
    if (d.clear) { const k = d.clear.split(':'); if (!isStageCleared(k[0], k[1], k[2])) return false; }
    return true;
}
function storyMarkSeen(id) {
    if (!storyCanSee(id)) return { ok: false, reason: 'まだこの話は見られません' };
    accountUnlocks.story.push(id);
    if (typeof persist === 'function') persist();
    return { ok: true };
}

/** 明示リストがある場合、初期解放項目が欠けていれば補完する */
function syncInitialUnlocksIntoLists() {
    ensureAccountUnlocksShape();
    if (Array.isArray(accountUnlocks.targets) && typeof TARGET_UNLOCK_DEFS !== 'undefined') {
        Object.keys(TARGET_UNLOCK_DEFS).forEach(name => {
            if (TARGET_UNLOCK_DEFS[name].cost == null && accountUnlocks.targets.indexOf(name) < 0) {
                accountUnlocks.targets.push(name);
            }
        });
    }
    if (Array.isArray(accountUnlocks.conditions) && typeof CONDITION_UNLOCK_DEFS !== 'undefined') {
        Object.keys(CONDITION_UNLOCK_DEFS).forEach(name => {
            if (CONDITION_UNLOCK_DEFS[name].cost == null && accountUnlocks.conditions.indexOf(name) < 0) {
                accountUnlocks.conditions.push(name);
            }
        });
    }
}

/** 初期解放（cost: null）は常に利用可。null リストは旧セーブ互換で全解放 */
function isTargetUnlocked(targetName) {
    ensureAccountUnlocksShape();
    const udef = (typeof TARGET_UNLOCK_DEFS !== 'undefined') ? TARGET_UNLOCK_DEFS[targetName] : null;
    if (udef && udef.cost == null) return true;
    if (accountUnlocks.targets == null) return true;
    return accountUnlocks.targets.indexOf(targetName) >= 0;
}
function isConditionUnlocked(condName) {
    ensureAccountUnlocksShape();
    const udef = (typeof CONDITION_UNLOCK_DEFS !== 'undefined') ? CONDITION_UNLOCK_DEFS[condName] : null;
    if (udef && udef.cost == null) return true;
    if (accountUnlocks.conditions == null) return true;
    return accountUnlocks.conditions.indexOf(condName) >= 0;
}
function isAccessoryTypeUnlocked(defId) {
    ensureAccountUnlocksShape();
    const def = getAccessoryDef(defId);
    const canon = def ? def.id : defId;
    return accountUnlocks.accessories.indexOf(canon) >= 0;
}

function unlockTarget(targetName) {
    if (!targetName) return false;
    ensureAccountUnlocksShape();
    if (accountUnlocks.targets == null) {
        accountUnlocks.targets = (typeof targets !== 'undefined' ? targets.slice() : getDefaultUnlockedTargets());
    }
    if (accountUnlocks.targets.indexOf(targetName) >= 0) return false;
    accountUnlocks.targets.push(targetName);
    if (typeof persist === 'function') persist();
    return true;
}
function unlockCondition(condName) {
    if (!condName) return false;
    ensureAccountUnlocksShape();
    if (accountUnlocks.conditions == null) {
        accountUnlocks.conditions = (typeof conditions !== 'undefined' ? conditions.slice() : getDefaultUnlockedConditions());
    }
    if (accountUnlocks.conditions.indexOf(condName) >= 0) return false;
    accountUnlocks.conditions.push(condName);
    if (typeof persist === 'function') persist();
    return true;
}

/** SSで条件解放。成功時 true */
function purchaseConditionUnlock(condName) {
    const def = (typeof CONDITION_UNLOCK_DEFS !== 'undefined') ? CONDITION_UNLOCK_DEFS[condName] : null;
    if (!def || def.cost == null || typeof def.cost !== 'number') return { ok: false, reason: '購入対象外' };
    if (isConditionUnlocked(condName)) return { ok: false, reason: '既に解放済み' };
    if (!canSpendResource(def.cost)) return { ok: false, reason: 'SS不足' };
    if (!spendResource(def.cost)) return { ok: false, reason: 'SS不足' };
    unlockCondition(condName);
    return { ok: true, cost: def.cost };
}
/** SSで対象解放 */
function purchaseTargetUnlock(targetName) {
    const def = (typeof TARGET_UNLOCK_DEFS !== 'undefined') ? TARGET_UNLOCK_DEFS[targetName] : null;
    if (!def || def.cost == null || typeof def.cost !== 'number') return { ok: false, reason: '購入対象外' };
    if (isTargetUnlocked(targetName)) return { ok: false, reason: '既に解放済み' };
    if (!canSpendResource(def.cost)) return { ok: false, reason: 'SS不足' };
    if (!spendResource(def.cost)) return { ok: false, reason: 'SS不足' };
    unlockTarget(targetName);
    return { ok: true, cost: def.cost };
}

/** アクセサリー種別を解放し、未所持なら Lv1 個体を1つ付与 */
function unlockAccessoryType(defId) {
    ensureAccountUnlocksShape();
    const def = getAccessoryDef(defId);
    if (!def) return { ok: false, reason: '不明なアクセサリー' };
    const canon = def.id;
    let newly = false;
    if (accountUnlocks.accessories.indexOf(canon) < 0) {
        accountUnlocks.accessories.push(canon);
        newly = true;
    }
    if (!findOwnedAccessoryByDef(canon)) {
        grantAccessory(canon, 1);
    }
    if (typeof persist === 'function') persist();
    return { ok: true, newly: newly };
}

/** Lv10到達フラグ（誰か1人でも到達したら永続） */
function noteLevelReached() {
    ensureAccountUnlocksShape();
    if (accountUnlocks.lv10Reached) return;
    const hit = (yardChars || []).concat(retiredChars || []).some(c => c && c.isPlayer !== false && (c.level || 1) >= RULE_ROWS_LV10_LEVEL);
    if (hit) { accountUnlocks.lv10Reached = true; }
}
function isLv10Reached() {
    noteLevelReached();
    return !!accountUnlocks.lv10Reached;
}
/** 現在使えるバトルルール行数（味方） */
function getRuleRowLimit() {
    ensureAccountUnlocksShape();
    let n = RULE_ROWS_INITIAL;
    if (isLv10Reached()) n++;
    if (accountUnlocks.stageCleared[RULE_ROWS_B2_KEY]) n++;
    return Math.min(n, RULE_ROWS_MAX, MAX_RULES);
}

/** 拠点でアクセサリーを購入（Lv1個体）。初回購入で種別が解放される */
function purchaseAccessoryUnlock(defId) {
    const def = getAccessoryDef(defId);
    const udef = def ? ACCESSORY_UNLOCK_DEFS[def.id] : null;
    if (!udef || udef.source !== 'shop') return { ok: false, reason: '購入対象外（ドロップ専用）です' };
    if (!isLv10Reached()) return { ok: false, reason: 'レベル' + ACCESSORY_SHOP_REQUIRE_LEVEL + 'に到達したキャラがいると購入できます' };
    if (countOwnedAccessory(def.id) >= ACCESSORY_MAX_COUNT) return { ok: false, reason: '所持上限（' + ACCESSORY_MAX_COUNT + '個）です' };
    if (!canSpendResource(udef.cost)) return { ok: false, reason: 'SS不足' };
    if (!spendResource(udef.cost)) return { ok: false, reason: 'SS不足' };
    ensureAccountUnlocksShape();
    const newly = accountUnlocks.accessories.indexOf(def.id) < 0;
    if (newly) accountUnlocks.accessories.push(def.id);
    grantAccessory(def.id, 1);
    if (typeof persist === 'function') persist();
    return { ok: true, newly: newly, cost: udef.cost };
}

/** 踏破報酬のアクセサリー抽選。当選分を Lv1 個体として付与し、表示名の配列を返す */
function rollClearDrops(dungeonId, mode) {
    const t = CLEAR_DROP_TABLE[dungeonId + ':' + (mode || 'normal')];
    const got = [];
    got.soldSs = 0;
    if (!t) return got;
    ensureAccountUnlocksShape();
    let soldSs = 0;
    for (let i = 0; i < t.rolls; i++) {
        if (Math.random() >= t.rate) continue;
        const defId = t.items[Math.floor(Math.random() * t.items.length)];
        const def = getAccessoryDef(defId);
        if (!def) continue;
        if (countOwnedAccessory(def.id) >= ACCESSORY_MAX_COUNT) {
            // 所持上限：自動売却して SS に（総獲得 SS にも数える）
            const sell = (typeof ACCESSORY_SELL_SS !== 'undefined') ? ACCESSORY_SELL_SS : 0;
            if (sell > 0) addResource(sell);
            soldSs += sell;
            got.push(def.name + '（所持上限のため自動売却 +' + sell + ' SS）');
            continue;
        }
        if (accountUnlocks.accessories.indexOf(def.id) < 0) accountUnlocks.accessories.push(def.id);
        grantAccessory(def.id, 1);
        got.push(def.name + ' Lv1');
    }
    got.soldSs = soldSs;
    if (got.length && typeof persist === 'function') persist();
    return got;
}

/** 広告視聴の報酬ポイントを受け取る（1日の回数・間隔・所持上限を検証） */
function claimAdPoint(nowMs) {
    ensureAccountUnlocksShape();
    const u = accountUnlocks, day = todayStr(), now = nowMs || Date.now();
    if (u.adDay !== day) { u.adDay = day; u.adToday = 0; }
    if (u.adToday >= AD_DAILY_LIMIT) return { ok: false, reason: '本日の広告報酬は上限（' + AD_DAILY_LIMIT + '回）に達しました' };
    if (u.adLastAt && now >= u.adLastAt && now - u.adLastAt < AD_MIN_INTERVAL_MS) return { ok: false, reason: '少し間をおいてからお試しください' };
    if (u.adPoints >= AD_POINT_CAP) return { ok: false, reason: AD_POINT_NAME + 'の所持上限（' + AD_POINT_CAP + '）です。先に使ってください' };
    u.adPoints = Math.min(AD_POINT_CAP, u.adPoints + AD_POINT_PER_VIEW);
    u.adToday++; u.adLastAt = now;
    if (typeof persist === 'function') persist();
    return { ok: true, points: u.adPoints, today: u.adToday, limit: AD_DAILY_LIMIT };
}
/** 広告ポイントの状況（今日の残り回数つき） */
function adStatus() {
    ensureAccountUnlocksShape();
    const u = accountUnlocks;
    return { points: u.adPoints | 0, today: u.adDay === todayStr() ? (u.adToday | 0) : 0, limit: AD_DAILY_LIMIT, yardExtra: u.yardExtra | 0, partyExtra: u.partyExtra | 0 };
}
/** 広告ポイントで便利機能を買う */
function purchaseAdShop(kind) {
    const item = AD_SHOP[kind];
    if (!item) return { ok: false, reason: '不明な商品です' };
    ensureAccountUnlocksShape();
    const u = accountUnlocks, key = kind === 'yard' ? 'yardExtra' : 'partyExtra';
    if ((u[key] | 0) >= item.maxExtra) return { ok: false, reason: 'これ以上は拡張できません（上限）' };
    if ((u.adPoints | 0) < item.cost) return { ok: false, reason: AD_POINT_NAME + 'が足りません（必要: ' + item.cost + '）' };
    u.adPoints -= item.cost;
    u[key] = Math.min(item.maxExtra, (u[key] | 0) + item.add);
    if (kind === 'party' && typeof ensurePartySets === 'function') ensurePartySets();
    if (typeof persist === 'function') persist();
    return { ok: true, cost: item.cost, yardCap: yardCap(), partySets: partySetCount() };
}

function upgradeAccessory(accId) {
    const inst = getAccessoryInstance(accId);
    if (!inst) return { ok: false, reason: 'アクセサリーが見つかりません' };
    const cap = (typeof ACCESSORY_LEVEL_CAP !== 'undefined') ? ACCESSORY_LEVEL_CAP : 20;
    const lv = inst.level || 1;
    if (lv >= cap) return { ok: false, reason: 'Lv上限です' };
    const next = lv + 1;
    const cost = (typeof ACCESSORY_UPGRADE_COST !== 'undefined') ? ACCESSORY_UPGRADE_COST[next] : null;
    if (cost == null) return { ok: false, reason: '強化費用が未定義です' };
    if (!canSpendResource(cost)) return { ok: false, reason: 'SS不足' };
    if (!spendResource(cost)) return { ok: false, reason: 'SS不足' };
    inst.level = next;
    if (typeof persist === 'function') persist();
    return { ok: true, level: next, cost: cost };
}

function markStageReached(dungeonId, stageId) {
    if (!dungeonId || !stageId) return;
    ensureAccountUnlocksShape();
    if (!accountUnlocks.reachedStages[dungeonId]) accountUnlocks.reachedStages[dungeonId] = [];
    const arr = accountUnlocks.reachedStages[dungeonId];
    if (arr.indexOf(stageId) < 0) {
        arr.push(stageId);
        if (typeof persist === 'function') persist();
    }
}
function isStageReached(dungeonId, stageId) {
    ensureAccountUnlocksShape();
    const arr = accountUnlocks.reachedStages[dungeonId];
    return Array.isArray(arr) && arr.indexOf(stageId) >= 0;
}

function initAccountUnlocksForNewGame() {
    accountUnlocks = {
        targets: getDefaultUnlockedTargets(),
        conditions: getDefaultUnlockedConditions(),
        accessories: [],
        reachedStages: {},
        stageCleared: {},
        lv10Reached: false,
        adPoints: 0, adDay: '', adToday: 0, adLastAt: 0, yardExtra: 0, partyExtra: 0
    };
    failurePool = {};
    poolClaims = { date: '', claimedToday: {} };
}

/**
 * ボス撃破ドロップ判定。
 * @returns {string[]} 獲得したドロップの表示名
 */
function rollBossDrops(enemyList) {
    const got = [];
    (enemyList || []).forEach(e => {
        if (!e || !e.isBoss || !e.templateId) return;
        const tpl = ENEMY_TEMPLATES[e.templateId];
        if (!tpl || !Array.isArray(tpl.drops)) return;
        tpl.drops.forEach(d => {
            if (Math.random() >= (d.rate || 0)) return;
            if (d.type === 'target') {
                const newly = unlockTarget(d.id);
                got.push((d.label || d.id) + (newly ? '' : '（既に所持）'));
            }
        });
    });
    return got;
}



// ================= P9.4.6 引退・SS注入・SS抜き出し =================
/** ヤード総数（現役 + 引退キャラ） */
function yardTotalCount() { return yardChars.length + retiredChars.length; }
function isYardFull() { return yardTotalCount() >= yardCap(); }

/** 抜き出し見込み。Lv1 は 0（1D10 もなし） */
function previewExtract(ch) {
    const lv = (ch && ch.level) || 1;
    const held = (ch && ch.growthSs) | 0;
    const lvMult = retireMultiplier(lv);
    const expFactor = retireExpeditionFactor(ch);
    const mult = lvMult * expFactor;
    if (lv < 2) return { mult: mult, lvMult: lvMult, expFactor: expFactor, held: held, base: 0, min: 0, max: 0, dice: false };
    const base = Math.floor(held * mult + 1e-9);
    return { mult: mult, lvMult: lvMult, expFactor: expFactor, held: held, base: base, min: base + 1, max: base + 10, dice: true };
}

/** 自分の判断で引退させる。取り消し不可（確認は呼び出し側で行う） */
function retireChar(charId) {
    const ch = yardChars.find(c => c.id === charId);
    if (!ch) return { ok: false, reason: '対象のキャラがいません' };
    moveCharToRetired(ch, 'manual');
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return { ok: true, char: ch };
}

/** 引退キャラから SS を抜き出し、キャラを完全に削除する */
function extractRetiredChar(charId, rng) {
    const idx = retiredChars.findIndex(c => c.id === charId);
    if (idx < 0) return { ok: false, reason: '対象の引退キャラがいません' };
    const ch = retiredChars[idx];
    const p = previewExtract(ch);
    const roll = (typeof rng === 'function') ? rng : Math.random;
    const dice = p.dice ? 1 + Math.floor(roll() * 10) : 0;
    const total = p.base + dice;
    // 二重抜き出し防止: 先にキャラを削除してから加算する（同期処理）
    retiredChars.splice(idx, 1);
    delete ruleData[ch.id];
    if (total > 0) addResource(total, { noEarn: true });
    const gain = Math.max(0, total - p.held);   // 元金を超えた増加分だけ総獲得 SS に数える
    totalEarnedSs = (totalEarnedSs | 0) + gain;
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof persist === 'function') persist();
    return { ok: true, name: ch.name, held: p.held, mult: p.mult, lvMult: p.lvMult, expFactor: p.expFactor, base: p.base, dice: dice, total: total, gain: gain };
}
