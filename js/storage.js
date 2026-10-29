/**
 * storage.js — localStorage 保存 / 読込 / リセット / JSON入出力 (P7-7.1)
 */
const STORAGE_KEY = 'gambit_save_v1';

function rehydrateChar(saved) {
    const def = CLASS_DEFS[saved.classId];
    if (!def) return null;
    const b = def.base;
    const id = saved.id || saved.charId || genId('c');
    // 保存済み成長値があれば優先、なければ初期値
    const level = saved.level || 1;
    const pick = (k) => (typeof saved[k] === 'number' ? saved[k] : b[k]);
    const maxHp = pick('maxHp') !== undefined && saved.maxHp != null ? saved.maxHp : (typeof saved.hp === 'number' && level > 1 ? saved.hp : b.hp);
    const hpStat = typeof saved.maxHp === 'number' ? saved.maxHp : b.hp;
    return {
        id,
        charId: saved.charId || id,
        classId: saved.classId,
        name: saved.name || def.name,
        isPlayer: !!saved.isPlayer,
        level: level,
        classHistory: Array.isArray(saved.classHistory) && saved.classHistory.length ? saved.classHistory.slice() : [saved.classId],
        maxHp: typeof saved.maxHp === 'number' ? saved.maxHp : b.hp,
        hp: typeof saved.maxHp === 'number' ? saved.maxHp : b.hp,
        atk: pick('atk'), def: pick('def'), int: pick('int') != null ? pick('int') : b.int,
        mnd: pick('mnd') != null ? pick('mnd') : b.mnd,
        agi: pick('agi'), dex: pick('dex') != null ? pick('dex') : b.dex,
        mp: 0, maxMp: 0,
        // P8.4 募集個体（旧セーブには無い → ノーマル扱い）
        rarity: (typeof RARITY_DEFS !== 'undefined' && RARITY_DEFS[saved.rarity]) ? saved.rarity : 'normal',
        initBonus: cleanBonusMap(saved.initBonus),
        growthBonus: cleanBonusMap(saved.growthBonus),
        accessoryId: saved.accessoryId || null,
        lifespanMax: saved.lifespanMax != null ? saved.lifespanMax : (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60),
        lifespan: saved.lifespan != null ? saved.lifespan : (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60),
        retired: !!saved.retired,
        // 旧セーブ（growthSs なし）は現在Lvまでの成長費の累計で補完する
        growthSs: (typeof saved.growthSs === 'number' && saved.growthSs >= 0) ? Math.floor(saved.growthSs) : (typeof xpTotalToReach === 'function' ? xpTotalToReach(level) : 0),
        retiredAt: typeof saved.retiredAt === 'number' ? saved.retiredAt : null,
        retireReason: saved.retireReason === 'manual' ? 'manual' : (saved.retired ? 'lifespan' : null),
        portrait: (typeof portraitPresetOk === 'function' && portraitPresetOk(saved.portrait)) ? saved.portrait : null
    };
}

/** {stat: number} だけを通す（壊れたセーブ対策） */
function cleanBonusMap(m) {
    const out = {};
    if (!m || typeof m !== 'object') return out;
    STAT_KEYS.forEach(k => {
        if (typeof m[k] === 'number' && isFinite(m[k]) && m[k] !== 0) out[k] = m[k];
    });
    return out;
}

function serializeChar(c, isPlayer) {
    return {
        id: c.id, charId: c.charId, classId: c.classId, name: c.name, isPlayer: isPlayer,
        level: c.level || 1, maxHp: c.maxHp, atk: c.atk, def: c.def, int: c.int, mnd: c.mnd, agi: c.agi, dex: c.dex,
        classHistory: c.classHistory || [c.classId],
        rarity: c.rarity || 'normal',
        initBonus: c.initBonus || {},
        growthBonus: c.growthBonus || {},
        accessoryId: c.accessoryId || null,
        lifespanMax: c.lifespanMax != null ? c.lifespanMax : (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60),
        lifespan: c.lifespan != null ? c.lifespan : (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60),
        retired: !!c.retired,
        growthSs: Math.max(0, c.growthSs | 0),
        retiredAt: typeof c.retiredAt === 'number' ? c.retiredAt : null,
        retireReason: c.retireReason || null,
        portrait: (typeof portraitPresetOk === 'function' && portraitPresetOk(c.portrait)) ? c.portrait : null
    };
}

