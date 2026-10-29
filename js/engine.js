/**
 * engine.js — 戦闘エンジン P7-8
 * 使用回数制・戦士リワーク・15ラウンド制
 * 原則は P7-5 / P7-7.2 を維持
 */
function isEnhanced(runtime, id) {
    const e = runtime[id].effects;
    return e.atkUp > 0 || e.chargeCounter > 0 || e.guardianBarrier || e.defUp > 0;
}

function getUnitStat(unit, key) {
    if (!unit) return 0;
    const v = unit[key];
    return (typeof v === 'number') ? v : 0;
}

// 戻り値: { dmg, formula }
// スキルの atkStat / defStat を参照（未指定時は atk / def）
function calculateDamage(atkUnit, defUnit, skill, dice, runtime, ratioOverride) {
    const atkKey = (skill && skill.atkStat) ? skill.atkStat : 'atk';
    const defKey = (skill && skill.defStat) ? skill.defStat : 'def';
    // ハイブリッド参照: ATK+INT/2 等
    let a = getUnitStat(atkUnit, atkKey);
    if (skill && skill.hybrid) {
        a = a + Math.floor(getUnitStat(atkUnit, skill.hybrid) / 2);
    }
    let buffNote = '';
    const re = runtime[atkUnit.id] && runtime[atkUnit.id].effects;
    if (atkKey === 'atk' && re && re.atkUp > 0) {
        a = Math.floor(a * 1.3);
        buffNote = '(ATK↑×1.3)';
    } else if (atkKey === 'int' && re && re.intUp > 0) {
        a = Math.floor(a * 1.3);
        buffNote = '(INT↑×1.3)';
    } else if (atkKey === 'dex' && re && re.dexUp > 0) {
        a = Math.floor(a * 1.3);
        buffNote = '(DEX↑×1.3)';
    }
    if (re && re.berserkAtk > 0 && atkKey === 'atk') {
        a = Math.floor(a * 1.3);
        buffNote += '(狂×1.3)';
    }
    let d = getUnitStat(defUnit, defKey);
    let defNote = '';
    const de = runtime[defUnit.id] && runtime[defUnit.id].effects;
    if (defKey === 'def' && de && de.defUp > 0) {
        d = Math.floor(d * 1.4);
        defNote = '(DEF↑×1.4)';
    }
    if (defKey === 'def' && de && de.defDown > 0) {
        d = Math.max(0, Math.floor(d * 0.7));
        defNote += '(DEF↓×0.7)';
    }
    // ガードアップ＋: MND参照時も軽減
    if (defKey === 'mnd' && de && de.mndDefUp > 0) {
        d = Math.floor(d * 1.4);
        defNote = '(MND↑×1.4)';
    }
    const ratio = ratioOverride !== undefined ? ratioOverride : skill.ratio;
    const base = Math.max(1, Math.floor(a * ratio) - d);
    const dm = diceMult(dice);
    const dmg = Math.max(1, Math.floor(base * dm));
    const aLabel = atkKey.toUpperCase();
    const dLabel = defKey.toUpperCase();
    const formula = `${aLabel}${a}${buffNote}×${ratio}−${dLabel}${d}${defNote}=${base} ×Dice${dice}(${dm})=${dmg}`;
    return { dmg, formula };
}

function checkSavingThrow(atk, def, resistBonus) {
    // resistBonus: アクセサリー耐性（DEFには加算しない）。基本式は維持。
    const resist = (typeof resistBonus === 'number') ? resistBonus : 0;
    const dc = 8 + Math.floor(atk.atk / 2);
    const dice = Math.floor(Math.random() * 20) + 1;
    const total = dice + Math.floor(def.def / 2) + resist;
    return { success: total >= dc, dc, total, dice, resist: resist };
}

function livingOnSide(isPlayer, runtime) {
    return Object.keys(charMeta).filter(id => charMeta[id].isPlayer === isPlayer && !runtime[id].down);
}

