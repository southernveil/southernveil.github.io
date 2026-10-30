/**
 * expedition.js — 遠征ループ (P8.5 Phase1)
 * 戦闘 → 事後回復 → 撤退プロトコル判定 を 3〜5 連戦ぶん繰り返す。DOM 非依存。
 *
 * 仕様の解釈（要確認の暫定）
 *  - HP・戦闘不能・スキル使用回数は連戦中ずっと持ち越し。状態異常/バフは戦闘ごとにリセット
 *  - 事後回復: 回復系スキルを使用回数を消費して自動使用（リザレクション→回復）。HP が POST_HEAL_THRESHOLD 未満の味方がいなくなるまで
 *  - 撤退プロトコルは「事後回復の後」に判定。満たせば無事帰還、満たさなければ次戦へ
 *  - 戦闘に勝てなければ全滅。ただし 15R 時間切れの判定負けは「時間切れ撤退」（生存して帰還・その戦闘の報酬なし）
 *  - ノーマルは全滅すると獲得済みSSが半分（P9.23.0）。チャレンジは全滅で獲得物+入場料を遺骸として全ロスト
 */
function htmlToText(h) {
    return String(h).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** 出撃タブと同じ Markdown 表（構造化バトルログ） */
function formatStructuredMd(structured) {
    if (!structured || !structured.length) return '(構造化ログなし)\n';
    let md = '### Battle Log\n```\n| Rnd | Turn | Actor | Target | Action | Dice | Dmg/Heal | Status | Trigger |\n| --- | ---- | ----- | ------ | ------ | ---- | -------- | ------ | ------- |\n';
    structured.forEach(l => {
        md += `| ${l.round} | ${l.turn} | ${l.actor} | ${l.target} | ${l.action} | ${l.dice} | ${l.val} | ${l.status} | ${l.trigger} |\n`;
    });
    return md + '```\n';
}

function expRandInt(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** 敵テンプレ → ルール配列（conditions/targets/スキル名 → インデックス）。データ不整合は例外 */
function buildEnemySkillList(tplId, classId, level) {
    const sks = skillsForClass(classId, level, { ignoreUnlock: true });
    const tpl = ENEMY_TEMPLATES[tplId];
    if (tpl && Array.isArray(tpl.extraSkills)) {
        tpl.extraSkills.forEach(key => {
            const def = SKILL_DEFS[key];
            if (!def || !def.name) return;
            if (sks.some(x => x.name === def.name)) return;
            sks.push(Object.assign({ id: key, unlockLevel: 1, locked: false }, def));
        });
    }
    return sks;
}

function buildEnemyRules(tplId, classId, level) {
    const tpl = ENEMY_TEMPLATES[tplId];
    const sks = buildEnemySkillList(tplId, classId, level);
    const rules = emptyRules();
    if (!tpl || !Array.isArray(tpl.rules)) return rules;
    tpl.rules.forEach((r, i) => {
        if (i >= MAX_RULES) return;
        const c = conditions.indexOf(r[0]);
        const t = targets.indexOf(r[1]);
        const s = sks.findIndex(x => x.name === r[2]);
        if (c < 0 || t < 0 || s < 0) {
            // スキル未所持等はスキップ（敵専用AIで補完しない）
            return;
        }
        rules[i] = { active: true, cond: c, tgt: t, skill: s };
    });
    return rules;
}


/**
 * 敵テンプレから個体を生成（P9.1）
 * - fixedLevel / 固定ステータスのボスは成長しない
 * - 通常敵は base から level まで rollGrowth（味方と同じ）
 * - ENEMY_STAT_RATE や class 基礎値への差し替えはしない
 */
function createEnemyFromTemplate(tplId, level, name, envMult) {
    const tpl = ENEMY_TEMPLATES[tplId];
    if (!tpl) return null;
    envMult = envMult || 1;
    const id = genId('e');
    const classId = tpl.classId || 'warrior';
    const base = tpl.base || {};
    const growth = tpl.growth || {};

    let lv = Math.max(1, level | 0);
    if (tpl.fixedLevel) lv = tpl.fixedLevel;

    const ch = {
        id: id, charId: id, classId: classId, name: name || tpl.name,
        isPlayer: false, level: 1,
        classHistory: [classId],
        maxHp: base.hp || 50, hp: base.hp || 50,
        atk: base.atk || 5, def: base.def || 5,
        int: base.int || 5, mnd: base.mnd || 5,
        agi: base.agi || 5, dex: base.dex || 5,
        mp: 0, maxMp: 0,
        accessoryId: null,
        templateId: tplId,
        isBoss: !!tpl.isBoss
    };

    if (!tpl.fixedLevel) {
        // Lv1 → target: grow (lv-1) times with template growth rates
        for (let i = 1; i < lv; i++) {
            STAT_KEYS.forEach(k => {
                const rate = (growth[k] != null) ? growth[k] : 1.5;
                const gain = rollGrowth(rate);
                if (k === 'hp') {
                    ch.maxHp += gain;
                } else {
                    ch[k] = (ch[k] || 0) + gain;
                }
            });
            ch.level++;
        }
    } else {
        ch.level = lv;
    }

    // 環境倍率（チャレンジ）: HP/ATK/INT のみ
    if (envMult && envMult !== 1) {
        STAT_KEYS.forEach(k => {
            if (['hp', 'atk', 'int'].indexOf(k) < 0) return;
            if (k === 'hp') ch.maxHp = Math.max(1, Math.floor(ch.maxHp * envMult));
            else ch[k] = Math.max(1, Math.floor(ch[k] * envMult));
        });
    }
    ch.hp = ch.maxHp;
    ch.rules = buildEnemyRules(tplId, classId, ch.level);
    return ch;
}

/** そのステージの 1 戦ぶんの敵グループを生成 */
function buildEnemyGroup(dungeon, stage, isBoss, envMult, mode) {
    const lvRange = (typeof stageLvRange === 'function') ? stageLvRange(stage, mode) : stage.lv;
    const sizeRange = (typeof stageSizeRange === 'function') ? stageSizeRange(stage, mode) : stage.size;
    let ids;
    if (isBoss) {
        if (mode === 'challenge' && Array.isArray(stage.challengeBoss) && stage.challengeBoss.length) {
            ids = stage.challengeBoss.slice();
        } else if (stage.boss) {
            ids = stage.boss.slice();
        } else {
            ids = [];
        }
    } else {
        const pool = (mode === 'challenge' && Array.isArray(stage.challengePool) && stage.challengePool.length)
            ? stage.challengePool
            : dungeon.pool;
        const n = expRandInt(sizeRange[0], sizeRange[1]);
        if (mode === 'challenge') {
            // チャレンジ雑魚はプールから重複なしで抽選
            const shuffled = pool.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
            }
            ids = shuffled.slice(0, Math.min(n, shuffled.length));
            // プール不足時のみ重複を許容して埋める
            while (ids.length < n) {
                ids.push(pool[Math.floor(Math.random() * pool.length)]);
            }
        } else {
            ids = Array.from({ length: n },
                () => pool[Math.floor(Math.random() * pool.length)]);
        }
    }
    const total = {};
    ids.forEach(id => { total[id] = (total[id] || 0) + 1; });
    const seen = {};
    return ids.map(id => {
        const tpl = ENEMY_TEMPLATES[id];
        if (!tpl) return null;
        seen[id] = (seen[id] || 0) + 1;
        const suffix = total[id] > 1 ? String.fromCharCode(64 + seen[id]) : '';
        let lv;
        if (tpl.fixedLevel) {
            lv = tpl.fixedLevel;
        } else if (isBoss && stage.boss && id === stage.boss[0] && !tpl.fixedLevel) {
            lv = lvRange[1]; // ボス枠は帯の上限
        } else {
            lv = expRandInt(lvRange[0], lvRange[1]);
        }
        return createEnemyFromTemplate(id, lv, tpl.name + suffix, envMult);
    }).filter(Boolean);
}


/* ---------- 撤退プロトコル ---------- */
function remainingHealUses(carry, partyChars) {
    let n = 0;
    partyChars.forEach(c => {
        const st = carry[c.id];
        if (!st || st.down) return;
        HEAL_SKILL_NAMES.forEach(nm => {
            const u = st.skillUses[nm];
            if (typeof u === 'number' && isFinite(u)) n += u;
        });
    });
    return n;
}

function checkRetreatProtocol(protocol, carry, partyChars) {
    const p = protocol || { type: 'none', value: 0 };
    const def = RETREAT_PROTOCOLS[p.type] || RETREAT_PROTOCOLS.none;
    const v = Number(p.value);
    const downN = partyChars.filter(c => carry[c.id].down).length;
    const heals = remainingHealUses(carry, partyChars);
    const living = partyChars.filter(c => !carry[c.id].down);
    const avg = partyChars.length
        ? Math.round(100 * partyChars.reduce((s, c) => s + (carry[c.id].down ? 0 : carry[c.id].hp / c.maxHp), 0) / partyChars.length)
        : 0;
    if (def.id === 'down') return { met: downN >= v, detail: `戦闘不能 ${downN}名（条件: ${v}名以上）` };
    if (def.id === 'healLeft') return { met: heals <= v, detail: `残りヒール使用回数 ${heals}回（条件: ${v}回以下）` };
    if (def.id === 'avgHp') return { met: avg <= v, detail: `パーティ平均HP ${avg}%（条件: ${v}%以下）` };
    return { met: false, detail: `撤退プロトコルなし（生存${living.length}名・残りヒール${heals}回・平均HP${avg}%）` };
}

/* ---------- 戦闘後の自動回復 ---------- */
function postBattleRecovery(carry, partyChars, env, L) {
    const out = { heals: 0, revives: 0 };
    if (env.noPostHeal) {
        L('[事後回復] 環境効果のため回復不可');
        return out;
    }
    const alive = () => partyChars.filter(c => !carry[c.id].down);
    const usesLeft = (id, nm) => { const u = carry[id].skillUses[nm]; return u === undefined ? 0 : u; };
    const findHealer = nm => alive().find(c => usesLeft(c.id, nm) > 0);
    const consume = (id, nm) => {
        const u = carry[id].skillUses[nm];
        if (typeof u === 'number' && isFinite(u) && u > 0) carry[id].skillUses[nm] = u - 1;
    };
    const left = (id, nm) => { const u = usesLeft(id, nm); return isFinite(u) ? u : '∞'; };

    // 1) 蘇生
    partyChars.filter(c => carry[c.id].down).forEach(t => {
        const h = findHealer('リザレクション');
        if (!h) return;
        consume(h.id, 'リザレクション');
        carry[t.id].down = false;
        carry[t.id].hp = Math.max(1, Math.floor(t.maxHp * 0.5));
        out.revives++;
        L(`[事後回復] ${h.name} ➡ ${t.name} : 『リザレクション』 (HP${carry[t.id].hp}で復活 / 残${left(h.id, 'リザレクション')})`);
    });

    // 2) 回復（しきい値未満の味方がいなくなる or 回復手段が尽きるまで）
    for (let guard = 0; guard < 60; guard++) {
        const lows = alive().filter(c => carry[c.id].hp / c.maxHp < POST_HEAL_THRESHOLD);
        if (!lows.length) break;
        lows.sort((a, b) => carry[a.id].hp / a.maxHp - carry[b.id].hp / b.maxHp);
        const t = lows[0];
        const ratio = carry[t.id].hp / t.maxHp;

        if (lows.length >= 2) {
            const h = findHealer('大地の恵み');
            if (h) {
                consume(h.id, '大地の恵み');
                const before = alive().map(c => `${c.name}${carry[c.id].hp}`).join(',');
                alive().forEach(c => {
                    carry[c.id].hp = Math.min(c.maxHp, carry[c.id].hp + Math.max(1, Math.floor(c.maxHp * 0.45)));
                });
                out.heals++;
                L(`[事後回復] ${h.name} ➡ 範囲 : 『大地の恵み』 (${before} → ${alive().map(c => c.name + carry[c.id].hp).join(',')} / 残${left(h.id, '大地の恵み')})`);
                continue;
            }
        }
        // 重傷(<=50%)ならグレートヒール優先、通常はヒール優先
        const order = ratio <= 0.5 ? ['グレートヒール', 'ヒール'] : ['ヒール', 'グレートヒール'];
        let used = false;
        for (const nm of order) {
            const h = findHealer(nm);
            if (!h) continue;
            let pct = (nm === 'グレートヒール') ? 0.70 : 0.45;
            if (nm === 'ヒール') {
                const ych = findCharById(h.id) || h;
                const mods = getSkillCombatParams(ych, 'ヒール');
                if (mods.healPct != null) pct = mods.healPct;
            }
            const heal = Math.max(1, Math.floor(t.maxHp * pct));
            const before = carry[t.id].hp;
            carry[t.id].hp = Math.min(t.maxHp, before + heal);
            consume(h.id, nm);
            out.heals++;
            L(`[事後回復] ${h.name} ➡ ${t.name} : 『${nm}』 (HP${before}→${carry[t.id].hp}/${t.maxHp} / 残${left(h.id, nm)})`);
            used = true;
            break;
        }
        if (!used) {
            L(`[事後回復] 回復手段が尽きた（${t.name} HP${carry[t.id].hp}/${t.maxHp}）`);
            break;
        }
    }
    if (!out.heals && !out.revives) L('[事後回復] 回復の必要なし');
    return out;
}

/* ---------- 遠征本体 ---------- */
const EXP_STATUS_LABELS = {
    cleared:   '踏破・無事帰還',
    retreated: '撤退プロトコル発動・無事帰還',
    timeout:   '時間切れ撤退（15R）',
    wiped:     '全滅'
};

/**
 * opts: { dungeonId, stageId, mode:'normal'|'challenge', protocol:{type,value},
 *         applyResources:true(既定), debug:false, battles:null(固定連戦数。テスト用) }
 * 戻り: { ok:false, error } or 結果オブジェクト（status, battles[], loot, deposit, corpse, text ...）
 */
function runExpedition(opts) {
    opts = opts || {};
    const dungeon = getDungeon(opts.dungeonId);
    const stage = getStage(opts.dungeonId, opts.stageId);
    const mode = MODE_DEFS[opts.mode] ? opts.mode : 'normal';
    if (!dungeon || !stage) return { ok: false, error: 'ダンジョンまたはステージが不正です' };
    const modeDef = MODE_DEFS[mode];
    const applyRes = opts.applyResources !== false;
    let protocol = opts.protocol || { type: 'none', value: 0 };
    // 非公開コンテンツは出撃不可（開発環境を除く）
    if (typeof isContentPublic === 'function' && !isContentPublic(dungeon.id, mode)) {
        return { ok: false, error: 'このコンテンツは現在公開されていません' };
    }
    // チャレンジは撤退不可（撤退しないで固定）
    if (mode === 'challenge') protocol = { type: 'none', value: 0 };
    if (!RETREAT_PROTOCOLS[protocol.type]) return { ok: false, error: '撤退プロトコルが不正です' };
    // P9.23.0 ノーマルの解放条件（物語の進み具合・前のエリアの踏破）。チャレンジもノーマルで行けるステージが前提
    if (typeof isNormalStageUnlocked === 'function' && !isNormalStageUnlocked(dungeon.id, stage.id)) {
        return { ok: false, error: 'まだ解放されていません（ギルドの依頼を進めてください）' };
    }
    // チャレンジ解放条件
    if (mode === 'challenge' && stage.challengeUnlock && typeof isChallengeStageUnlocked === 'function') {
        if (!isChallengeStageUnlocked(dungeon.id, stage.id)) {
            return { ok: false, error: 'チャレンジ未解放（前提ステージを踏破してください）' };
        }
    }

    if (typeof syncMeta === 'function') syncMeta();
    const party = getPartyChars();
    if (!party.length) return { ok: false, error: 'パーティが空です' };

    const deposit = modeDef.needDeposit ? stage.deposit : 0;
    if (applyRes && deposit > 0) {
        if (!canSpendResource(deposit)) return { ok: false, error: `入場料が足りません（必要: ${deposit}）` };
        spendResource(deposit);
    }

    const env = mergeEnv(dungeon, mode);
    const nBattles = opts.battles || (stage.battles > 0 ? stage.battles
        : expRandInt(EXPEDITION_BATTLES[0], EXPEDITION_BATTLES[1]));
    const lines = [];                       // 遠征全体のテキストログ（バトル詳細を含まない）
    const textAll = [];                     // バトル詳細まで含む全文
    const L = (t, cls) => { lines.push({ t, cls: cls || '' }); textAll.push(t); };

    const result = {
        ok: true, dungeonId: dungeon.id, stageId: stage.id, mode, protocol, env,
        dungeonName: dungeon.name, stageName: stage.name, nBattlesPlanned: nBattles,
        battles: [], status: null, statusLabel: '', loot: 0, drops: [], deposit, depositRefunded: 0,
        corpse: null, healUses: 0, partyNames: party.map(c => c.name), partyIds: party.map(c => c.id), battlesWon: 0, lootGross: 0, lines, text: ''
    };

    const savedEnemies = enemyChars;
    const savedSL = structuredLog, savedDP = debugPlainLines;
    const tempRuleIds = [];
    // 敵を差し替える間 rebuildCharMetaAndSkills が既存敵のルールを掃除してしまうので退避する
    const savedEnemyRules = {};
    savedEnemies.forEach(e => { savedEnemyRules[e.id] = ruleData[e.id]; });
    let wiped = false, safe = false;

    try {
        L(`【遠征開始】${dungeon.name} ${stage.name}  /  ${modeDef.name}  /  ${nBattles}連戦予定`, 'head');
        L(`パーティ: ${party.map(c => `${c.name}(Lv${c.level || 1})`).join('、')}`);
        L(`撤退プロトコル: ${protocol.type === 'none' ? RETREAT_PROTOCOLS.none.name : RETREAT_PROTOCOLS[protocol.type].name.replace('N', protocol.value)}`);
        if (env.labels.length) L(`環境: ${env.labels.join(' / ')}`);
        if (deposit > 0) L(`入場料 ${deposit} を預託（生還で返却・全滅で遺骸と共にロスト）`);

        // 持ち越し状態の初期化（syncMeta 済みで skills[] が party ぶん揃っている）
        const carry = {};
        party.forEach(c => { carry[c.id] = { hp: c.maxHp, down: false, skillUses: initSkillUses(c.id) }; });

        for (let b = 1; b <= nBattles; b++) {
            const isBoss = !!stage.boss && b === nBattles;
            const enemies = buildEnemyGroup(dungeon, stage, isBoss, env.enemyMult, mode);
            enemyChars = enemies;
            enemies.forEach(e => { ruleData[e.id] = e.rules; tempRuleIds.push(e.id); });
            syncMeta();

            L(`── 第${b}戦${isBoss ? '（ボス）' : ''} ──  敵: ${enemies.map(e => `${e.name}(Lv${e.level})`).join('、')}`, 'battle');
            const bl = { index: b, isBoss, enemies: enemies.map(e => `${e.name}(Lv${e.level})`), logHtml: [], logText: [], debugText: [] };
            structuredLog = [];
            debugPlainLines = [];
            const res = runBattleCore({
                reward: false,
                carry,
                env: env.slipPct > 0 ? { slipPct: env.slipPct, envName: env.labels[0] || '環境ダメージ' } : null,
                bossFailOnTimeout: !!isBoss || mode === 'challenge',
                addLog: h => { bl.logHtml.push(h); bl.logText.push(htmlToText(h)); },
                addDebug: h => { if (opts.debug) bl.debugText.push(htmlToText(h)); },
                addDebugRaw: h => { if (opts.debug) bl.debugText.push(htmlToText(h)); }
            });
            bl.structured = structuredLog;
            bl.playerWin = res.playerWin;
            bl.reason = res.reason;
            bl.rounds = res.rounds;
            result.battles.push(bl);

            // 持ち越し反映
            party.forEach(c => {
                const rt = res.runtime[c.id];
                carry[c.id].hp = rt.hp;
                carry[c.id].down = rt.down;
                carry[c.id].skillUses = Object.assign({}, rt.skillUses);
            });

            textAll.push(`--- 第${b}戦 戦闘ログ（${bl.rounds}R / ${bl.reason}） ---`);
            textAll.push(formatStructuredMd(bl.structured));
            // 行ログも追記（補足）
            if (bl.logText && bl.logText.length) {
                textAll.push('--- 行ログ ---');
                bl.logText.forEach(t => textAll.push(t));
            }

            if (!res.playerWin) {
                const isTimeout = res.reason.indexOf('15R') >= 0 || res.reason.indexOf('ボス未撃破') >= 0;
                if (mode === 'challenge') {
                    // チャレンジ: 時間切れも全滅扱い（撤退なし）
                    if (isTimeout) {
                        L(`第${b}戦: 力尽きた……時間切れにより全滅した（${res.reason}）`, 'bad');
                    } else {
                        L(`第${b}戦: 敗北（${res.reason}）`, 'bad');
                    }
                    result.status = 'wiped';
                    wiped = true;
                } else if (isTimeout) {
                    const bossNote = isBoss ? 'ボスを討伐できず敗走した' : '決着つかず撤退した';
                    L(`第${b}戦: ${bossNote}（${res.reason}）`, 'warn');
                    result.status = 'timeout';
                    safe = true;
                } else {
                    L(`第${b}戦: 敗北（${res.reason}）`, 'bad');
                    result.status = 'wiped';
                    wiped = true;
                }
                break;
            }

            // エリア到達（戦闘勝利時点で記録 → 耐性アクセ解放）
            if (typeof markStageReached === 'function') {
                markStageReached(dungeon.id, stage.id);
            }

            // P9: 撃破した敵 × ssPerEnemy（チャレンジは challengeSsPerEnemy、rewardMult は使わない）
            const killed = enemies.filter(e => res.runtime[e.id] && res.runtime[e.id].down).length;
            const ssEach = (mode === 'challenge' && stage.challengeSsPerEnemy != null)
                ? stage.challengeSsPerEnemy
                : (stage.ssPerEnemy || 0);
            const mult = (mode === 'challenge') ? 1.0 : (modeDef.rewardMult || 1.0);
            const gain = Math.max(0, Math.round(killed * ssEach * mult));
            result.loot += gain;
            result.battlesWon = b;
            L(`第${b}戦: 勝利（${res.rounds}R / ${res.reason}）  撃破${killed} × ${ssEach}SS → +${gain}SS（累計 ${result.loot}）`, 'good');

            if (isBoss) {
                const drops = (typeof rollBossDrops === 'function') ? rollBossDrops(enemies) : [];
                result.drops = (result.drops || []).concat(drops);
                drops.forEach(d => L(`[ドロップ] ${d}`, 'good'));
            }

            const rec = postBattleRecovery(carry, party, env, t => L(t, 'rec'));
            result.healUses += rec.heals + rec.revives;
            L('[状態] ' + party.map(c => carry[c.id].down ? `${c.name}:戦闘不能` : `${c.name}:${carry[c.id].hp}/${c.maxHp}`).join(' '), 'state');
            bl.after = party.map(c => ({ name: c.name, hp: carry[c.id].hp, maxHp: c.maxHp, down: carry[c.id].down }));

            if (b === nBattles) {
                L('全戦闘を突破した', 'good');
                result.status = 'cleared';
                safe = true;
                break;
            }
            const pr = checkRetreatProtocol(protocol, carry, party);
            if (pr.met) {
                L(`[撤退判定] ${pr.detail} → 条件成立。無事帰還する`, 'good');
                result.status = 'retreated';
                safe = true;
                break;
            }
            L(`[撤退判定] ${pr.detail} → 条件未成立。次戦へ突入`, 'proto');
        }

        
        // P9 寿命消費
        // チャレンジ失敗: 全員 −2（戦闘不能追加分は二重にしない）
        // それ以外: 探索 −1 + チャレンジ戦闘不能者 −1
        const deathIds = [];
        let retiredNow = [];
        if (mode === 'challenge' && wiped) {
            retiredNow = (typeof applyExpeditionLifespanFlat === 'function')
                ? applyExpeditionLifespanFlat(party.map(c => c.id), 2)
                : (typeof applyExpeditionLifespan === 'function' ? applyExpeditionLifespan(party.map(c => c.id), []) : []);
            L('チャレンジ失敗によりパーティ全員の寿命が −2', 'bad');
        } else {
            if (mode === 'challenge') {
                party.forEach(c => {
                    if (carry[c.id] && carry[c.id].down) deathIds.push(c.id);
                });
            }
            retiredNow = (typeof applyExpeditionLifespan === 'function')
                ? applyExpeditionLifespan(party.map(c => c.id), deathIds)
                : [];
        }
        if (retiredNow.length) {
            L('【引退】' + retiredNow.map(c => c.name).join('、') + ' は寿命を使い切り引退した（ヤードの「引退」欄からSSを抜き出せます）', 'bad');
        }
        result.retired = retiredNow.map(c => c.name);
        result.lifespanDeathIds = deathIds;

        // ---- 精算 ----
        result.statusLabel = EXP_STATUS_LABELS[result.status] || '';
        if (safe) {
            result.depositRefunded = deposit;
            L(`【帰還】${result.statusLabel}  獲得 ${result.loot} SS` + (deposit ? ` + 入場料 ${deposit} 返却` : ''), 'head');
            if (result.status === 'cleared' && typeof markStageCleared === 'function') {
                markStageCleared(dungeon.id, stage.id, mode);
            }
            // 踏破報酬: アクセサリー抽選（実際に反映する出撃のみ）
            if (applyRes && result.status === 'cleared' && typeof rollClearDrops === 'function') {
                const ad = rollClearDrops(dungeon.id, mode);
                result.drops = (result.drops || []).concat(ad);
                result.soldSs = (result.soldSs | 0) + (ad.soldSs | 0);
                ad.forEach(d => L(`【踏破報酬】${d}`, 'good'));
            }
            // チャレンジ踏破時: 失敗プール受取（applyResources 時のみ副作用）
            if (applyRes && mode === 'challenge' && result.status === 'cleared' && typeof claimFailurePool === 'function') {
                const claim = claimFailurePool(dungeon.id, stage.id, true);
                result.poolClaimed = claim.amount || 0;
                if (claim.ok && claim.amount > 0) {
                    const capNote = claim.capped ? '・上限により減額' : '';
                    L(`【失敗プール】受取 ${claim.amount} SS（プール残 ${claim.remaining}、本日残り ${claim.dailyLeft}${capNote}）`, 'good');
                } else if (claim.reason) {
                    L(`【失敗プール】受取なし（${claim.reason}）`, 'warn');
                }
            }
        } else if (wiped) {
            if (modeDef.needDeposit || mode === 'challenge') {
                result.corpse = {
                    id: genId('corpse'), dungeonId: dungeon.id, stageId: stage.id, mode,
                    lootLost: result.loot, depositLost: deposit, battleIndex: result.battles.length,
                    members: party.map(c => ({ name: c.name, classId: c.classId, level: c.level || 1, rarity: c.rarity || 'normal' })),
                    at: Date.now()
                };
                L(`【全滅】遺骸が現地に残置された。獲得 ${result.loot} SS と入場料 ${deposit} をロスト`, 'bad');
                if (applyRes && mode === 'challenge' && typeof addToFailurePool === 'function') {
                    const poolAdd = addToFailurePool(dungeon.id, stage.id, result.loot + deposit);
                    if (poolAdd.added > 0) {
                        L(`【失敗プール】${poolAdd.added} SS がフロアプールへ（系統回収 ${poolAdd.systemCut}） 合計 ${poolAdd.total}`, 'warn');
                    }
                }
                result.loot0 = result.loot;
                result.loot = 0;
            } else {
                // P9.23.0 ノーマルの全滅：それまでに稼いだ SS は半分（端数切り捨て）。失った分は消える
                const kept = Math.floor(result.loot / 2);
                result.halfLost = result.loot - kept;
                L(`【全滅】獲得済みの ${result.loot} SS は半分になった（${kept} SS を持ち帰る・${result.halfLost} SS を失った）`, 'bad');
                result.loot0 = result.loot;
                result.loot = kept;
            }
        }
    } finally {
        enemyChars = savedEnemies;
        tempRuleIds.forEach(id => { delete ruleData[id]; });
        Object.keys(savedEnemyRules).forEach(id => { if (savedEnemyRules[id]) ruleData[id] = savedEnemyRules[id]; });
        structuredLog = savedSL;
        debugPlainLines = savedDP;
        if (typeof syncMeta === 'function') syncMeta();
    }

    result.lootGross = result.loot0 != null ? result.loot0 : result.loot;
    if (applyRes) {
        const credit = result.loot + result.depositRefunded;
        if (credit > 0) addResource(credit);
        if (typeof persist === 'function') persist();
    }
    result.text = textAll.join('\n');
    return result;
}

/** 開発用: データ整合性チェック（全テンプレのルール変換・全ステージの敵生成）。問題があれば文字列配列で返す */
function validateExpeditionData() {
    const errs = [];
    Object.keys(ENEMY_TEMPLATES).forEach(id => {
        try {
            const t = ENEMY_TEMPLATES[id];
            if (!CLASS_DEFS[t.classId]) throw new Error('classId不明 ' + t.classId);
            const rules = buildEnemyRules(id, t.classId, 100);
            const sks = buildEnemySkillList(id, t.classId, 100);
            if (Array.isArray(t.rules)) {
                t.rules.forEach((r, i) => {
                    if (conditions.indexOf(r[0]) < 0) errs.push(`${id} rule${i}: 条件不明 ${r[0]}`);
                    if (targets.indexOf(r[1]) < 0) errs.push(`${id} rule${i}: 対象不明 ${r[1]}`);
                    if (!sks.some(x => x.name === r[2])) errs.push(`${id} rule${i}: スキル不明 ${r[2]}`);
                });
            }
        } catch (e) { errs.push(String(e.message || e)); }
    });
    Object.keys(DUNGEON_DEFS).forEach(did => {
        const d = DUNGEON_DEFS[did];
        d.pool.forEach(p => { if (!ENEMY_TEMPLATES[p]) errs.push(`${did}: poolに未定義の敵 ${p}`); });
        d.stages.forEach(s => {
            (s.boss || []).forEach(p => { if (!ENEMY_TEMPLATES[p]) errs.push(`${did}/${s.id}: bossに未定義の敵 ${p}`); });
            (s.challengeBoss || []).forEach(p => { if (!ENEMY_TEMPLATES[p]) errs.push(`${did}/${s.id}: challengeBossに未定義の敵 ${p}`); });
            (s.challengePool || []).forEach(p => { if (!ENEMY_TEMPLATES[p]) errs.push(`${did}/${s.id}: challengePoolに未定義の敵 ${p}`); });
            ['normal', 'challenge'].forEach(mode => {
                try {
                    buildEnemyGroup(d, s, false, 1, mode);
                    const hasBoss = mode === 'challenge'
                        ? (Array.isArray(s.challengeBoss) && s.challengeBoss.length) || (s.boss && s.boss.length)
                        : (s.boss && s.boss.length);
                    if (hasBoss) buildEnemyGroup(d, s, true, 1, mode);
                } catch (e) { errs.push(`${did}/${s.id}/${mode}: ` + (e.message || e)); }
            });
        });
    });
    return errs;
}