function serializeState() {
    if (typeof syncPartyIdsToActiveSet === 'function') syncPartyIdsToActiveSet();
    return {
        version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'P8.3',
        savedAt: new Date().toISOString(),
        resource: (typeof getResource === 'function') ? getResource() : (gameResource | 0),
        totalEarnedSs: (typeof totalEarnedSs !== 'undefined') ? (totalEarnedSs | 0) : 0,
        accountUnlocks: (typeof accountUnlocks !== 'undefined' && accountUnlocks)
            ? {
                targets: accountUnlocks.targets == null ? null : (accountUnlocks.targets || []).slice(),
                conditions: accountUnlocks.conditions == null ? null : (accountUnlocks.conditions || []).slice(),
                accessories: Array.isArray(accountUnlocks.accessories) ? accountUnlocks.accessories.slice() : [],
                reachedStages: accountUnlocks.reachedStages ? JSON.parse(JSON.stringify(accountUnlocks.reachedStages)) : {},
                stageCleared: accountUnlocks.stageCleared ? JSON.parse(JSON.stringify(accountUnlocks.stageCleared)) : {},
                lv10Reached: !!accountUnlocks.lv10Reached,
                adPoints: accountUnlocks.adPoints | 0, adDay: String(accountUnlocks.adDay || ''), adToday: accountUnlocks.adToday | 0,
                adLastAt: accountUnlocks.adLastAt | 0, yardExtra: accountUnlocks.yardExtra | 0, partyExtra: accountUnlocks.partyExtra | 0,
                story: Array.isArray(accountUnlocks.story) ? accountUnlocks.story.slice() : []
              }
            : { targets: null, conditions: null, accessories: [], reachedStages: {}, stageCleared: {} },
        failurePool: (typeof failurePool !== 'undefined' && failurePool) ? JSON.parse(JSON.stringify(failurePool)) : {},
        poolClaims: (typeof poolClaims !== 'undefined' && poolClaims) ? JSON.parse(JSON.stringify(poolClaims)) : { date: '', claimedToday: {} },
        retiredChars: (typeof retiredChars !== 'undefined' && Array.isArray(retiredChars))
            ? retiredChars.map(c => serializeChar(c, true))
            : [],
        accessories: (typeof accessories !== 'undefined' && Array.isArray(accessories))
            ? accessories.map(a => ({ id: a.id, defId: a.defId, level: a.level || 1 }))
            : [],
        partySets: (typeof partySets !== 'undefined' && Array.isArray(partySets))
            ? partySets.map(s => ({ name: s.name, partyIds: (s.partyIds || []).slice() }))
            : [],
        activePartySetIndex: (typeof activePartySetIndex !== 'undefined') ? activePartySetIndex : 0,
        yardChars: yardChars.map(c => serializeChar(c, true)),
        partyIds: partyIds.slice(),
        enemyChars: enemyChars.map(c => serializeChar(c, false)),
        recruitPools: {
            free: recruitPools.free ? recruitPools.free.map(serializeCandidate) : null,
            paid: recruitPools.paid ? recruitPools.paid.map(serializeCandidate) : null
        },
        ruleData: JSON.parse(JSON.stringify(ruleData))
    };
}

function saveToStorage() {
    if (typeof serverMode === 'function' && serverMode()) return true;   // サーバー版：正本はサーバー
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
        updateStorageStatus(true);
        return true;
    } catch (e) {
        console.warn('saveToStorage failed', e);
        updateStorageStatus(false, String(e.message || e));
        return false;
    }
}