function resolveTarget(actor, tgtStr, runtime, opts) {
    // P9.19.4: excludeSelf のスキル（捕食など）は自分自身を対象にしない
    const noSelf = !!(opts && opts.excludeSelf);
    if (tgtStr === '自分自身') return noSelf ? null : actor.id;
    const living = (isPlayer) => livingOnSide(isPlayer, runtime).filter(id => !(noSelf && id === actor.id));

    // 味方: 戦闘不能（死亡ユニット）
    if (tgtStr === '味方: 戦闘不能' || (tgtStr.includes('戦闘不能') && tgtStr.startsWith('味方'))) {
        const pool = Object.keys(runtime).filter(id =>
            charMeta[id] && charMeta[id].isPlayer === actor.isPlayer && runtime[id].down
        );
        if (!pool.length) return null;
        pool.sort();
        return pool[0];
    }

    // 敵1体 / 味方1体：ランダム1体（戦術的優先なし）
    if (tgtStr === '敵1体') {
        const pool = living(!actor.isPlayer);
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (tgtStr === '味方1体') {
        const pool = living(actor.isPlayer);
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // 状態異常でない敵
    if (tgtStr === '状態異常でない敵') {
        let pool = living(!actor.isPlayer).filter(id =>
            !(runtime[id].effects.poison > 0 || runtime[id].effects.paralysis > 0 || runtime[id].effects.sleep > 0)
        );
        if (!pool.length) return null;
        pool = pool.slice().sort((a, b) => runtime[a].hp - runtime[b].hp);
        return pool[0] || null;
    }

    let pool = [];
    if (tgtStr.startsWith('味方:')) pool = living(actor.isPlayer);
    else if (tgtStr.startsWith('敵:')) pool = living(!actor.isPlayer);
    else return null;
    if (!pool.length) return null;
    if (tgtStr.includes('強化状態でない')) return pool.find(id => !isEnhanced(runtime, id)) || null;
    if (tgtStr.includes('強化状態')) return pool.find(id => isEnhanced(runtime, id)) || null;
    // 「状態異常でない」は上で処理済み。ここは「状態異常を持つ」側
    if (tgtStr.includes('状態異常')) {
        return pool.find(id => runtime[id].effects.poison > 0 || runtime[id].effects.paralysis > 0 || runtime[id].effects.sleep > 0) || null;
    }
    if (tgtStr.includes('毒状態')) return pool.find(id => runtime[id].effects.poison > 0) || null;
    if (tgtStr.includes('麻痺状態')) return pool.find(id => runtime[id].effects.paralysis > 0) || null;
    if (tgtStr.includes('睡眠状態')) return pool.find(id => runtime[id].effects.sleep > 0) || null;
    if (tgtStr.includes('HP最高')) {
        pool = pool.slice().sort((a, b) => runtime[b].hp - runtime[a].hp);
        return pool[0] || null;
    }
    pool = pool.slice().sort((a, b) => runtime[a].hp - runtime[b].hp);
    return pool[0] || null;
}

function checkCondition(condIdx, unit, runtime, round) {
    const name = (typeof conditions !== 'undefined' && conditions[condIdx]) ? conditions[condIdx] : '';
    const r = runtime[unit.id];
    const allyLiving = () => livingOnSide(unit.isPlayer, runtime);
    const enemyLiving = () => livingOnSide(!unit.isPlayer, runtime);
    const hasStatus = (id) => !!(runtime[id].effects.poison || runtime[id].effects.paralysis || runtime[id].effects.sleep);
    const selfStatus = () => hasStatus(unit.id);
    const allyHasStatus = () => Object.keys(charMeta).some(id =>
        charMeta[id].isPlayer === unit.isPlayer && !runtime[id].down && hasStatus(id));
    const allyNoStatus = () => allyLiving().every(id => !hasStatus(id));
    const allyDownExists = () => Object.keys(runtime).some(id =>
        charMeta[id] && charMeta[id].isPlayer === unit.isPlayer && runtime[id].down);
    const allyHpBelow = (pct) => Object.keys(charMeta).some(id =>
        charMeta[id].isPlayer === unit.isPlayer && id !== unit.id && !runtime[id].down &&
        runtime[id].hp <= charMeta[id].maxHp * pct);

    // 既存インデックス互換
    if (condIdx === 0 || name === '常に') return true;
    if (condIdx === 1 || name === '自身のHPが50%以下') return r.hp <= unit.maxHp * 0.5;
    if (condIdx === 2 || name === '味方のHPが50%以下') return allyHpBelow(0.5);
    if (condIdx === 3 || name === '味方が状態異常(毒・麻痺・睡眠)') return allyHasStatus();
    if (condIdx === 4 || name === '敵の数が2体以上') return enemyLiving().length >= 2;
    if (condIdx === 5 || name === '自身が毒状態ではない') return r.effects.poison === 0;
    if (condIdx === 6 || name === '味方のHPが80%以下') return allyHpBelow(0.8);
    if (condIdx === 7 || name === '味方のHPが30%以下') return allyHpBelow(0.3);
    if (condIdx === 8 || name === '強化状態の敵がいる') return enemyLiving().some(id => isEnhanced(runtime, id));
    if (condIdx === 9 || name === '強化状態の敵がいない') return !enemyLiving().some(id => isEnhanced(runtime, id));
    if (condIdx === 10 || name === '強化状態の味方がいる') return allyLiving().some(id => isEnhanced(runtime, id));
    if (condIdx === 11 || name === '強化状態の味方がいない') return !allyLiving().some(id => isEnhanced(runtime, id));

    // P9.3.6 追加条件
    if (name === '自身のHPが30%以下') return r.hp <= unit.maxHp * 0.3;
    if (name === '自身のHPが80%以下') return r.hp <= unit.maxHp * 0.8;
    if (name === '自身が状態異常') return selfStatus();
    if (name === '自身が状態異常ではない') return !selfStatus();
    if (name === '自身が強化状態') return isEnhanced(runtime, unit.id);
    if (name === '自身が強化状態でない') return !isEnhanced(runtime, unit.id);
    if (name === '味方が状態異常ではない') return allyNoStatus();
    if (name === '味方に戦闘不能がいる') return allyDownExists();
    if (name === '敵の数が1体のみ') return enemyLiving().length === 1;
    if (name === '敵の数が3体以上') return enemyLiving().length >= 3;
    if (name === 'ラウンド1（初手のみ）') return (round | 0) === 1;
    if (name === 'ラウンド5以降') return (round | 0) >= 5;
    if (name === 'ラウンド10以降') return (round | 0) >= 10;
    return true;
}

function initSkillUses(unitId) {
    const uses = {};
    const list = skills[unitId] || [];
    list.forEach(sk => {
        uses[sk.name] = (sk.uses === undefined || sk.uses < 0) ? Infinity : sk.uses;
    });
    return uses;
}

function remainingUses(runtime, unitId, skillName) {
    const u = runtime[unitId].skillUses[skillName];
    if (u === undefined) return Infinity;
    return u;
}

function consumeUse(runtime, unitId, skillName) {
    const u = runtime[unitId].skillUses[skillName];
    if (u === undefined || u === Infinity) return;
    if (u > 0) runtime[unitId].skillUses[skillName] = u - 1;
}

function revengeRatio(unit, runtime) {
    // P7-8.1: 0～30=1.0 / 31～60=1.6 / 61～90=2.4 / 91～99=5.0
    const maxHp = unit.maxHp;
    const cur = runtime[unit.id].hp;
    const lostPct = ((maxHp - cur) / maxHp) * 100;
    if (lostPct <= 30) return 1.0;
    if (lostPct <= 60) return 1.6;
    if (lostPct <= 90) return 2.4;
    return 5.0;
}

/** 1D20 双方。高い側の isPlayer が勝ち。同値再振 */
function diceWinnerIsPlayer() {
    let a, b;
    do {
        a = Math.floor(Math.random() * 20) + 1;
        b = Math.floor(Math.random() * 20) + 1;
    } while (a === b);
    return { playerWin: a > b, playerDice: a, enemyDice: b };
}

function applyDamageTo(defId, dmg, runtime, unit, addLog, addDebug) {
    const ef = runtime[defId].effects;
    if (ef.royalGuard > 0) {
        dmg = Math.max(0, Math.floor(dmg * 0.01));
    } else if (ef.chargeBarrier > 0) {
        dmg = Math.max(0, Math.floor(dmg * (1 - ef.chargeBarrier)));
    }
    runtime[defId].hp = Math.max(0, runtime[defId].hp - dmg);
    if (runtime[defId].hp <= 0 && !runtime[defId].down) {
        runtime[defId].down = true;
        if (runtime[defId].effects.thunderstormCasting) {
            runtime[defId].effects.thunderstormCasting = false;
            runtime[defId].effects.thunderstormTarget = null;
            runtime[defId].effects.thunderstormSide = null;
            addLog(`[R?] <span style="color:#ff8a65;">${charMeta[defId].name} のサンダーストームは中断された（戦闘不能）</span>`);
        }
        if (runtime[defId].effects.sleep > 0) {
            runtime[defId].effects.sleep = 0;
        }
    }
}

/**
 * 既存のバトル実行ボタン用ラッパー（挙動は従来どおり。DOM に出力し、勝利時リソースを加算）
 */
function runFullBattleSimulation() {
    if (typeof syncMeta === 'function') syncMeta();
    if (typeof getPartyChars === 'function' && getPartyChars().length === 0) {
        return alert('パーティが空です');
    }
    const battleBox = document.getElementById('ui-log-battle');
    const debugBox = document.getElementById('ui-log-debug');
    battleBox.innerHTML = '<div class="log-header">バトルログ</div>';
    debugBox.innerHTML = '<div class="log-header">デバッグログ</div>';
    structuredLog = [];
    debugPlainLines = [];

    runBattleCore({
        reward: true,
        addLog: h => { battleBox.innerHTML += `<div>${h}</div>`; battleBox.scrollTop = battleBox.scrollHeight; },
        addDebug: h => {
            debugBox.innerHTML += h;
            debugBox.scrollTop = debugBox.scrollHeight;
            const t = h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
            if (t.trim()) debugPlainLines.push(t);
        },
        addDebugRaw: h => { debugBox.innerHTML += h; }
    });
    // 参照版と同じ表形式を出力欄へ自動生成（コピー用。表示ログは従来の1行形式を維持）
    if (typeof structuredLog !== 'undefined' && structuredLog.length) {
        let md = '### Battle Log\n```\n| Rnd | Turn | Actor | Target | Action | Dice | Dmg/Heal | Status | Trigger |\n| --- | ---- | ----- | ------ | ------ | ---- | -------- | ------ | ------- |\n';
        structuredLog.forEach(l => {
            md += `| ${l.round} | ${l.turn} | ${l.actor} | ${l.target} | ${l.action} | ${l.dice} | ${l.val} | ${l.status} | ${l.trigger} |\n`;
        });
        md += '```\n';
        const o = document.getElementById('md-output');
        if (o) o.value = md;
    }
}

/**
 * 戦闘コア（DOM 非依存）。charMeta / skills / ruleData（グローバル）に載っている全ユニットで 1 戦行う。
 * opts:
 *   addLog(html) / addDebug(html) / addDebugRaw(html) … 出力先
 *   reward   … true の時だけ勝利で統合リソースを加算（既存ボタン用。遠征では false）
 *   carry    … { unitId: { hp, down, skillUses } } 連戦用の持ち越し状態（無ければ全快で開始）
 *   env      … { slipPct, envName } 環境ダメージ（毎ラウンド終了時に味方側へ最大HPの slipPct）
 *   bossFailOnTimeout … true なら 15R 時に敵生存で味方敗北（ボス未撃破・敗走）
 * 戻り値: { finished, playerWin, reason, rounds, runtime }
 */
function runBattleCore(opts) {
    opts = opts || {};
    const addLog = opts.addLog || function () {};
    const addDebug = opts.addDebug || function () {};
    const addDebugRaw = opts.addDebugRaw || function () {};

    const runtime = {};
    Object.keys(charMeta).forEach(id => {
        runtime[id] = {
            hp: charMeta[id].maxHp,
            down: false,
            skillUses: initSkillUses(id),
            effects: {
                poison: 0, paralysis: 0, sleep: 0, provokedBy: null,
                coveredBy: null, coveredTurns: 0,
                atkUp: 0, defUp: 0, defDown: 0, intUp: 0, dexUp: 0, mndDefUp: 0, agiUp: 0,
                chargeCounter: 0, chargeMult: 2.2, chargeBarrier: 0, manaBreakFlag: false,
                guardianBarrier: false, guardianTurns: 0,
                guardCounter: false, guardCounterTurns: 0,
                thunderstormCasting: false, thunderstormTarget: null, thunderstormSide: null,
                royalGuard: 0, cannotAct: 0, skipTurn: false,
                berserkAtk: 0, statusShield: 0, shadowClone: 0
            }
        };
    });
    // 連戦の持ち越し（HP・戦闘不能・スキル使用回数。状態異常/バフは戦闘ごとにリセット）
    if (opts.carry) {
        Object.keys(opts.carry).forEach(id => {
            const c = opts.carry[id];
            if (!runtime[id] || !c) return;
            runtime[id].hp = c.hp;
            runtime[id].down = !!c.down;
            if (c.skillUses) runtime[id].skillUses = Object.assign({}, c.skillUses);
        });
    }

    let round = 1;
    let lastRound = 0;
    const maxRounds = 15;
    let finished = false;
    let finishReason = '';
    let playerWinResult = false;

    function countAlive() {
        const p = livingOnSide(true, runtime).length;
        const e = livingOnSide(false, runtime).length;
        return { p, e };
    }

    function declareWinner(playerWin, reason) {
        finished = true;
        playerWinResult = !!playerWin;
        // P8.3: 勝利時リソース加算（暫定値・正式仕様ではない）。遠征中は加算しない
        if (playerWin && opts.reward && typeof addResource === 'function') {
            const reward = (typeof PROVISIONAL_WIN_REWARD !== 'undefined') ? PROVISIONAL_WIN_REWARD : 10;
            addResource(reward);
            if (typeof persist === 'function') persist();
            addLog(`<div class="log-round">【暫定】勝利報酬: 統合リソース +${reward}（合計 ${typeof getResource === 'function' ? getResource() : '?'}）</div>`);
        }
        finishReason = reason;
        if (playerWin) {
            addLog(`<div class="log-round">=== 勝利！（${esc(reason)}）===</div>`);
            if (reason.indexOf('15R') >= 0) {
                const survivors = livingOnSide(false, runtime);
                if (survivors.length) {
                    addLog(`<div class="log-action">${esc(charMeta[survivors[0]].name)}は戦略的に撤退した</div>`);
                }
            }
        } else {
            addLog(`<div class="log-round">=== 敗北…（${esc(reason)}）===</div>`);
            if (reason.indexOf('15R') >= 0) {
                const survivors = livingOnSide(true, runtime);
                if (survivors.length) {
                    addLog(`<div class="log-action">${esc(charMeta[survivors[0]].name)}は戦略的に撤退した</div>`);
                }
            }
        }
    }

    function dealAttackHit(unit, targetId, skillObj, dice, ratio, charged, round, addLog, addDebug) {
        let defId = targetId;
        let mult = 1.0;
        let wasCovered = false;
        let tName = charMeta[targetId].name;
        if (runtime[targetId].effects.coveredBy && !runtime[runtime[targetId].effects.coveredBy].down) {
            defId = runtime[targetId].effects.coveredBy;
            mult = 0.75;
            wasCovered = true;
            tName = `${charMeta[defId].name} (身代わり!)`;
        }
        const calc = calculateDamage(unit, charMeta[defId], skillObj, dice, runtime, ratio);
        let dmg = calc.dmg;
        const sts = [];
        const parts = [calc.formula];
        if (charged) {
            let cm = runtime[unit.id].effects.chargeMult != null ? runtime[unit.id].effects.chargeMult : 2.2;
            if (runtime[unit.id].effects.manaBreakFlag) {
                const te = runtime[defId].effects;
                if (te.poison > 0 || te.paralysis > 0 || te.sleep > 0) {
                    cm += 1.5;
                    te.poison = 0; te.paralysis = 0; te.sleep = 0;
                    sts.push('状態異常消費');
                }
                runtime[unit.id].effects.manaBreakFlag = false;
            }
            dmg = Math.floor(dmg * cm);
            parts.push(`×${cm}(Charge)=${dmg}`);
            sts.push(`チャージ爆発(${cm}倍)`);
            runtime[unit.id].effects.chargeMult = 2.2;
            runtime[unit.id].effects.chargeBarrier = 0;
        }
        if (runtime[defId].effects.guardianBarrier) {
            dmg = Math.max(1, Math.floor(dmg * 0.25));
            parts.push(`守護方陣×0.25=${dmg}`);
            sts.push('守護方陣軽減');
            runtime[defId].effects.guardianBarrier = false;
            runtime[defId].effects.guardianTurns = 0;
        }
        // ロイヤルガード 99% / 4重奏バリア
        if (runtime[defId].effects.royalGuard > 0) {
            dmg = Math.max(0, Math.floor(dmg * 0.01));
            parts.push(`RG×0.01=${dmg}`);
            sts.push('ロイヤルガード');
        } else if (runtime[defId].effects.chargeBarrier > 0) {
            dmg = Math.max(0, Math.floor(dmg * (1 - runtime[defId].effects.chargeBarrier)));
            parts.push(`Chargeバリア`);
        }
        const final = Math.max(1, Math.floor(dmg * mult));
        if (wasCovered) parts.push(`かばう×0.75=${final}`);
        runtime[defId].hp = Math.max(0, runtime[defId].hp - final);
        if (runtime[defId].effects.sleep > 0) {
            runtime[defId].effects.sleep = 0;
            sts.push('睡眠解除');
        }
        if (runtime[defId].hp <= 0) {
            runtime[defId].down = true;
            sts.push('戦闘不能');
            if (runtime[defId].effects.thunderstormCasting) {
                runtime[defId].effects.thunderstormCasting = false;
                runtime[defId].effects.thunderstormTarget = null;
                runtime[defId].effects.thunderstormSide = null;
                addLog(`[R${round}] <span style="color:#ff8a65;">${charMeta[defId].name} のサンダーストームは中断された（戦闘不能）</span>`);
            }
        }
        // ガードカウンター（仕組みは残す・選択不可）
        if (wasCovered && runtime[defId].effects.guardCounter && !runtime[defId].down && !runtime[unit.id].down) {
            const counterSkill = { name: 'ガードカウンター反撃', ratio: 1.6, atkStat: 'atk', defStat: 'def' };
            const cdice = Math.floor(Math.random() * 20) + 1;
            const ccalc = calculateDamage(charMeta[defId], unit, counterSkill, cdice, runtime);
            runtime[unit.id].hp = Math.max(0, runtime[unit.id].hp - ccalc.dmg);
            addLog(`[R${round}] <span class="log-counter">${charMeta[defId].name} のガードカウンター！ → [${unit.name}] ${ccalc.dmg} dmg</span>`);
            if (runtime[unit.id].hp <= 0) {
                runtime[unit.id].down = true;
                if (runtime[unit.id].effects.thunderstormCasting) {
                    runtime[unit.id].effects.thunderstormCasting = false;
                    addLog(`[R${round}] <span style="color:#ff8a65;">${unit.name} のサンダーストームは中断された（戦闘不能）</span>`);
                }
            }
        }
        addDebug(`<div class="debug-note">計算: ${parts.join(' → ')} → 最終${final}</div>`);
        return { final, tName, status: sts.join(' & ') || '-', defId };
    }

    while (round <= maxRounds && !finished) {
        lastRound = round;
        addLog(`<div class="log-round">=== ラウンド ${round} 開始 ===</div>`);
        debugPlainLines.push(`=== ラウンド ${round} 開始 ===`);

        const units = Object.keys(charMeta).map(id => charMeta[id]).filter(u => !runtime[u.id].down);
        for (let i = units.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [units[i], units[j]] = [units[j], units[i]];
        }
        units.sort((a, b) => {
            const ag = (u) => {
                let v = u.agi;
                if (runtime[u.id].effects.agiUp > 0) v = Math.floor(v * 1.3);
                return v;
            };
            return ag(b) - ag(a);
        });

        let turn = 1;
        for (const unit of units) {
            if (finished) break;
            if (runtime[unit.id].down) continue;
            addDebugRaw(`<div class="debug-unit">[R${round} / ${unit.name}]</div>`);

            if (runtime[unit.id].effects.skipTurn) {
                runtime[unit.id].effects.skipTurn = false;
                addLog(`[R${round}] <span class="log-status">${unit.name} は行動できない（復活直後）</span>`);
                addDebug(`<div class="debug-note">復活直後 → 行動不可</div>`);
                continue;
            }
            if (runtime[unit.id].effects.cannotAct > 0 || runtime[unit.id].effects.royalGuard > 0) {
                addLog(`[R${round}] <span class="log-status">${unit.name} は行動不能</span>`);
                addDebug(`<div class="debug-note">cannotAct/RG → 行動不可</div>`);
                continue;
            }
            // 睡眠
            if (runtime[unit.id].effects.sleep > 0) {
                addLog(`[R${round}] <span class="log-status">${unit.name} は眠っている（行動不可）</span>`);
                addDebug(`<div class="debug-note">睡眠 → 行動不可</div>`);
                if (runtime[unit.id].effects.thunderstormCasting) {
                    runtime[unit.id].effects.thunderstormCasting = false;
                    runtime[unit.id].effects.thunderstormTarget = null;
                    runtime[unit.id].effects.thunderstormSide = null;
                    addLog(`[R${round}] <span style="color:#ff8a65;">${unit.name} のサンダーストームは中断された（睡眠）</span>`);
                    addDebug(`<div class="debug-note">詠唱キャンセル（睡眠）</div>`);
                }
                continue;
            }

            // 麻痺 50%
            if (runtime[unit.id].effects.paralysis > 0) {
                if (Math.random() < 0.5) {
                    addLog(`[R${round}] <span class="log-status">${unit.name} は麻痺で動けない</span>`);
                    addDebug(`<div class="debug-note">麻痺 → 行動不可</div>`);
                    if (runtime[unit.id].effects.thunderstormCasting) {
                        runtime[unit.id].effects.thunderstormCasting = false;
                        runtime[unit.id].effects.thunderstormTarget = null;
                        runtime[unit.id].effects.thunderstormSide = null;
                        addLog(`[R${round}] <span style="color:#ff8a65;">${unit.name} のサンダーストームは中断された（麻痺）</span>`);
                        addDebug(`<div class="debug-note">詠唱キャンセル（麻痺）</div>`);
                    }
                    continue;
                }
            }

            // 詠唱完了ターン
            if (runtime[unit.id].effects.thunderstormCasting) {
                runtime[unit.id].effects.thunderstormCasting = false;
                const castTgt = runtime[unit.id].effects.thunderstormTarget;
                const castSide = runtime[unit.id].effects.thunderstormSide;
                runtime[unit.id].effects.thunderstormTarget = null;
                runtime[unit.id].effects.thunderstormSide = null;

                addLog(`[R${round}] <span class="log-action">${unit.name} の詠唱が完了した！</span>`);
                addDebug(`<div class="debug-note">詠唱完了 → サンダーストーム発動判定</div>`);

                const foes = livingOnSide(castSide, runtime);
                if (!foes.length) {
                    addLog(`[R${round}] <span style="color:#ff8a65;">${unit.name} のサンダーストームは不発（対象不在）</span>`);
                    addDebug(`<div class="debug-note">詠唱発動失敗：範囲対象0体</div>`);
                    turn++;
                    continue;
                }

                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                const dice = Math.floor(Math.random() * 20) + 1;
                const skillObj = { name: 'サンダーストーム', ratio: 1.2, atkStat: 'int', defStat: 'mnd' };
                let centerDmg = 0;
                const sts = [];
                if (charged) sts.push('チャージ爆発(2.2倍)');

                foes.forEach(eid => {
                    const res = dealAttackHit(unit, eid, skillObj, dice, 1.2, charged, round, addLog, addDebug);
                    if (eid === castTgt || !centerDmg) centerDmg = res.final;
                });

                const tName = castTgt && charMeta[castTgt]
                    ? `${charMeta[castTgt].name} を中心に範囲`
                    : '範囲';
                addLog(`[R${round}] <span class="${unit.isPlayer ? 'log-action' : 'log-enemy'}">${unit.name} ➡ [${tName}] : 『サンダーストーム』 (${centerDmg} dmg (範囲) / ${sts.join(' & ') || '-'})</span>`);
                structuredLog.push({
                    round, turn, actor: unit.name, action: 'サンダーストーム',
                    target: tName, dice, val: `${centerDmg} dmg (範囲)`, status: sts.join(' & ') || '-', trigger: '詠唱完了'
                });

                const al = countAlive();
                if (al.p === 0 || al.e === 0) {
                    // 行動中全滅はラウンド継続後に判定するためここでは即終了も可
                    if (al.p === 0 && al.e > 0) declareWinner(false, '味方全滅');
                    else if (al.e === 0 && al.p > 0) declareWinner(true, '敵全滅');
                }
                turn++;
                continue;
            }

            // ルール評価
            let chosen = null;
            let targetId = null;
            let rules = ruleData[unit.id] || [];
            // P9.7.0: 味方は解放済みの行数までしか使えない（敵は対象外）
            // PVP（P9.17.0）：両陣営とも、それぞれのアカウントの解放行数までしか使えない
            if (charMeta[unit.id] && typeof charMeta[unit.id].ruleRowLimit === 'number') rules = rules.slice(0, charMeta[unit.id].ruleRowLimit);
            else if (charMeta[unit.id] && charMeta[unit.id].isPlayer && typeof getRuleRowLimit === 'function') rules = rules.slice(0, getRuleRowLimit());
            const unitSkills = skills[unit.id] || [];

            for (let i = 0; i < rules.length; i++) {
                const r = rules[i];
                if (!r.active) continue;
                const d = [`<div class="debug-rule">Rule ${i + 1}`];
                const condOk = checkCondition(r.cond, unit, runtime, round);
                d.push(`条件：${esc(conditions[r.cond])} → <span class="${condOk ? 'result-ok' : 'result-ng'}">${condOk ? '成功' : '失敗'}</span>`);
                if (!condOk) {
                    d.push(`<div>Rule ${i + 1} → <span class="result-ng">不成立</span></div></div>`);
                    addDebug(d.join(''));
                    continue;
                }

                const sk = unitSkills[r.skill];
                if (!sk) {
                    d.push(`<div>Rule ${i + 1} → <span class="result-ng">不成立（スキル不明）</span></div></div>`);
                    addDebug(d.join(''));
                    continue;
                }
                // P9.2: 味方のみアクション解放Lv制限（敵・ボスは制限なし）
                if ((unit.isPlayer || unit.pvp) && typeof canUseSkillAtLevel === 'function' && !canUseSkillAtLevel(sk, (charMeta[unit.id] && charMeta[unit.id].level) || unit.level || 1, true)) {
                    d.push(`<div>未解放アクション（要Lv${sk.unlockLevel != null ? sk.unlockLevel : '?'}）</div>`);
                    d.push(`<div>Rule ${i + 1} → <span class="result-ng">不成立（未解放）</span></div></div>`);
                    addDebug(d.join(''));
                    continue;
                }

                const tgtStr = targets[r.tgt];
                let cand = resolveTarget(unit, tgtStr, runtime, { excludeSelf: !!sk.excludeSelf });

                // チャージ・自己のみ
                if (sk.name === 'チャージ') {
                    if (cand !== unit.id) {
                        d.push(`<div>selfスキルなのに対象が自分自身ではない</div>`);
                        d.push(`<div>Rule ${i + 1} → <span class="result-ng">不成立（対象不一致）</span></div></div>`);
                        addDebug(d.join(''));
                        continue;
                    }
                }

                if (cand) d.push(`<div>対象：${esc(tgtStr)} → 対象 = ${esc(charMeta[cand].name)}</div>`);
                else d.push(`<div>対象：${esc(tgtStr)} → <span class="result-ng">対象なし</span></div>`);

                let fail = null;
                if (!cand) fail = '対象なし';

                // ポイズンボム：中心陣営に毒が1体もいない
                if (!fail && sk.name === 'ポイズンボム') {
                    const side = charMeta[cand].isPlayer;
                    const poisoned = livingOnSide(side, runtime).filter(id => runtime[id].effects.poison > 0);
                    if (!poisoned.length) fail = '毒状態の対象なし';
                }

                // ベノムパラリシス：中心は毒かつ麻痺の単体のみ
                if (!fail && sk.name === 'ベノムパラリシス') {
                    const ve = runtime[cand].effects;
                    if (!(ve.poison > 0 && ve.paralysis > 0)) {
                        fail = '中心が毒かつ麻痺ではない';
                    }
                }

                if (!fail && sk.name === 'パワーエンチャント' && runtime[cand].effects.atkUp > 0) fail = '重複バフ';
                if (!fail && sk.name === 'ガードアップ' && runtime[cand].effects.defUp > 0) fail = '重複DEFバフ';
                if (!fail && sk.name === 'チャージ' && runtime[unit.id].effects.chargeCounter > 0) {
                    fail = `重複チャージ（残り${runtime[unit.id].effects.chargeCounter}T）`;
                }
                if (!fail && sk.name === 'サンダーストーム' && runtime[unit.id].effects.thunderstormCasting) fail = '詠唱中（重複）';
                if (!fail && sk.name === '守護方陣' && runtime[cand].effects.guardianBarrier) fail = '重複・守護方陣';

                if (fail) {
                    d.push(`<div>Rule ${i + 1} → <span class="result-ng">不成立（${esc(fail)}）</span></div></div>`);
                    addDebug(d.join(''));
                    continue;
                }

                // 使用回数
                const left = remainingUses(runtime, unit.id, sk.name);
                const usesOk = left === Infinity || left > 0;
                const leftDisp = left === Infinity ? '∞' : left;
                d.push(`<div>使用回数 → 残${leftDisp} → <span class="${usesOk ? 'result-ok' : 'result-ng'}">${usesOk ? 'OK' : '0'}</span></div>`);
                if (!usesOk) {
                    d.push(`<div>Rule ${i + 1} → <span class="result-ng">不成立（使用回数0）</span></div></div>`);
                    addDebug(d.join(''));
                    continue;
                }

                d.push(`<div>Action → ${esc(sk.name)}</div>`);
                d.push(`<div>Rule ${i + 1} → <span class="result-ok">行動決定</span></div></div>`);
                addDebug(d.join(''));

                targetId = cand;
                chosen = { action: sk.name, type: sk.type, skillObj: sk, trigger: `行${i + 1}(${conditions[r.cond]})` };
                break;
            }

            if (!chosen) {
                addDebug(`<div class="debug-fallback">→ 全ルール不成立 → 防御</div>`);
                chosen = { action: '防御する', type: 'self', skillObj: { ratio: 0, uses: -1 }, trigger: '行11(フォールバック)' };
                targetId = unit.id;
            }

            // 使用回数消費（防御・通常攻撃は無制限）
            if (chosen.action !== '防御する') {
                consumeUse(runtime, unit.id, chosen.action);
                const after = remainingUses(runtime, unit.id, chosen.action);
                const ad = after === Infinity ? '∞' : after;
                addDebug(`<div class="debug-note">使用回数消費：${esc(chosen.action)} 残${ad}</div>`);
            }

            let dice = Math.floor(Math.random() * 20) + 1;
            let val = '-';
            let status = '-';
            let tName = targetId ? charMeta[targetId].name : '対象なし';

            // 挑発固定（攻撃系）
            if (ATTACK_SKILLS.includes(chosen.action) && runtime[unit.id].effects.provokedBy) {
                const p = runtime[unit.id].effects.provokedBy;
                if (!runtime[p].down) {
                    targetId = p;
                    tName = `${charMeta[p].name} [挑発固定]`;
                }
            }

            // ===== アクション実行 =====
            if (chosen.action === 'サンダーストーム' && targetId) {
                runtime[unit.id].effects.thunderstormCasting = true;
                runtime[unit.id].effects.thunderstormTarget = targetId;
                runtime[unit.id].effects.thunderstormSide = charMeta[targetId].isPlayer;
                tName = `${charMeta[targetId].name} を中心に範囲`;
                status = '詠唱開始';
                addDebug(`<div class="debug-note">詠唱開始：中心=${esc(charMeta[targetId].name)} / Charge保持=${runtime[unit.id].effects.chargeCounter}</div>`);
                chosen.action = 'サンダーストームを詠唱している';
            } else if (chosen.action === 'ガードアップ' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                const mods = getSkillCombatParams(unit, 'ガードアップ');
                const gTurns = mods.guardTurns || 2;
                let applied = 0;
                pool.forEach(id => {
                    if (runtime[id].effects.defUp <= 0) {
                        runtime[id].effects.defUp = gTurns;
                        if (mods.guardMnd) runtime[id].effects.mndDefUp = gTurns;
                        applied++;
                    }
                });
                tName = `${charMeta[targetId].name} を中心に範囲`;
                status = mods.guardMnd ? `DEF/MND+40%(${gTurns}T) ×${applied}` : `DEF+40%(${gTurns}T) ×${applied}`;
                val = '-';
            } else if (chosen.action === 'ダブルアタック' && targetId) {
                const mods = getSkillCombatParams(unit, 'ダブルアタック');
                const hitRatio = mods.ratio != null ? mods.ratio : 0.8;
                const hitCount = mods.hits != null ? mods.hits : 2;
                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                const hitVals = [];
                let lastStatus = '-';
                for (let h = 0; h < hitCount; h++) {
                    if (runtime[targetId].down) {
                        lastStatus = (lastStatus === '-' ? '' : lastStatus + ' / ') + `${h + 1}撃目以降不発`;
                        break;
                    }
                    const res = dealAttackHit(unit, targetId, chosen.skillObj, dice, hitRatio, charged && h === 0, round, addLog, addDebug);
                    hitVals.push(res.final);
                    tName = res.tName;
                    lastStatus = res.status;
                    charged = false;
                }
                val = hitVals.join('+') + ' dmg';
                status = lastStatus;
            } else if (chosen.action === 'リベンジブロウ' && targetId) {
                const ratio = revengeRatio(unit, runtime);
                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                const res = dealAttackHit(unit, targetId, chosen.skillObj, dice, ratio, charged, round, addLog, addDebug);
                val = `${res.final} dmg`;
                status = res.status;
                if (status === '-') status = `倍率${ratio}`;
                else status = `倍率${ratio} / ${status}`;
                tName = res.tName;
            } else if (chosen.action === 'ポイズンボム' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const poisoned = livingOnSide(side, runtime).filter(id => runtime[id].effects.poison > 0);
                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                let total = 0;
                const names = [];
                poisoned.forEach(eid => {
                    const res = dealAttackHit(unit, eid, chosen.skillObj, dice, 1.8, charged && eid === poisoned[0], round, addLog, addDebug);
                    // charge only on first target in list
                    if (eid === poisoned[0]) charged = false;
                    runtime[eid].effects.poison = 0;
                    total += res.final;
                    names.push(charMeta[eid].name);
                });
                tName = names.join(',') || tName;
                val = `${total} dmg (毒消費×${poisoned.length})`;
                status = '毒消費';
            } else if (ATTACK_SKILLS.includes(chosen.action) && targetId) {
                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                const mods = getSkillCombatParams(unit, chosen.action);
                let useRatio = chosen.skillObj.ratio;
                if (mods.ratio != null && (chosen.action === 'ファイア' || chosen.action === '毒手' || chosen.action === 'セイントストライク' || chosen.action === 'ガードブレイク')) {
                    useRatio = mods.ratio;
                }
                // 多段（メテオ・幻影・影分身）
                const hitCount = (mods.hits && mods.hits > 1 && chosen.action !== 'ダブルアタック') ? mods.hits : 1;
                if (hitCount > 1) {
                    const hitVals = [];
                    for (let h = 0; h < hitCount; h++) {
                        if (runtime[targetId].down) break;
                        const res = dealAttackHit(unit, targetId, chosen.skillObj, dice, useRatio, charged && h === 0, round, addLog, addDebug);
                        hitVals.push(res.final);
                        tName = res.tName;
                        status = res.status;
                        charged = false;
                    }
                    val = hitVals.join('+') + ' dmg';
                } else if (chosen.action === 'オール・イン') {
                    const d1 = Math.floor(Math.random() * 20) + 1;
                    const d2 = Math.floor(Math.random() * 20) + 1;
                    const ratioAll = (d1 - d2) / 2;
                    dice = d1;
                    if (ratioAll > 0) {
                        const res = dealAttackHit(unit, targetId, chosen.skillObj, d1, ratioAll, charged, round, addLog, addDebug);
                        val = `${res.final} dmg`;
                        status = `AllIn d${d1}-d${d2}=×${ratioAll} / ${res.status}`;
                        tName = res.tName;
                    } else {
                        const selfDmg = Math.max(1, Math.floor(unit.maxHp * 0.30));
                        runtime[unit.id].hp = Math.max(0, runtime[unit.id].hp - selfDmg);
                        if (runtime[unit.id].hp <= 0) runtime[unit.id].down = true;
                        val = `自己${selfDmg}`;
                        status = `AllIn d${d1}-d${d2}=×${ratioAll} 失敗`;
                    }
                } else {
                    const res = dealAttackHit(unit, targetId, chosen.skillObj, dice, useRatio, charged, round, addLog, addDebug);
                    val = `${res.final} dmg`;
                    status = res.status;
                    tName = res.tName;
                    // 影分身追撃
                    if (runtime[unit.id].effects.shadowClone > 0 && !runtime[targetId].down && chosen.skillObj.type !== 'aoe') {
                        const sk = { name: '影分身追撃', ratio: 1.0, atkStat: chosen.skillObj.atkStat || 'atk', defStat: chosen.skillObj.defStat || 'def', hybrid: chosen.skillObj.hybrid };
                        const r2 = dealAttackHit(unit, targetId, sk, dice, 1.0, false, round, addLog, addDebug);
                        val += `+${r2.final}`;
                        status += ' / 影追撃';
                    }
                }

                
                if (chosen.action === 'ガードブレイク' && targetId && !runtime[targetId].down) {
                    runtime[targetId].effects.defDown = 3;
                    status = (status === '-' ? '' : status + ' & ') + 'DEF↓30%(3T)';
                }
                if (chosen.action === 'セイントストライク' && targetId && !runtime[targetId].down) {
                    const s = checkSavingThrow(unit, charMeta[targetId], (charMeta[targetId].paralysisResist || 0));
                    if (!s.success) {
                        if (runtime[targetId].effects.statusShield > 0) {
                            runtime[targetId].effects.statusShield--;
                            status = (status === '-' ? '' : status + ' & ') + '麻痺(盾で無効)';
                        } else {
                            runtime[targetId].effects.paralysis = 2;
                            status = (status === '-' ? '' : status + ' & ') + '麻痺(付与)';
                        }
                    } else status = (status === '-' ? '' : status + ' & ') + '麻痺(抵抗)';
                }
                if (chosen.action === '毒手' && targetId && !runtime[targetId].down) {
                    const s = checkSavingThrow(unit, charMeta[targetId], (charMeta[targetId].poisonResist || 0));
                    const pt = mods.poisonTurns || 3;
                    if (!s.success) {
                        if (runtime[targetId].effects.statusShield > 0) {
                            runtime[targetId].effects.statusShield--;
                            status = (status === '-' ? '' : status + ' & ') + '毒(盾で無効)';
                        } else {
                            runtime[targetId].effects.poison = pt;
                            status = (status === '-' ? '' : status + ' & ') + '毒(付与)';
                        }
                    } else status = (status === '-' ? '' : status + ' & ') + '毒(抵抗)';
                }
                if (chosen.action === '影分身') {
                    runtime[unit.id].effects.shadowClone = 2;
                    status = (status === '-' ? '' : status + ' / ') + '影分身(2T)';
                }
            } else if (chosen.action === 'スリープミスト' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                tName = `${charMeta[targetId].name} を中心に範囲`;
                status = 'スリープミスト(範囲睡眠判定)';
                pool.forEach(eid => {
                    const s = checkSavingThrow(unit, charMeta[eid], (charMeta[eid].sleepResist || 0));
                    if (!s.success) {
                        runtime[eid].effects.sleep = 2;
                        addDebug(`<div class="debug-note">睡眠付与: ${esc(charMeta[eid].name)}</div>`);
                    } else {
                        addDebug(`<div class="debug-note">睡眠抵抗: ${esc(charMeta[eid].name)}</div>`);
                    }
                });
            } else if (chosen.action === 'ベノムパラリシス' && targetId) {
                // 毒＆麻痺の単体を中心に、同陣営へ毒・麻痺を個別判定で拡散。所持中は上書きしない
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                tName = `${charMeta[targetId].name} を中心に範囲`;
                let poisonHit = 0, paraHit = 0;
                pool.forEach(eid => {
                    const ef = runtime[eid].effects;
                    const nm = charMeta[eid].name;
                    if (ef.poison > 0) {
                        addDebug(`<div class="debug-note">毒拡散スキップ(既所持): ${esc(nm)}</div>`);
                    } else {
                        const sv = checkSavingThrow(unit, charMeta[eid], (charMeta[eid].poisonResist || 0));
                        if (!sv.success) {
                            ef.poison = 3;
                            poisonHit++;
                            addDebug(`<div class="debug-note">毒拡散付与: ${esc(nm)}</div>`);
                        } else {
                            addDebug(`<div class="debug-note">毒拡散抵抗: ${esc(nm)}</div>`);
                        }
                    }
                    if (ef.paralysis > 0) {
                        addDebug(`<div class="debug-note">麻痺拡散スキップ(既所持): ${esc(nm)}</div>`);
                    } else {
                        const sv = checkSavingThrow(unit, charMeta[eid], (charMeta[eid].paralysisResist || 0));
                        if (!sv.success) {
                            ef.paralysis = 2;
                            paraHit++;
                            addDebug(`<div class="debug-note">麻痺拡散付与: ${esc(nm)}</div>`);
                        } else {
                            addDebug(`<div class="debug-note">麻痺拡散抵抗: ${esc(nm)}</div>`);
                        }
                    }
                });
                status = `毒/麻痺拡散(付与 毒${poisonHit}/麻痺${paraHit})`;
            } else if (chosen.action === 'ヒール' && targetId) {
                const mods = getSkillCombatParams(unit, 'ヒール');
                const pct = mods.healPct != null ? mods.healPct : 0.45;
                const maxHp = charMeta[targetId].maxHp;
                const heal = Math.max(1, Math.floor(maxHp * pct));
                runtime[targetId].hp = Math.min(maxHp, runtime[targetId].hp + heal);
                val = `+${heal} 回復`;
            } else if (chosen.action === 'リカバリー' && targetId) {
                const maxHp = charMeta[targetId].maxHp;
                const heal = Math.max(1, Math.floor(maxHp * 0.20));
                runtime[targetId].effects.poison = 0;
                runtime[targetId].effects.paralysis = 0;
                runtime[targetId].effects.sleep = 0;
                runtime[targetId].hp = Math.min(maxHp, runtime[targetId].hp + heal);
                val = `+${heal} 回復`;
                status = '状態異常解除';
            } else if (chosen.action === 'パワーエンチャント' && targetId) {
                const mods = getSkillCombatParams(unit, 'パワーエンチャント');
                runtime[targetId].effects.atkUp = 3;
                if (mods.powerPlus) {
                    runtime[targetId].effects.intUp = 3;
                    runtime[targetId].effects.dexUp = 3;
                    status = 'ATK/INT/DEX+30%(3T)';
                } else status = '攻撃力UP(3T)';
            } else if (chosen.action === '守護方陣' && targetId) {
                runtime[targetId].effects.guardianBarrier = true;
                runtime[targetId].effects.guardianTurns = 1;
                status = '守護方陣(1回75%軽減/1T)';
            } else if (chosen.action === 'チャージ') {
                runtime[unit.id].effects.chargeCounter = 3;
                runtime[unit.id].effects.chargeMult = 2.2;
                runtime[unit.id].effects.chargeBarrier = 0;
                runtime[unit.id].effects.manaBreakFlag = false;
                status = 'チャージ(3T有効)';
            } else if (chosen.action === '4重奏') {
                runtime[unit.id].effects.chargeCounter = 3;
                runtime[unit.id].effects.chargeMult = 4.0;
                runtime[unit.id].effects.chargeBarrier = 0.25;
                runtime[unit.id].effects.manaBreakFlag = false;
                status = '4重奏チャージ(×4/3T/被ダメ-25%)';
            } else if (chosen.action === 'マナブレイク') {
                runtime[unit.id].effects.chargeCounter = 3;
                runtime[unit.id].effects.chargeMult = 3.0;
                runtime[unit.id].effects.chargeBarrier = 0;
                runtime[unit.id].effects.manaBreakFlag = true;
                status = 'マナブレイクチャージ(×3/異常時+1.5)';
            } else if (chosen.action === 'ロイヤルガード') {
                runtime[unit.id].effects.royalGuard = 2;
                runtime[unit.id].effects.cannotAct = 2;
                status = 'RG(被ダメ99%カット/行動不能2T)';
            } else if (chosen.action === '狂戦士の宴') {
                const selfDmg = Math.max(1, Math.floor(unit.maxHp * 0.30));
                runtime[unit.id].hp = Math.max(0, runtime[unit.id].hp - selfDmg);
                if (runtime[unit.id].hp <= 0) runtime[unit.id].down = true;
                runtime[unit.id].effects.berserkAtk = 3;
                val = `自己${selfDmg}`;
                status = 'ATK+30%(3T)';
            } else if (chosen.action === '魔剣解放' && targetId) {
                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                const res = dealAttackHit(unit, targetId, chosen.skillObj, dice, 2.0, charged, round, addLog, addDebug);
                val = `${res.final} dmg`;
                tName = res.tName;
                // リカバリー同等
                const maxHp = unit.maxHp;
                const heal = Math.max(1, Math.floor(maxHp * 0.20));
                runtime[unit.id].effects.poison = 0;
                runtime[unit.id].effects.paralysis = 0;
                runtime[unit.id].effects.sleep = 0;
                runtime[unit.id].hp = Math.min(maxHp, runtime[unit.id].hp + heal);
                status = res.status + ` / 自己回復+${heal}`;
            } else if (chosen.action === '居合一閃' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                let charged = false;
                if (runtime[unit.id].effects.chargeCounter > 0) {
                    charged = true;
                    runtime[unit.id].effects.chargeCounter = 0;
                }
                let total = 0;
                pool.forEach((eid, idx) => {
                    const res = dealAttackHit(unit, eid, chosen.skillObj, dice, 1.8, charged && idx === 0, round, addLog, addDebug);
                    total += res.final;
                    charged = false;
                });
                tName = `${charMeta[targetId].name} を中心に範囲`;
                val = `${total} dmg (範囲)`;
            } else if (chosen.action === 'カオスゲート' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                let total = 0;
                pool.forEach(eid => {
                    const res = dealAttackHit(unit, eid, chosen.skillObj, dice, 1.5, false, round, addLog, addDebug);
                    total += res.final;
                    if (!runtime[eid].down) {
                        const s = checkSavingThrow(unit, charMeta[eid], (charMeta[eid].poisonResist || 0));
                        // 控えめ毒付与
                        if (!s.success && Math.random() < 0.4) {
                            if (runtime[eid].effects.statusShield > 0) runtime[eid].effects.statusShield--;
                            else runtime[eid].effects.poison = 3;
                        }
                    }
                });
                tName = `${charMeta[targetId].name} を中心に範囲`;
                val = `${total} dmg (範囲)`;
                status = '毒判定';
            } else if (chosen.action === '深淵の呪詛' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                let total = 0;
                pool.forEach(eid => {
                    let ratio = 2.0;
                    const ef = runtime[eid].effects;
                    let cnt = 0;
                    if (ef.poison > 0) cnt++;
                    if (ef.paralysis > 0) cnt++;
                    if (ef.sleep > 0) cnt++;
                    ratio += cnt * 1.0;
                    const res = dealAttackHit(unit, eid, chosen.skillObj, dice, ratio, false, round, addLog, addDebug);
                    total += res.final;
                });
                tName = `${charMeta[targetId].name} を中心に範囲`;
                val = `${total} dmg (範囲)`;
            } else if (chosen.action === 'ソウルサクリファイス') {
                // 敵全体に INT vs MND ×2.0 ダメージ → 自身に固定100（防御無視）。自傷で倒れてもダメージは確定済み
                const foes = livingOnSide(!unit.isPlayer, runtime);
                let total = 0;
                const skObj = chosen.skillObj || (typeof SKILL_DEFS !== 'undefined' ? SKILL_DEFS.soulSacrifice : { ratio: 2.0, atkStat: 'int', defStat: 'mnd' });
                foes.forEach(eid => {
                    const res = dealAttackHit(unit, eid, skObj, dice, 2.0, false, round, addLog, addDebug);
                    total += res.final;
                });
                tName = '敵全体';
                val = `${total} dmg (範囲)`;
                // 自傷（防御無視固定）
                const selfDmg = 100;
                runtime[unit.id].hp = Math.max(0, runtime[unit.id].hp - selfDmg);
                status = `自傷${selfDmg}`;
                if (runtime[unit.id].hp <= 0) {
                    runtime[unit.id].hp = 0;
                    runtime[unit.id].down = true;
                    status += '/自身戦闘不能';
                }
            } else if (chosen.action === '捕食' && targetId) {
                // 味方単体に固定50ダメ → 自身50回復。対象が既に戦闘不能なら不発・回復なし
                if (runtime[targetId].down) {
                    status = '対象は既に戦闘不能（不発）';
                    val = '—';
                } else {
                    const sk = chosen.skillObj || {};
                    const dmg = (sk.fixedDamage != null) ? sk.fixedDamage : 50;
                    runtime[targetId].hp -= dmg;
                    val = `${dmg} dmg`;
                    if (runtime[targetId].hp <= 0) {
                        runtime[targetId].hp = 0;
                        runtime[targetId].down = true;
                        status = '戦闘不能';
                    }
                    const heal = (sk.selfHeal != null) ? sk.selfHeal : 50;
                    const maxHp = charMeta[unit.id].maxHp;
                    runtime[unit.id].hp = Math.min(maxHp, runtime[unit.id].hp + heal);
                    status = (status ? status + '/' : '') + `自己回復+${heal}`;
                }
            } else if (chosen.action === '蘇生' && targetId) {
                if (!runtime[targetId].down) {
                    status = '対象は戦闘不能ではない';
                } else {
                    const maxHp = charMeta[targetId].maxHp;
                    const ratio = (chosen.skillObj && chosen.skillObj.reviveHpRatio != null)
                        ? chosen.skillObj.reviveHpRatio : 0.5;
                    runtime[targetId].down = false;
                    runtime[targetId].hp = Math.max(1, Math.floor(maxHp * ratio));
                    runtime[targetId].effects.skipTurn = true;
                    // スキル使用回数はリセットしない
                    val = `復活HP${runtime[targetId].hp}`;
                    status = `HP${Math.round(ratio * 100)}%復活/当ターン行動不可`;
                }
            } else if (chosen.action === 'リザレクション' && targetId) {
                if (!runtime[targetId].down) {
                    status = '対象は戦闘不能ではない';
                } else {
                    const maxHp = charMeta[targetId].maxHp;
                    runtime[targetId].down = false;
                    runtime[targetId].hp = Math.max(1, Math.floor(maxHp * 0.50));
                    runtime[targetId].effects.defUp = Math.max(runtime[targetId].effects.defUp, 1);
                    runtime[targetId].effects.skipTurn = true;
                    val = `復活HP${runtime[targetId].hp}`;
                    status = '復活+DEF+50%(1T)/当ターン行動不可';
                }
            } else if (chosen.action === 'グレートヒール' && targetId) {
                const maxHp = charMeta[targetId].maxHp;
                const heal = Math.max(1, Math.floor(maxHp * 0.70));
                runtime[targetId].effects.poison = 0;
                runtime[targetId].effects.paralysis = 0;
                runtime[targetId].effects.sleep = 0;
                runtime[targetId].hp = Math.min(maxHp, runtime[targetId].hp + heal);
                val = `+${heal} 回復`;
                status = '全異常解除';
            } else if (chosen.action === '大地の恵み' && targetId) {
                const side = charMeta[targetId].isPlayer;
                const pool = livingOnSide(side, runtime);
                pool.forEach(eid => {
                    const maxHp = charMeta[eid].maxHp;
                    const heal = Math.max(1, Math.floor(maxHp * 0.45));
                    runtime[eid].hp = Math.min(maxHp, runtime[eid].hp + heal);
                    runtime[eid].effects.statusShield = 1;
                    // 既存異常は解除しない
                });
                tName = `${charMeta[targetId].name} を中心に範囲`;
                val = '範囲回復45%';
                status = '新規異常1回無効(3T管理は盾1回)';
            } else if (chosen.action === '英雄譚' && targetId) {
                runtime[targetId].effects.agiUp = 2;
                status = 'AGI+30%(2T)';
            } else if (chosen.action === '防御する') {
                status = '防御(被ダメ25%カット)';
            }

            structuredLog.push({
                round, turn, actor: unit.name, action: chosen.action,
                target: tName, dice, val, status, trigger: chosen.trigger
            });
            addLog(`[R${round}] <span class="${unit.isPlayer ? 'log-action' : 'log-enemy'}">${unit.name} ➡ [${tName}] : 『${chosen.action}』 (${val} / ${status})</span>`);

            const al = countAlive();
            if (al.p === 0 && al.e > 0) declareWinner(false, '味方全滅');
            else if (al.e === 0 && al.p > 0) declareWinner(true, '敵全滅');
            // 同時0はラウンド終了で判定

            turn++;
        }

        if (finished) break;

        // ラウンド終了処理
        addLog(`<div class="log-round">--- ラウンド ${round} 終了処理 ---</div>`);
        addDebug(`<div class="debug-note">=== ラウンド ${round} 終了処理 ===</div>`);

        Object.keys(runtime).forEach(id => {
            if (runtime[id].down) return;
            const e = runtime[id].effects;
            if (e.poison > 0) {
                const maxHp = charMeta[id].maxHp;
                const dot = Math.max(1, Math.floor(maxHp * 0.10));
                runtime[id].hp = Math.max(0, runtime[id].hp - dot);
                addLog(`<span class="log-dot">[毒] ${charMeta[id].name} に ${dot} dmg（残り${e.poison - 1}T）</span>`);
                addDebug(`<div class="debug-note">[DoT] ${charMeta[id].name} 毒${dot} → HP${runtime[id].hp}（最大HP${maxHp}×10%）</div>`);
                e.poison--;
                if (runtime[id].hp <= 0) {
                    runtime[id].down = true;
                    if (e.thunderstormCasting) {
                        e.thunderstormCasting = false;
                        addLog(`[毒] <span style="color:#ff8a65;">${charMeta[id].name} の詠唱がキャンセルされた</span>`);
                    }
                }
            }
            // 環境スリップダメージ（遠征の環境縛り。味方側のみ）
            if (opts.env && opts.env.slipPct > 0 && charMeta[id].isPlayer && !runtime[id].down) {
                const maxHp = charMeta[id].maxHp;
                const sd = Math.max(1, Math.floor(maxHp * opts.env.slipPct));
                runtime[id].hp = Math.max(0, runtime[id].hp - sd);
                addLog(`[環境] ${charMeta[id].name} に ${sd} dmg（${esc(opts.env.envName || '環境ダメージ')}）`);
                addDebug(`<div class="debug-note">[環境スリップ] ${charMeta[id].name} ${sd} → HP${runtime[id].hp}（最大HP${maxHp}×${Math.round(opts.env.slipPct * 100)}%）</div>`);
                if (runtime[id].hp <= 0) {
                    runtime[id].down = true;
                    if (e.thunderstormCasting) {
                        e.thunderstormCasting = false;
                        addLog(`[環境] <span style="color:#ff8a65;">${charMeta[id].name} の詠唱がキャンセルされた</span>`);
                    }
                }
            }
            if (e.atkUp > 0) e.atkUp--;
            if (e.defUp > 0) e.defUp--;
            if (e.defDown > 0) e.defDown--;
            if (e.intUp > 0) e.intUp--;
            if (e.dexUp > 0) e.dexUp--;
            if (e.mndDefUp > 0) e.mndDefUp--;
            if (e.agiUp > 0) e.agiUp--;
            if (e.berserkAtk > 0) e.berserkAtk--;
            if (e.shadowClone > 0) e.shadowClone--;
            if (e.royalGuard > 0) e.royalGuard--;
            if (e.cannotAct > 0) e.cannotAct--;
            if (e.chargeCounter > 0) {
                e.chargeCounter--;
                if (e.chargeCounter <= 0) {
                    e.chargeMult = 2.2;
                    e.chargeBarrier = 0;
                    e.manaBreakFlag = false;
                }
            }
            if (e.paralysis > 0) e.paralysis--;
            if (e.sleep > 0) e.sleep--;
            if (e.coveredTurns > 0) {
                e.coveredTurns--;
                if (e.coveredTurns <= 0) e.coveredBy = null;
            }
            if (e.guardCounterTurns > 0) {
                e.guardCounterTurns--;
                if (e.guardCounterTurns <= 0) e.guardCounter = false;
            }
            if (e.guardianTurns > 0) {
                e.guardianTurns--;
                if (e.guardianTurns <= 0) e.guardianBarrier = false;
            }
        });

        const al2 = countAlive();
        addDebug(`<div class="debug-note">生存確認: 味方${al2.p} / 敵${al2.e}</div>`);

        if (al2.p === 0 && al2.e === 0) {
            const d = diceWinnerIsPlayer();
            addDebug(`<div class="debug-note">同時全滅 → ダイス 味方${d.playerDice} vs 敵${d.enemyDice}</div>`);
            declareWinner(d.playerWin, '同時全滅・ダイス判定');
        } else if (al2.p === 0) {
            declareWinner(false, '味方全滅（ラウンド終了判定）');
        } else if (al2.e === 0) {
            declareWinner(true, '敵全滅（ラウンド終了判定）');
        } else if (round >= maxRounds) {
            // 15R終了判定
            // ボス戦: 敵が生存していれば未撃破＝敗北（生存者数比較で勝たせない）
            if (opts.bossFailOnTimeout && al2.e > 0) {
                addDebug(`<div class="debug-note">15R終了・ボス未撃破（敵生存${al2.e}）→ 敗走</div>`);
                declareWinner(false, '15R終了・ボス未撃破');
            } else if (al2.p > al2.e) declareWinner(true, '15R終了・生存者数');
            else if (al2.e > al2.p) declareWinner(false, '15R終了・生存者数');
            else {
                let hpP = 0, hpE = 0;
                livingOnSide(true, runtime).forEach(id => { hpP += runtime[id].hp; });
                livingOnSide(false, runtime).forEach(id => { hpE += runtime[id].hp; });
                addDebug(`<div class="debug-note">15R HP合計 味方${hpP} / 敵${hpE}</div>`);
                if (hpP > hpE) declareWinner(true, '15R終了・残HP合計');
                else if (hpE > hpP) declareWinner(false, '15R終了・残HP合計');
                else {
                    const d = diceWinnerIsPlayer();
                    addDebug(`<div class="debug-note">15R同点ダイス 味方${d.playerDice} vs 敵${d.enemyDice}</div>`);
                    declareWinner(d.playerWin, '15R終了・ダイス判定');
                }
            }
        }

        round++;
    }

    // 使用回数は戦闘終了で破棄（次回戦闘開始時に全回復＝再初期化）
    addDebug(`<div class="debug-note">戦闘終了：${opts.carry ? '使用回数・HPは次戦へ持ち越し（遠征）' : '使用回数は次回戦闘で全回復（テストモデル）'}</div>`);
    return { finished, playerWin: playerWinResult, reason: finishReason, rounds: lastRound, runtime };
}

function generateMD() {
    if (!structuredLog.length) return alert('先にバトル実行を');
    let md = '### Battle Log\n```\n| Rnd | Turn | Actor | Target | Action | Dice | Dmg/Heal | Status | Trigger |\n| --- | ---- | ----- | ------ | ------ | ---- | -------- | ------ | ------- |\n';
    structuredLog.forEach(l => {
        md += `| ${l.round} | ${l.turn} | ${l.actor} | ${l.target} | ${l.action} | ${l.dice} | ${l.val} | ${l.status} | ${l.trigger} |\n`;
    });
    md += '```\n';
    const o = document.getElementById('md-output');
    if (!o) return alert('出力欄がありません');
    o.value = md;
    o.focus();
    o.select();
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(md).then(() => alert('バトルログをコピーしました')).catch(() => alert('出力欄に生成しました（手動コピー可）'));
        } else {
            document.execCommand('copy');
            alert('バトルログをコピーしました');
        }
    } catch (e) {
        alert('出力欄に生成しました（手動コピー可）');
    }
}

function generateDebugText() {
    if (!debugPlainLines.length) return alert('先にバトル実行を');
    const text = debugPlainLines.join('\n');
    const o = document.getElementById('md-output');
    if (!o) return alert('出力欄がありません');
    o.value = text;
    o.focus();
    o.select();
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => alert('デバッグログをコピーしました')).catch(() => alert('出力欄に生成しました（手動コピー可）'));
        } else {
            document.execCommand('copy');
            alert('デバッグログをコピーしました');
        }
    } catch (e) {
        alert('出力欄に生成しました（手動コピー可）');
    }
}