function loadFromStorage() {
    let raw;
    try {
        if (typeof serverMode === 'function' && serverMode()) {
            // サーバー版：最後に受け取ったサーバー状態（キャッシュ）を表示する。旧セーブは引き継ぎ用に残す
            const c = JSON.parse(localStorage.getItem('gambit_server_cache_v1') || 'null');
            return !!(c && c.state && applySavedData(c.state));
        }
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        console.warn('localStorage unavailable', e);
        return false;
    }
    if (!raw) return false;

    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.warn('save data corrupt', e);
        return false;
    }
    return applySavedData(data);
}

/** セーブ形式のオブジェクトをメモリ上の状態へ反映する（localStorage 読込・サーバー状態の反映で共用） */
function applySavedData(data) {
    if (!data || !Array.isArray(data.yardChars)) return false;

    // 現役0人も正しい状態（全員引退した後など）。ただし中身があるのに1人も読めない場合は壊れたデータとして扱う
    const yard = data.yardChars.map(rehydrateChar).filter(Boolean);
    if (data.yardChars.length && !yard.length) return false;

    const enemies = (data.enemyChars || []).map(rehydrateChar).filter(Boolean);
    if (!enemies.length) {
        // 敵が空ならデフォルト敵だけ補う
        enemies.push(
            rehydrateChar({ classId: 'cleric', name: '敵B (僧侶)', isPlayer: false }),
            rehydrateChar({ classId: 'mage', name: '敵C (魔法)', isPlayer: false }),
            rehydrateChar({ classId: 'warrior', name: '敵A (戦士)', isPlayer: false })
        );
    }

    let pids = Array.isArray(data.partyIds) ? data.partyIds.filter(id => yard.some(c => c.id === id)) : [];
    if (pids.length > MAX_PARTY) pids = pids.slice(0, MAX_PARTY);

    yardChars = yard;
    if (data.accountUnlocks && typeof data.accountUnlocks === 'object') {
        accountUnlocks = {
            targets: Array.isArray(data.accountUnlocks.targets) ? data.accountUnlocks.targets.slice() : null,
            conditions: Array.isArray(data.accountUnlocks.conditions) ? data.accountUnlocks.conditions.slice() : null,
            accessories: Array.isArray(data.accountUnlocks.accessories) ? data.accountUnlocks.accessories.slice() : [],
            reachedStages: (data.accountUnlocks.reachedStages && typeof data.accountUnlocks.reachedStages === 'object')
                ? JSON.parse(JSON.stringify(data.accountUnlocks.reachedStages)) : {},
            stageCleared: (data.accountUnlocks.stageCleared && typeof data.accountUnlocks.stageCleared === 'object')
                ? JSON.parse(JSON.stringify(data.accountUnlocks.stageCleared)) : {},
            lv10Reached: !!data.accountUnlocks.lv10Reached,
            adPoints: Math.max(0, data.accountUnlocks.adPoints | 0), adDay: String(data.accountUnlocks.adDay || ''), adToday: Math.max(0, data.accountUnlocks.adToday | 0),
            adLastAt: Math.max(0, data.accountUnlocks.adLastAt || 0), yardExtra: Math.max(0, data.accountUnlocks.yardExtra | 0), partyExtra: Math.max(0, data.accountUnlocks.partyExtra | 0),
            story: Array.isArray(data.accountUnlocks.story)
                ? data.accountUnlocks.story.filter((id, i, a) => typeof id === 'string' && (typeof storyStepDef !== 'function' || storyStepDef(id)) && a.indexOf(id) === i) : []
        };
    } else {
        accountUnlocks = { targets: null, conditions: null, accessories: [], reachedStages: {}, stageCleared: {} };
    }
    if (typeof syncInitialUnlocksIntoLists === 'function') syncInitialUnlocksIntoLists();
    if (data.failurePool && typeof data.failurePool === 'object') {
        failurePool = JSON.parse(JSON.stringify(data.failurePool));
    } else {
        failurePool = {};
    }
    if (data.poolClaims && typeof data.poolClaims === 'object') {
        poolClaims = JSON.parse(JSON.stringify(data.poolClaims));
        if (!poolClaims.claimedToday) poolClaims.claimedToday = {};
    } else {
        poolClaims = { date: '', claimedToday: {} };
    }

    if (Array.isArray(data.retiredChars)) {
        retiredChars = data.retiredChars.map(rehydrateChar).filter(Boolean);
        retiredChars.forEach(c => { c.retired = true; });
    } else {
        retiredChars = [];
    }

    partyIds = pids;
    enemyChars = enemies;
    partyChars = getPartyChars();
    // P8.6 アクセサリー
    if (Array.isArray(data.accessories)) {
        accessories = data.accessories.map(a => {
            let defId = a.defId;
            if (typeof getAccessoryDef === 'function') {
                const d = getAccessoryDef(defId);
                if (d) defId = d.id;
            }
            return { id: a.id, defId: defId, level: Math.max(1, a.level | 0 || 1) };
        }).filter(a => a.id && a.defId);
    } else {
        accessories = [];
    }
    // 所持アクセサリー種別を解放済みに同期（旧セーブ移行）
    if (typeof ensureAccountUnlocksShape === 'function') ensureAccountUnlocksShape();
    if (typeof accountUnlocks !== 'undefined' && accountUnlocks) {
        (accessories || []).forEach(a => {
            const d = typeof getAccessoryDef === 'function' ? getAccessoryDef(a.defId) : null;
            const canon = d ? d.id : a.defId;
            if (canon && accountUnlocks.accessories.indexOf(canon) < 0) {
                accountUnlocks.accessories.push(canon);
            }
        });
    }
    // P8.6.2: 存在しないIDの解除 + 同一アクセサリーの重複装備を解消（先に見つけたキャラ優先）
    const accUsed = {};
    yardChars.concat(enemyChars).forEach(ch => {
        if (ch.accessoryId === undefined) ch.accessoryId = null;
        if (ch.accessoryId && !accessories.some(a => a.id === ch.accessoryId)) ch.accessoryId = null;
        if (ch.accessoryId) {
            if (accUsed[ch.accessoryId]) ch.accessoryId = null;
            else accUsed[ch.accessoryId] = true;
        }
    });


    totalEarnedSs = (typeof data.totalEarnedSs === 'number' && data.totalEarnedSs >= 0) ? Math.floor(data.totalEarnedSs) : 0;
    // P8.3 リソース（未保存データは初期値）
    if (typeof data.resource === 'number' && data.resource >= 0) {
        gameResource = Math.floor(data.resource);
    } else {
        gameResource = (typeof PROVISIONAL_RESOURCE_INIT !== 'undefined') ? PROVISIONAL_RESOURCE_INIT : 0;
    }

    // P8.3 パーティセット
    if (typeof ensurePartySets === 'function') ensurePartySets();
    if (Array.isArray(data.partySets) && data.partySets.length) {
        partySets = makeEmptyPartySets();
        data.partySets.forEach((s, i) => {
            if (i >= partySetCount()) return;
            partySets[i].name = (s && s.name) ? String(s.name).slice(0, 20) : partySets[i].name;
            const ids = (s && Array.isArray(s.partyIds)) ? s.partyIds.filter(id => yard.some(c => c.id === id)) : [];
            partySets[i].partyIds = ids.slice(0, MAX_PARTY);
        });
        activePartySetIndex = (typeof data.activePartySetIndex === 'number') ? data.activePartySetIndex : 0;
        if (activePartySetIndex < 0 || activePartySetIndex >= partySetCount()) activePartySetIndex = 0;
        // アクティブセットを優先。空なら従来 partyIds をセット0へ
        const activeIds = partySets[activePartySetIndex].partyIds.filter(id => yard.some(c => c.id === id));
        if (!activeIds.length) partySets[activePartySetIndex].partyIds = pids.slice();
        yardChars = yard;   // dedupe がヤードを参照する
        dedupePartySets();  // 同一キャラの重複所属を解消（アクティブ優先）
        partyIds = partySets[activePartySetIndex].partyIds.slice();   // 空のパーティもそのまま（遠征はできない）
    } else {
        partySets = makeEmptyPartySets();
        partySets[0].partyIds = pids.slice();
        activePartySetIndex = 0;
        partyIds = pids.slice();
    }
    partyChars = getPartyChars();

    // P8.4 募集候補の復元（旧セーブには無い → 未募集）
    recruitPools = { free: null, paid: null };
    if (data.recruitPools && typeof restoreCandidates === 'function') {
        recruitPools.free = restoreCandidates(data.recruitPools.free);
        recruitPools.paid = restoreCandidates(data.recruitPools.paid);
    }

    ruleData = {};
    const srcRules = data.ruleData || {};
    yardChars.concat(enemyChars).forEach(ch => {
        const r = srcRules[ch.id];
        if (Array.isArray(r) && r.length === MAX_RULES) {
            ruleData[ch.id] = r.map(row => ({
                active: !!row.active,
                cond: row.cond | 0,
                tgt: row.tgt | 0,
                skill: row.skill | 0
            }));
        } else {
            ruleData[ch.id] = ch.isPlayer === false ? emptyRules() : defaultPlayerRules();
        }
    });

    syncMeta();
    if (typeof currentChar !== 'undefined') {
        const still = yardChars.find(c => c.id === currentChar) || enemyChars.find(c => c.id === currentChar);
        if (!still) currentChar = partyIds[0] || (yardChars[0] && yardChars[0].id) || null;
    }
    let when = '';
    try { if (data.savedAt) when = new Date(data.savedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { when = ''; }
    updateStorageStatus(true, when ? ('最終保存: ' + when) : '読込完了');
    return true;
}

function clearStorage() {
    if (!confirm('保存データを削除して初期編成に戻しますか？')) return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    initDefaultRoster();
    partyChars = getPartyChars();
    syncMeta();
    currentChar = partyIds[0];
    activeGroup = 'player';
    if (typeof renderAll === 'function') renderAll();
    updateStorageStatus(false, '初期化しました');
    markCloudDirty();
}

function exportSaveJSON() {
    const text = JSON.stringify(serializeState(), null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gambit_save.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importSaveJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            if (loadFromStorage()) {
                markCloudDirty();
                if (typeof renderAll === 'function') renderAll();
                alert('インポートしました');
            } else {
                alert('インポートに失敗しました（形式を確認してください）');
            }
        } catch (e) {
            alert('JSONの読み込みに失敗しました');
        }
    };
    reader.readAsText(file);
}

function updateStorageStatus(ok, detail) {
    const el = document.getElementById('storage-status');
    if (!el) return;
    if (detail) {
        el.textContent = detail;
    } else if (ok) {
        el.textContent = '保存済み ' + new Date().toLocaleTimeString();
    } else {
        el.textContent = '未保存';
    }
}

/** 状態変更後に呼ぶ */
function persist() {
    if (typeof serverMode === 'function' && serverMode()) return;
    saveToStorage();
    markCloudDirty();
}

/** クラウド未送信フラグ（Phase 3a）。cloud.js が無い画面（character.html）でも立てる */
function markCloudDirty() {
    try {
        const m = JSON.parse(localStorage.getItem('gambit_cloud_meta_v1') || '{}') || {};
        m.dirty = true;
        localStorage.setItem('gambit_cloud_meta_v1', JSON.stringify(m));
    } catch (e) { /* ignore */ }
    if (typeof cloudOnPersist === 'function') cloudOnPersist();
}
