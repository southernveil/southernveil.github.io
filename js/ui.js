/**
 * ui.js — ヤード / パーティ / ルール編集 / ログタブ (P7-7)
 */
function statLine(ch) {
    const lv = ch.level || 1;
    const g = (k) => (typeof getEffectiveStat === 'function') ? getEffectiveStat(ch, k) : ch[k];
    const mark = (k) => {
        const base = ch[k] || 0;
        const eff = g(k);
        return eff !== base ? `${eff}(+${eff - base})` : String(eff);
    };
    return `Lv${lv} HP${ch.maxHp} ATK${mark('atk')} DEF${mark('def')}<br>INT${mark('int')} MND${mark('mnd')} AGI${ch.agi} DEX${ch.dex}`;
}

function renderAll() {
    if (typeof renderDevSsPanel === 'function') renderDevSsPanel();
    const tp = document.getElementById('tab-player');
    const te = document.getElementById('tab-enemy');
    if (tp) tp.className = `tab-btn ${activeGroup === 'player' ? 'active' : ''}`;
    if (te) te.className = `tab-btn ${activeGroup === 'enemy' ? 'active' : ''}`;
    renderCharLists();
    if (document.getElementById('rule-editor')) renderEditor();
    if (typeof updateResourceUI === 'function') updateResourceUI();
    if (typeof renderPartySetTabs === 'function') renderPartySetTabs();
    if (typeof renderRuleWho === 'function') renderRuleWho();
    if (typeof renderRecruitScreen === 'function') renderRecruitScreen();
    if (typeof renderYardScreen === 'function' && document.getElementById('screen-yard') &&
        document.getElementById('screen-yard').style.display !== 'none') {
        renderYardScreen();
    }
}

function renderCharLists() {
    const yardList = document.getElementById('yard-list');
    const partyList = document.getElementById('player-list');
    const eList = document.getElementById('enemy-list');
    if (yardList) yardList.innerHTML = '';
    if (partyList) partyList.innerHTML = '';
    if (eList) eList.innerHTML = '';

    const yc = document.getElementById('yard-count');
    const pc = document.getElementById('party-count');
    const ec = document.getElementById('enemy-count');
    if (yc) yc.textContent = '(' + yardChars.length + ')';
    if (pc) pc.textContent = '(' + partyIds.length + '/' + MAX_PARTY + ')';
    if (ec) ec.textContent = '(' + enemyChars.length + '/' + MAX_PARTY + ')';

    // --- ヤード ---
    yardChars.forEach(ch => {
        const cls = CLASS_DEFS[ch.classId];
        const inParty = isInParty(ch.id);
        const el = document.createElement('div');
        el.className = `char-card player ${currentChar === ch.id ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="char-card-name"><span class="card-stand">${standeeHtml(ch,'sm')}</span>${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)}
                <span style="font-weight:normal;font-size:10px;">[${cls.name}]</span>
                ${inParty ? '<span style="color:#2e6b3a;font-size:10px;">出撃中</span>' : ''}
            </div>
            <div class="stat-line">${statLine(ch)}</div>
            <div class="meta">charId: ${ch.charId}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                ${inParty
                    ? `<button class="btn btn-sm" style="background:#6f6a5a;" onclick="event.stopPropagation();removeFromParty('${ch.id}')">パーティから外す</button>`
                    : partyAddBtnHtml(ch.id,'パーティへ',true)
                }
                <label style="font-size:11px;color:#5f5849;" onclick="event.stopPropagation();">Lv
                ${ch.isPlayer
                    ? levelUpButtonHtml(ch)
                    : `<input type="number" min="1" max="${MAX_LEVEL}" value="${ch.level || 1}" style="width:4em"
                    onchange="setCharLevel('${ch.id}', this.value)">`}
                </label>
                <button class="btn btn-sm" style="background:#8a5a3a;" onclick="event.stopPropagation();resetCharToLv1('${ch.id}')">Lv1</button>
                <a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}" onclick="event.stopPropagation();">詳細</a>
                <button class="btn btn-sm" style="background:#3d5a99;" onclick="event.stopPropagation();renameChar('${ch.id}')">名前</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();removeFromYard('${ch.id}')">削除</button>
            </div>`;
        el.onclick = () => {
            currentChar = ch.id;
            activeGroup = 'player';
            renderAll();
        };
        yardList && yardList.appendChild(el);
    });

    // --- パーティ（出撃順） ---
    getPartyChars().forEach((ch, idx) => {
        const cls = CLASS_DEFS[ch.classId];
        const el = document.createElement('div');
        el.className = `char-card player ${currentChar === ch.id ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="char-card-name"><span class="card-stand">${standeeHtml(ch,'sm')}</span>${idx + 1}. ${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)}
                <span style="font-weight:normal;font-size:10px;">[${cls.name}] AGI:${ch.agi}</span>
            </div>
            <div class="stat-line">${statLine(ch)}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                <button class="btn btn-sm" style="background:#6f6a5a;" onclick="event.stopPropagation();movePartyUp('${ch.id}')" ${idx===0?'disabled':''}>↑</button>
                <button class="btn btn-sm" style="background:#6f6a5a;" onclick="event.stopPropagation();movePartyDown('${ch.id}')" ${idx===getPartyChars().length-1?'disabled':''}>↓</button>
                <label style="font-size:11px;color:#5f5849;" onclick="event.stopPropagation();">Lv
                ${ch.isPlayer
                    ? levelUpButtonHtml(ch)
                    : `<input type="number" min="1" max="${MAX_LEVEL}" value="${ch.level || 1}" style="width:4em"
                    onchange="setCharLevel('${ch.id}', this.value)">`}
                </label>
                <button class="btn btn-sm" style="background:#8a5a3a;" onclick="event.stopPropagation();resetCharToLv1('${ch.id}')">Lv1</button>
                <a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}" onclick="event.stopPropagation();">詳細</a>
                <button class="btn btn-sm" style="background:#3d5a99;" onclick="event.stopPropagation();renameChar('${ch.id}')">名前</button>
                <button class="btn btn-sm" style="background:#6f6a5a;" onclick="event.stopPropagation();removeFromParty('${ch.id}')">外す</button>
            </div>`;
        el.onclick = () => {
            currentChar = ch.id;
            activeGroup = 'player';
            renderAll();
        };
        partyList && partyList.appendChild(el);
    });

    // --- 敵 ---
    enemyChars.forEach(ch => {
        const cls = CLASS_DEFS[ch.classId];
        const el = document.createElement('div');
        el.className = `char-card enemy ${currentChar === ch.id ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="char-card-name">${esc(ch.name)}
                <span style="font-weight:normal;font-size:10px;">[${cls.name}] AGI:${ch.agi}</span>
            </div>
            <div class="stat-line">${statLine(ch)}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                <label style="font-size:11px;color:#5f5849;" onclick="event.stopPropagation();">Lv
                ${ch.isPlayer
                    ? levelUpButtonHtml(ch)
                    : `<input type="number" min="1" max="${MAX_LEVEL}" value="${ch.level || 1}" style="width:4em"
                    onchange="setCharLevel('${ch.id}', this.value)">`}
                </label>
                <button class="btn btn-sm" style="background:#8a5a3a;" onclick="event.stopPropagation();resetCharToLv1('${ch.id}')">Lv1</button>
                <a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}" onclick="event.stopPropagation();">詳細</a>
                <button class="btn btn-sm" style="background:#3d5a99;" onclick="event.stopPropagation();renameChar('${ch.id}')">名前</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();removeEnemyMember('${ch.id}')">外す</button>
            </div>`;
        el.onclick = () => {
            currentChar = ch.id;
            activeGroup = 'enemy';
            renderAll();
        };
        eList && eList.appendChild(el);
    });
}

function switchGroup(g) {
    activeGroup = g;
    if (g === 'player') {
        const list = getPartyChars().length ? getPartyChars() : yardChars;
        if (!list.find(c => c.id === currentChar)) {
            currentChar = list[0] ? list[0].id : currentChar;
        }
    } else {
        if (!enemyChars.find(c => c.id === currentChar)) {
            currentChar = enemyChars[0].id;
        }
    }
    renderAll();
}

function switchLogTab(t) {
    document.getElementById('logtab-battle').className = `tab-btn ${t === 'battle' ? 'active' : ''}`;
    document.getElementById('logtab-debug').className = `tab-btn ${t === 'debug' ? 'active' : ''}`;
    document.getElementById('ui-log-battle').style.display = t === 'battle' ? 'block' : 'none';
    document.getElementById('ui-log-debug').style.display = t === 'debug' ? 'block' : 'none';
}

function findCharForEditor(id) {
    return yardChars.find(c => c.id === id) || enemyChars.find(c => c.id === id) || null;
}

function renderEditor() {
    const editor = document.getElementById('rule-editor');
    if (!editor) return;
    const ch = findCharForEditor(currentChar);
    if (!ch) { editor.innerHTML = '<div class="hint">ルールを編集するキャラがいません。</div>'; const et0 = document.getElementById('editor-title'); if (et0) et0.innerText = 'ルールエディタ'; return; }
    const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
    const inParty = ch.isPlayer && isInParty(ch.id);
    const badge = ch.isPlayer
        ? (inParty ? '出撃' : 'ヤード待機')
        : '敵';
    const et = document.getElementById('editor-title');
    if (et) et.innerText = ch.name === cls.name ? `${ch.name}のルール` : `${ch.name}（${cls.name}）のルール`;

    if (!ruleData[ch.id]) ruleData[ch.id] = emptyRules();
    const sks = skillsForClass(ch.classId, ch.level || 1);
    let html = '';
    const rowLimit = (ch.isPlayer && typeof getRuleRowLimit === 'function') ? getRuleRowLimit() : MAX_RULES;
    // まだ開いていない行の開け方（開いた順に行が増える）
    const rowHints = [];
    if (ch.isPlayer) {
        if (typeof isLv10Reached === 'function' && !isLv10Reached()) rowHints.push('誰かがLv' + RULE_ROWS_LV10_LEVEL + 'に到達すると開きます');
        if (!(accountUnlocks.stageCleared && accountUnlocks.stageCleared[RULE_ROWS_B2_KEY])) rowHints.push('はじまりの迷宮（チャレンジ）B2 を初踏破すると開きます');
    }
    // 選択肢：使えるものを上に、未解放・未習得は下のグループにまとめる（値は元の番号のまま）
    const opts = (list, cur, isLocked, lockedLabel, labelFn) => {
        const open = [], closed = [];
        list.forEach((s, idx) => {
            const locked = isLocked(s, idx);
            const o = `<option value="${idx}" ${cur === idx ? 'selected' : ''} ${locked ? 'disabled' : ''}>${esc(labelFn ? labelFn(s, idx, locked) : (typeof s === 'string' ? s : s.name))}</option>`;
            (locked ? closed : open).push(o);
        });
        return open.join('') + (closed.length ? `<optgroup label="${esc(lockedLabel)}">${closed.join('')}</optgroup>` : '');
    };
    const condLocked = s => typeof isConditionUnlocked === 'function' && !isConditionUnlocked(s);
    const tgtLocked = s => typeof isTargetUnlocked === 'function' && !isTargetUnlocked(s);
    const visibleRows = ch.isPlayer ? Math.min(MAX_RULES, RULE_ROWS_MAX) : MAX_RULES;
    for (let i = 0; i < visibleRows; i++) {
        const r = ruleData[ch.id][i];
        if (ch.isPlayer && i >= rowLimit) {
            const hint = rowHints[i - rowLimit] || '今後のアップデートで開きます';
            html += `<div class="rule-card locked"><span class="rule-no">${i + 1}</span><span class="rule-lock">🔒 ${esc(hint)}</span></div>`;
            continue;
        }
        // 使っていない行に未解放の値が残っていたら、使えるものに直して見せる（有効にしたとき未解放が選ばれないように）
        if (ch.isPlayer && !r.active) normalizeRuleRow(ch, r);
        const condSel = `<select class="rule-sel" aria-label="${i + 1}行目の条件" onchange="updateRule(${i},'cond',+this.value)">${opts(conditions, r.cond, condLocked, '未解放（強化 → ルール解放）')}</select>`;
        const tgtSel = `<select class="rule-sel" aria-label="${i + 1}行目の対象" onchange="updateRule(${i},'tgt',+this.value)">${opts(targets, r.tgt, tgtLocked, '未解放（ルール解放・ボスのドロップ）')}</select>`;
        const actSel = `<select class="rule-sel" aria-label="${i + 1}行目のアクション" onchange="updateRule(${i},'skill',+this.value)">${opts(sks, r.skill, sk => !!sk.locked, '未習得（レベルで覚える）',
            (sk, idx, locked) => `${sk.name}${locked ? `（Lv${sk.unlockLevel}）` : ''}（${sk.uses < 0 ? '∞' : '×' + sk.uses}）`)}</select>`;
        html += `<div class="rule-card${r.active ? '' : ' off'}">
            <div class="rule-line">
                <label class="rule-switch" title="この行を使う"><input type="checkbox" ${r.active ? 'checked' : ''} onchange="updateRule(${i},'active',this.checked)"><span class="rule-no">${i + 1}</span></label>
                <span class="rule-word">もし</span>${condSel}
            </div>
            <div class="rule-line rule-line2">
                <span class="rule-word">→</span>${tgtSel}<span class="rule-word">に</span>${actSel}
            </div>
        </div>`;
    }
    html += `<div class="rule-card fallback"><span class="rule-no">${visibleRows + 1}</span><span>どの行も当てはまらないとき → <b>防御する</b></span></div>`;
    editor.innerHTML = html;
}

/** list の中で使える最初の番号（prefer が使えればそれ） */
function firstUnlockedIndex(list, isUnlocked, prefer) {
    const p = prefer != null ? list.indexOf(prefer) : -1;
    if (p >= 0 && isUnlocked(list[p])) return p;
    for (let i = 0; i < list.length; i++) if (isUnlocked(list[i])) return i;
    return 0;
}
/** ルール1行の未解放・未習得の値を、使える既定値（常に／敵1体／通常攻撃）に置き換える。変えたら true */
function normalizeRuleRow(ch, row) {
    if (!ch || !row || ch.isPlayer === false) return false;
    let changed = false;
    if (typeof isConditionUnlocked === 'function' && !isConditionUnlocked(conditions[row.cond])) {
        row.cond = firstUnlockedIndex(conditions, isConditionUnlocked, '常に'); changed = true;
    }
    if (typeof isTargetUnlocked === 'function' && !isTargetUnlocked(targets[row.tgt])) {
        row.tgt = firstUnlockedIndex(targets, isTargetUnlocked, '敵1体'); changed = true;
    }
    const sks = skillsForClass(ch.classId, ch.level || 1);
    if (!sks[row.skill] || sks[row.skill].locked) {
        const k = sks.findIndex(s => !s.locked);
        row.skill = k >= 0 ? k : 0; changed = true;
    }
    return changed;
}

function updateRule(i, k, v) {
    const ch = findCharForEditor(currentChar);
    if (!ch || !ruleData[ch.id]) return;
    ruleData[ch.id][i][k] = v;
    if (k === 'active' && v) normalizeRuleRow(ch, ruleData[ch.id][i]);
    if (typeof persist === 'function') persist();
    if (k === 'active') renderEditor();
}

function fillClassSelects() {
    const ids = (typeof BASE_CLASS_IDS !== 'undefined') ? BASE_CLASS_IDS : Object.keys(CLASS_DEFS).filter(id => CLASS_DEFS[id].tier === 1);
    const opts = ids.map(id => `<option value="${id}">${CLASS_DEFS[id].name}</option>`).join('');
    document.querySelectorAll('.cls-add').forEach(sel => { sel.innerHTML = opts; });
}



// ========== P8.3 UI 骨格 ==========
let currentScreen = 'home';
let yardDetailId = null;

function updateResourceUI() {
    const v = (typeof getResource === 'function') ? getResource() : 0;
    if (typeof storyNavDot === 'function') storyNavDot();
    ['resource-value', 'home-resource-value', 'enhance-resource-value'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof fxSetNumber === 'function') fxSetNumber(el, v, { float: id === 'resource-value' });
        else el.textContent = String(v);
    });
    const pb = document.getElementById('recruit-btn-paid');
    if (pb) pb.disabled = !canSpendResource(RECRUIT_PAID_COST);
}

function showScreen(name) {
    if (name !== currentScreen && typeof fxReleaseDeferred === 'function') fxReleaseDeferred();
    currentScreen = name || 'home';
    ['home', 'sortie', 'enhance', 'yard', 'recruit', 'expedition', 'accessory-inv', 'rule-unlock', 'ad-shop', 'train', 'chat', 'arena', 'guide'].forEach(s => {
        const el = document.getElementById('screen-' + s);
        if (el) el.style.display = (s === currentScreen) ? 'block' : 'none';
    });
    const navOf = { train: 'enhance', 'accessory-inv': 'enhance', 'rule-unlock': 'enhance', 'ad-shop': 'enhance' };
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-screen') === (navOf[currentScreen] || currentScreen));
    });
    if (typeof cloudRenderBanner === 'function') cloudRenderBanner();
    if (currentScreen === 'home') {
        renderHomeParty(); renderHomeGoals(); renderHomePlayer(); if (typeof chatCheckUnread === 'function') chatCheckUnread();
        if (typeof renderHomeQuest === 'function') renderHomeQuest();
        if (typeof storyCheck === 'function') setTimeout(storyCheck, 250);
    }
    if (currentScreen === 'guide' && typeof renderGuide === 'function') renderGuide();
    if (currentScreen === 'yard') renderYardScreen();
    if (currentScreen === 'accessory-inv' && typeof renderAccessoryInventory === 'function') renderAccessoryInventory();
    if (currentScreen === 'rule-unlock' && typeof renderRuleUnlockScreen === 'function') renderRuleUnlockScreen();
    if (currentScreen === 'ad-shop') renderAdShop();
    if (currentScreen === 'train') renderTrainScreen();
    if (currentScreen === 'arena' && typeof renderArenaScreen === 'function') renderArenaScreen();
    if (currentScreen === 'chat' && typeof renderChatScreen === 'function') renderChatScreen();
    else if (typeof chatStopPoll === 'function') chatStopPoll();
    if (currentScreen === 'recruit') renderRecruitScreen();
    if (currentScreen === 'expedition') initExpeditionScreen();
    if (currentScreen === 'sortie') {
        renderPartySetTabs();
        renderRuleWho();
        renderEditor();
    }
    updateResourceUI();
}

/** 「パーティへ」ボタン。他パーティ所属なら無効化して所属名を表示 */
function partyAddBtnHtml(charId, label, stop) {
    const other = getOtherPartySetIndexOf(charId);
    if (other >= 0) return `<button class="btn btn-sm" disabled style="opacity:.5;cursor:not-allowed;" title="他パーティに所属中">${esc(partySets[other].name)}所属</button>`;
    return `<button class="btn btn-sm btn-blue" onclick="${stop ? 'event.stopPropagation();' : ''}addToParty('${charId}')">${label}</button>`;
}

function renderPartySetTabs() {
    const boxes = document.querySelectorAll('[data-party-tabs]');
    if (!boxes.length || typeof ensurePartySets !== 'function') return;
    ensurePartySets();
    boxes.forEach(box => {
    box.innerHTML = '';
    partySets.forEach((s, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'party-set-tab' + (i === activePartySetIndex ? ' active' : '');
        const n = (s.partyIds || []).filter(id => yardChars.some(c => c.id === id)).length;
        btn.textContent = `${s.name} (${n})`;
        btn.onclick = () => switchPartySet(i);
        box.appendChild(btn);
    });
    });
}

function promptRenamePartySet() {
    if (typeof ensurePartySets !== 'function') return;
    ensurePartySets();
    const cur = partySets[activePartySetIndex];
    const n = prompt('パーティ名', cur.name);
    if (n != null) renamePartySet(activePartySetIndex, n);
}

function renderSortieYardPick() {
    const box = document.getElementById('sortie-yard-pick');
    if (!box) return;
    box.innerHTML = '';
    yardChars.forEach(ch => {
        if (isInParty(ch.id)) return;
        const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
        const el = document.createElement('div');
        el.className = 'char-card player';
        const other = getOtherPartySetIndexOf(ch.id);
        const act = other >= 0
            ? `<button class="btn btn-sm" disabled style="opacity:.5;cursor:not-allowed;">${esc(partySets[other].name)}所属</button>`
            : `<button class="btn btn-sm btn-blue" onclick="addToParty('${ch.id}')">パーティへ</button>`;
        if (other >= 0) el.style.opacity = '0.6';
        el.innerHTML = `
            <div class="char-card-name">${esc(ch.name)} <span style="font-weight:normal;font-size:10px;">[${esc(cls.name)}] Lv${ch.level || 1}</span></div>
            ${act}`;
        box.appendChild(el);
    });
    if (!box.children.length) {
        box.innerHTML = '<div class="hint">編成可能な待機キャラはいません</div>';
    }
}

function baseClassKey(classId) {
    if (typeof getBaseClassId === 'function') return getBaseClassId(classId);
    const d = CLASS_DEFS[classId];
    return (d && d.baseClassId) ? d.baseClassId : classId;
}

function renderYardScreen() {
    const list = document.getElementById('yard-list');
    if (!list) return;
    list.innerHTML = '';
    const filter = (document.getElementById('yard-filter') || {}).value || 'all';
    const sort = (document.getElementById('yard-sort') || {}).value || 'name';
    let rows = yardChars.slice();
    if (filter !== 'all') {
        rows = rows.filter(ch => baseClassKey(ch.classId) === filter);
    }
    rows.sort((a, b) => {
        if (sort === 'level') return (b.level || 1) - (a.level || 1);
        if (sort === 'class') {
            const ca = (CLASS_DEFS[a.classId] || {}).name || a.classId;
            const cb = (CLASS_DEFS[b.classId] || {}).name || b.classId;
            return ca.localeCompare(cb, 'ja') || a.name.localeCompare(b.name, 'ja');
        }
        return a.name.localeCompare(b.name, 'ja');
    });
    const yc = document.getElementById('yard-count');
    if (yc) yc.textContent = '(' + yardTotalCount() + ' / ' + yardCap() + '　表示' + rows.length + ')';
    renderRetiredList();
    renderYardParty();
    // 公開環境ではクラス指定の直接追加を隠す
    const addBar = document.getElementById('add-yard-class');
    if (addBar && addBar.parentElement) addBar.parentElement.style.display = (typeof isDevEnvironment === 'function' && !isDevEnvironment()) ? 'none' : '';

    rows.forEach(ch => {
        const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
        const inParty = isInParty(ch.id);
        const el = document.createElement('div');
        el.className = 'char-card player' + (yardDetailId === ch.id ? ' selected' : '');
        el.innerHTML = `
            <div class="char-card-name"><span class="card-stand">${standeeHtml(ch,'sm')}</span>${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)}
                <span style="font-weight:normal;font-size:10px;">[${esc(cls.name)}]</span>
                ${inParty ? '<span style="color:#2e6b3a;font-size:10px;">出撃中</span>' : ''}
            </div>
            <div class="stat-line">${statLine(ch)}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                ${inParty
                    ? `<button class="btn btn-sm" style="background:#6f6a5a;" onclick="event.stopPropagation();removeFromParty('${ch.id}')">パーティから外す</button>`
                    : partyAddBtnHtml(ch.id,'パーティに加える',true)
                }
                <a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}" onclick="event.stopPropagation();">詳細ページ</a>
            </div>`;
        list.appendChild(el);
    });

    if (yardDetailId) {
        const ch = yardChars.find(c => c.id === yardDetailId);
        if (ch) renderYardDetailPanel(ch);
        else {
            yardDetailId = null;
            const body = document.getElementById('yard-detail-body');
            if (body) body.innerHTML = '<span class="hint">一覧からキャラを選択</span>';
        }
    }
}

function renderYardDetailPanel(ch) {
    const body = document.getElementById('yard-detail-body');
    if (!body || !ch) return;
    const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
    const hist = (ch.classHistory || [ch.classId]).map(id => {
        const d = CLASS_DEFS[id];
        return d ? d.name : id;
    }).join(' → ');
    const inParty = isInParty(ch.id);
    const skills = (typeof skillsForClass === 'function') ? skillsForClass(ch.classId, ch.level || 1) : [];
    const accLabel = typeof accessoryStatusLabel === 'function' ? accessoryStatusLabel(ch) : 'アクセ: —';
    // 装備可能な空き個体一覧
    const equipOpts = [];
    if (typeof accessories !== 'undefined' && Array.isArray(accessories)) {
        accessories.forEach(acc => {
            const def = getAccessoryDef(acc.defId);
            if (!def) return;
            const owner = whoEquipsAccessory(acc.id);
            const free = !owner || owner === ch.id;
            if (!free) return;
            equipOpts.push({ id: acc.id, name: def.name, level: acc.level || 1, current: owner === ch.id });
        });
    }
    const equipSelect = equipOpts.length
        ? `<select id="yard-equip-select" style="max-width:180px;background:#f1ebdb;color:#1d1b17;border:1px solid #e2dac6;border-radius:4px;padding:4px;">
            ${equipOpts.map(o => `<option value="${o.id}" ${o.current ? 'selected' : ''}>${esc(accessoryLabel(o.id))}${o.current ? '（装備中）' : ''}</option>`).join('')}
           </select>
           <button type="button" class="btn btn-sm btn-blue" onclick="onYardEquipAccessory('${ch.id}')">装備</button>`
        : '<span class="meta">装備可能な空きアクセサリーがありません</span>';
    body.innerHTML = `
        <div class="detail-name">${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)}</div>
        <div class="detail-sub">Lv${ch.level || 1} / ${esc(cls.name)} / ${inParty ? '編成中' : '待機'}</div>
        ${bonusSummaryText(ch) ? `<div class="bonus-line">${esc(bonusSummaryText(ch))}</div>` : ''}
        <div class="stat-line" style="margin:8px 0;">${statLine(ch)}</div>
        <h3>アクセサリー</h3>
        <div class="hint">${esc(accLabel)}</div>
        <div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            ${equipSelect}
            ${ch.accessoryId ? `<button type="button" class="btn btn-sm" style="background:#6f6a5a;" onclick="onYardUnequipAccessory('${ch.id}')">外す</button>` : ''}
        </div>
        ${ssInjectPanelHtml(ch)}
        <h3>クラス履歴</h3>
        <div class="hint">${esc(hist)}</div>
        <h3>アクション</h3>
        <ul class="action-list">${skills.map(sk => `<li>${esc(sk.name)} (${sk.uses < 0 ? '∞' : '×' + sk.uses})</li>`).join('') || '<li class="meta">—</li>'}</ul>
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
            ${levelUpButtonHtml(ch)}
            ${(typeof isDevEnvironment === 'function' && isDevEnvironment()) ? `<label style="font-size:12px;color:#b3261e;">DEV Lv
                <input type="number" min="1" max="${PLAYER_LEVEL_CAP}" value="${ch.level || 1}"
                    style="width:56px;margin-left:4px;background:#f1ebdb;color:#1d1b17;border:1px solid #e2dac6;border-radius:4px;padding:4px;"
                    onchange="setCharLevel('${ch.id}', this.value); renderYardScreen();">
            </label>
            <button class="btn btn-sm" style="background:#8a5a3a;" onclick="resetCharToLv1('${ch.id}')">DEV Lv1</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="onRetireClick('${ch.id}')">引退させる</button>
            <button class="btn btn-sm" style="background:#3d5a99;" onclick="renameChar('${ch.id}')">名前</button>
            <a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}">詳細ページ</a>
            ${inParty
                ? `<button class="btn btn-sm" style="background:#6f6a5a;" onclick="removeFromParty('${ch.id}')">編成から外す</button>`
                : partyAddBtnHtml(ch.id,'編成に入れる',false)
            }
        </div>`;
}

// ========== P9.4.6 SS注入・引退・抜き出し ==========
function ssInjectPanelHtml(ch) {
    const lv = ch.level || 1;
    const p = previewExtract(ch);
    const rangeTxt = lv < 2 ? '0（Lv1 は抜き出せません）' : (p.min + '〜' + p.max);
    return `<h3>成長に使ったSS</h3>
        <div class="hint">${p.held} SS（レベル上げに使った分。引退させて抜き出すと倍率をかけて戻ります）</div>
        <div class="hint">いま引退させた場合の抜き出し見込み: ${rangeTxt} SS（Lv倍率 ×${p.lvMult.toFixed(2)} × 出撃係数 ${p.expFactor.toFixed(2)} = ×${p.mult.toFixed(2)}。出撃60回で係数1.0、少ないほど下がります）</div>`;
}

function onRetireClick(charId) {
    const ch = yardChars.find(c => c.id === charId);
    if (!ch) return;
    const p = previewExtract(ch);
    const rng = ch.level < 2 ? '0 SS（Lv1 は抜き出せません）' : (p.min + '〜' + p.max + ' SS');
    const msg = `${ch.name}（Lv${ch.level || 1}）を引退させますか？\n\n` +
        `・取り消しできません。パーティから外れ、出撃できなくなります\n` +
        `・成長に使ったSS ${p.held} は、引退後に「抜き出す」と ${rng} を受け取り、キャラは完全に消えます\n` +
        `・装備中のアクセサリーは外れて所持品に戻ります`;
    if (!confirm(msg)) return;
    const res = retireChar(charId);
    if (!res.ok) { alert(res.reason); return; }
    if (yardDetailId === charId) yardDetailId = null;
    if (typeof renderAll === 'function') renderAll();
    renderYardScreen();
}

function renderRetiredList() {
    const box = document.getElementById('retired-list');
    const cnt = document.getElementById('retired-count');
    if (cnt) cnt.textContent = '(' + retiredChars.length + ')';
    if (!box) return;
    if (!retiredChars.length) { box.innerHTML = '<span class="hint">引退したキャラはいません</span>'; return; }
    box.innerHTML = retiredChars.map(ch => {
        const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
        const p = previewExtract(ch);
        const rng = (ch.level || 1) < 2 ? '0' : (p.min + '〜' + p.max);
        const why = ch.retireReason === 'manual' ? '自分で引退' : '寿命切れ';
        return `<div class="char-card player">
            <div class="char-card-name"><span class="card-stand">${standeeHtml(ch,'sm')}</span>${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)}
                <span style="font-weight:normal;font-size:10px;">[${esc(cls.name)}] Lv${ch.level || 1} / ${why}</span></div>
            <div class="stat-line">成長に使ったSS ${p.held} × ${p.mult.toFixed(2)}（Lv ${p.lvMult.toFixed(2)} × 出撃 ${p.expFactor.toFixed(2)}） → 抜き出し見込み ${rng} SS</div>
            <div style="margin-top:4px;"><button class="btn btn-sm btn-blue" onclick="onExtractClick('${ch.id}')">抜き出す</button></div>
        </div>`;
    }).join('');
}

function onExtractClick(charId) {
    const ch = retiredChars.find(c => c.id === charId);
    if (!ch) return;
    const p = previewExtract(ch);
    const rng = (ch.level || 1) < 2 ? '0 SS' : (p.min + '〜' + p.max + ' SS');
    if (!confirm(`${ch.name} から SS を抜き出しますか？\n見込み: ${rng}（成長に使ったSS ${p.held} × ${p.mult.toFixed(2)} + 1D10。出撃係数 ${p.expFactor.toFixed(2)}）\n\nキャラはヤードから完全に削除され、元に戻せません。`)) return;
    const res = extractRetiredChar(charId);
    if (!res.ok) { alert(res.reason); return; }
    alert(`${res.name} から ${res.total} SS を抜き出した\n（成長に使ったSS ${res.held} × ${res.mult.toFixed(2)} = ${res.base} + ダイス ${res.dice}）`);
    if (typeof renderResource === 'function') renderResource();
    if (typeof renderAll === 'function') renderAll();
    renderYardScreen();
}

function onYardEquipAccessory(charId) {
    const sel = document.getElementById('yard-equip-select');
    if (!sel || !sel.value) { alert('アクセサリーを選択してください'); return; }
    const res = equipAccessory(charId, sel.value);
    if (!res.ok) { alert(res.reason || '装備に失敗しました'); return; }
    if (typeof persist === 'function') persist();
    renderYardScreen();
}
function onYardUnequipAccessory(charId) {
    unequipAccessory(charId);
    if (typeof persist === 'function') persist();
    renderYardScreen();
}


// ========== P8.4 募集画面 ==========
function pct(x) {
    // 0.0001 → "0.01%" など、不要な桁を出さない
    return (Math.round(x * 100000) / 1000) + '%';
}

function rateText(kind) {
    const rt = RECRUIT_RATES[kind];
    const normal = 1 - rt.ur - rt.rare;
    const parts = [];
    if (rt.ur > 0) parts.push(`UR ${pct(rt.ur)}`);
    parts.push(`レア ${pct(rt.rare)}`);
    parts.push(`ノーマル ${pct(normal)}`);
    return parts.join(' / ');
}

function candidateCardHtml(kind, cand, idx) {
    const cls = CLASS_DEFS[cand.classId];
    const st = candidatePreviewStats(cand);
    const gr = candidatePreviewGrowth(cand);
    const base = cls.base;
    const baseGr = getClassGrowth(cand.classId);
    const statCells = STAT_KEYS.map(k => {
        const up = (cand.initBonus[k] || 0) > 0;
        return `<span class="cand-stat${up ? ' up' : ''}">${statLabel(k)} ${st[k]}${up ? `<small>(+${cand.initBonus[k]})</small>` : ''}</span>`;
    }).join('');
    const grCells = STAT_KEYS.map(k => {
        const up = (cand.growthBonus[k] || 0) > 0;
        return `<span class="cand-stat${up ? ' up' : ''}">${statLabel(k)} ${gr[k]}${up ? `<small>(+${cand.growthBonus[k]})</small>` : ''}</span>`;
    }).join('');
    const bonus = bonusSummaryText(cand);
    return `<div class="cand-card cand-${cand.rarity}" style="--i:${idx}">
        <div style="text-align:center;margin-bottom:6px">${standeeHtml({id:null,cid:cand.cid,classId:cand.classId},'md')}</div><div class="cand-head">${rarityBadgeHtml(cand.rarity)} <span class="cand-class">${esc(cls.name)}</span></div>
        <div class="cand-bonus">${bonus ? esc(bonus) : '<span class="meta">ボーナスなし</span>'}</div>
        <div class="cand-label">Lv1 ステータス</div>
        <div class="cand-stats">${statCells}</div>
        <div class="cand-label">成長率</div>
        <div class="cand-stats">${grCells}</div>
        <button type="button" class="btn cand-join" onclick="recruitJoinClick('${kind}', ${idx})">加入させる</button>
    </div>`;
}

function recruitJoinClick(kind, idx) {
    const pool = recruitPools[kind];
    if (!pool || !pool[idx]) return;
    const c = pool[idx];
    const cls = CLASS_DEFS[c.classId].name;
    const rare = RARITY_DEFS[c.rarity].name;
    if (!confirm(`【${rare}】${cls} を加入させますか？\n（他の候補は破棄されます）`)) return;
    const ch = recruitJoin(kind, idx);
    if (ch) {
        yardDetailId = ch.id;
        alert(`${ch.name} がヤードに加入しました`);
    }
}

function renderRecruitScreen() {
    const sec = document.getElementById('screen-recruit');
    if (!sec) return;
    const label = document.getElementById('recruit-cost-label');
    if (label) label.textContent = `（SS ${RECRUIT_PAID_COST}）`;
    const rf = document.getElementById('recruit-rate-free');
    const rp = document.getElementById('recruit-rate-paid');
    if (rf) rf.textContent = rateText('free');
    if (rp) rp.textContent = rateText('paid');
    const pb = document.getElementById('recruit-btn-paid');
    if (pb) pb.disabled = !canSpendResource(RECRUIT_PAID_COST);

    ['free', 'paid'].forEach(kind => {
        const box = document.getElementById('recruit-cands-' + kind);
        if (!box) return;
        const pool = recruitPools[kind];
        const sig = recruitPoolSig(pool);
        const fresh = recruitSigSeen[kind] !== undefined && sig && sig !== recruitSigSeen[kind];
        recruitSigSeen[kind] = sig;
        if (!pool) {
            box.innerHTML = '<div class="hint">まだ募集していません</div>';
            return;
        }
        box.innerHTML = pool.map((c, i) => candidateCardHtml(kind, c, i)).join('');
        if (fresh) recruitRevealCands(box, pool);
    });
}

/* 募集の候補が新しく並んだときの演出（1人ずつ立ち上がる。レア以上は光る） */
const recruitSigSeen = { free: undefined, paid: undefined };
function recruitPoolSig(pool) {
    return pool ? pool.map(c => c.classId + ':' + c.rarity + ':' + JSON.stringify(c.initBonus || {}) + JSON.stringify(c.growthBonus || {})).join('|') : '';
}
function recruitRevealCands(box, pool) {
    box.classList.remove('cands-reveal'); void box.offsetWidth; box.classList.add('cands-reveal');
    clearTimeout(box._revealTimer);
    box._revealTimer = setTimeout(() => box.classList.remove('cands-reveal'), 1800);
    const best = pool.some(c => c.rarity === 'ur') ? 'ur' : (pool.some(c => c.rarity === 'rare') ? 'rare' : 'normal');
    if (typeof fxSound === 'function') fxSound(best === 'ur' ? 'fanfare' : (best === 'rare' ? 'chime' : 'paper'));
    if (best === 'ur' && typeof fxToast === 'function') fxToast('<b>UR の候補が現れた！</b><span>初期値ボーナスと成長率ボーナスの両方を持っています</span>', { tone: 'gold', ms: 3500 });
    try { box.scrollIntoView({ behavior: (typeof fxLite === 'function' && fxLite()) ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* 無視 */ }
}


// ========== P8.5 遠征（Phase1 確認用UI） ==========
let lastExpResult = null;

function initExpeditionScreen() {
    const dsel = document.getElementById('exp-dungeon');
    if (!dsel) return;
    if (!dsel.options.length) {
        dsel.innerHTML = Object.keys(DUNGEON_DEFS).filter(id => isDungeonPublic(id)).map(id => `<option value="${id}">${esc(DUNGEON_DEFS[id].name)}（${esc(DUNGEON_DEFS[id].tag)}）</option>`).join('');
        document.getElementById('exp-proto').innerHTML = Object.keys(RETREAT_PROTOCOLS).map(id => `<option value="${id}">${esc(RETREAT_PROTOCOLS[id].name)}</option>`).join('');
        document.getElementById('exp-proto').value = 'down';
        onExpDungeonChange();
        onExpProtoChange();
    }
    if (typeof expDryChecked === 'function') expDryChecked();   // 一般のプレイヤーにはテスト実行を出さない
    // P9.23.0 まだ入れないダンジョンには「🔒」
    [...dsel.options].forEach(o => {
        const dd = DUNGEON_DEFS[o.value];
        if (!dd) return;
        const lock = typeof isDungeonUnlocked === 'function' && !isDungeonUnlocked(o.value);
        const label = `${dd.name}（${dd.tag}）${lock ? '　🔒' : ''}`;
        if (o.textContent !== label) o.textContent = label;
    });
    renderExpInfo();
}

function onExpDungeonChange() {
    const d = DUNGEON_DEFS[document.getElementById('exp-dungeon').value];
    // 公開中のモードだけを選べるようにする
    const msel = document.getElementById('exp-mode');
    const prevMode = msel.value;
    const modes = Object.keys(MODE_DEFS).filter(id => isContentPublic(d.id, id));
    msel.innerHTML = modes.map(id => `<option value="${id}">${esc(MODE_DEFS[id].name)}</option>`).join('');
    if (modes.indexOf(prevMode) >= 0) msel.value = prevMode;
    document.getElementById('exp-stage').innerHTML = d.stages.map(s => `<option value="${s.id}">${esc(s.name)}（Lv${s.lv[0]}〜${s.lv[1]}${s.boss ? '・ボス' : ''}）</option>`).join('');
    expSceneUpdate(d);
    renderExpInfo();
}

/* ===== P9.20.0 場面の絵 ===== */
const SCENE_DUNGEON_IMG = { labyrinth: 'labyrinth', forest: 'forest', rumerk: 'rumerk' };
/** 遠征画面の上の絵を、選んでいるダンジョンに合わせる */
function expSceneUpdate(d) {
    const box = document.getElementById('exp-scene');
    if (!box) return;
    const key = d && SCENE_DUNGEON_IMG[d.id];
    if (!key) { box.style.display = 'none'; return; }
    box.style.display = '';
    const img = document.getElementById('exp-scene-img');
    if (img.dataset.key !== key) {
        img.dataset.key = key;
        img.srcset = `img/bg/${key}-sm.webp 800w, img/bg/${key}.webp 1600w`;
        img.src = `img/bg/${key}-sm.webp`;
    }
    // P9.22.1 チャレンジは同じ絵に禍々しいオーラと枠を重ねて見分けられるように
    const ms = document.getElementById('exp-mode');
    const ch = !!(ms && ms.value === 'challenge');
    box.classList.toggle('challenge', ch);
    const t = document.getElementById('exp-scene-title'), s = document.getElementById('exp-scene-sub');
    const sub = ch ? ((d.challengeEnv && d.challengeEnv.label) || '') : (d.tag || '');
    if (t.dataset.v !== d.name) { t.dataset.v = d.name; t.textContent = d.name; }
    if (s.dataset.v !== sub) { s.dataset.v = sub; s.textContent = sub; }
}

/** 起動時のタイトル：接続が終わったら（最短0.9秒・最長10秒）消す */
function bootSplashHide() {
    const el = document.getElementById('boot-splash');
    if (!el || el.dataset.out) return;
    el.dataset.out = '1';
    el.classList.add('out');
    setTimeout(() => { try { el.remove(); } catch (e) { /* 無視 */ } }, 700);
}
(function bootSplashWatch() {
    if (typeof document === 'undefined') return;
    const t0 = Date.now();
    const tick = () => {
        const sm = typeof serverMode === 'function' && serverMode();
        const ph = (typeof serverState !== 'undefined' && serverState) ? serverState.phase : 'ready';
        if (!sm || (ph !== 'init' && ph !== 'loading') || Date.now() - t0 > 10000) {
            setTimeout(bootSplashHide, Math.max(0, 900 - (Date.now() - t0)));
            return;
        }
        setTimeout(tick, 150);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
})();

function onExpProtoChange() {
    const p = RETREAT_PROTOCOLS[document.getElementById('exp-proto').value];
    const inp = document.getElementById('exp-proto-val');
    inp.min = p.min; inp.max = p.max; inp.value = p.def;
    inp.disabled = (p.id === 'none');
    document.getElementById('exp-proto-unit').textContent = p.unit;
    renderExpInfo();
}

/** P9.22.1 選んだ撤退プロトコルが何をするかを、今の N で1文に */
function expProtoHelp() {
    const box = document.getElementById('exp-proto-help');
    if (!box) return;
    const mode = (document.getElementById('exp-mode') || {}).value;
    let t;
    if (mode === 'challenge') t = 'チャレンジでは撤退できません。最後の戦闘まで進みます';
    else {
        const pr = getExpProtocol();
        if (pr.type === 'down') t = t_('戦闘のあと、倒れた仲間が {n} 人以上いれば基地へ引き返す', pr.value);
        else if (pr.type === 'healLeft') t = t_('戦闘のあと、ヒール系アクションの残り回数（全員の合計）が {n} 回以下なら基地へ引き返す', pr.value);
        else if (pr.type === 'avgHp') t = t_('戦闘のあと、パーティの平均HP（倒れた仲間は0%）が {n}% 以下なら基地へ引き返す', pr.value);
        else t = '条件を付けず、最後の戦闘まで進む';
        if (pr.type !== 'none') t += '。引き返せば稼いだ SS はそのまま、全滅すると半分になります';
        else t += '。全滅すると、稼いだ SS は半分になります';
    }
    if (box.dataset.v !== t) { box.dataset.v = t; box.textContent = t; }
}
function t_(s, n) { return s.replace('{n}', String(n)); }

function getExpProtocol() {
    const type = document.getElementById('exp-proto').value;
    const p = RETREAT_PROTOCOLS[type];
    let v = parseInt(document.getElementById('exp-proto-val').value, 10);
    if (isNaN(v)) v = p.def;
    v = Math.max(p.min, Math.min(p.max, v));
    return { type, value: v };
}

function renderExpInfo() {
    const box = document.getElementById('exp-info');
    if (!box) return;
    const d = DUNGEON_DEFS[document.getElementById('exp-dungeon').value];
    expSceneUpdate(d);
    const st = d.stages.find(s => s.id === document.getElementById('exp-stage').value);
    const mode = document.getElementById('exp-mode').value;
    if (!d || !st) return;
    expRefreshStageLabels(d, mode);
    const env = mergeEnv(d, mode);
    const md = MODE_DEFS[mode];
    // チャレンジ時は撤退プロトコルを固定
    const protoSel = document.getElementById('exp-proto');
    const protoVal = document.getElementById('exp-proto-val');
    if (mode === 'challenge') {
        if (protoSel) { protoSel.value = 'none'; protoSel.disabled = true; }
        if (protoVal) protoVal.disabled = true;
    } else {
        if (protoSel) protoSel.disabled = false;
        if (protoVal && protoSel) {
            const p = RETREAT_PROTOCOLS[protoSel.value];
            protoVal.disabled = !p || p.id === 'none';
        }
    }
    expProtoHelp();
    const lv = (mode === 'challenge' && st.challengeLv) ? st.challengeLv : st.lv;
    const sz = (mode === 'challenge' && st.challengeSize) ? st.challengeSize : st.size;
    const nb = st.battles || EXPEDITION_BATTLES[0];
    const ssEach = (mode === 'challenge' && st.challengeSsPerEnemy != null) ? st.challengeSsPerEnemy : (st.ssPerEnemy || 0);
    const hasBoss = mode === 'challenge'
        ? (Array.isArray(st.challengeBoss) && st.challengeBoss.length) || !!st.boss
        : !!st.boss;
    const parts = [
        `敵Lv${lv[0]}〜${lv[1]} / 敵${sz[0]}${sz[0]!==sz[1]?'〜'+sz[1]:''}体 / ${nb}連戦` + (hasBoss ? '（最終戦はボス）' : ''),
        `撃破 ${ssEach} SS/体（${md.purity}）`
    ];
    if (md.needDeposit) parts.push(`入場料 ${st.deposit}（全滅でロスト）`);
    else parts.push('全滅すると稼いだ SS が半分');
    if (mode === 'challenge') {
        parts.push('撤退不可・時間切れは全滅');
        if (typeof isChallengeStageUnlocked === 'function' && !isChallengeStageUnlocked(d.id, st.id)) {
            parts.push('【未解放】前提ステージ未踏破');
        }
        if (typeof getFailurePoolAmount === 'function') {
            const pool = getFailurePoolAmount(d.id, st.id);
            const per = (typeof FAILURE_POOL_CLAIM_PER_CLEAR === 'number') ? FAILURE_POOL_CLAIM_PER_CLEAR : 500;
            const dayLeft = (typeof getPoolClaimRemainingToday === 'function') ? getPoolClaimRemainingToday() : 1000;
            const claimable = Math.min(pool, per, dayLeft);
            parts.push(`失敗プール ${pool} SS（受取目安 ${claimable}）`);
            parts.push(`本日の残り受取枠 ${dayLeft} SS`);
        }
    }
    if (env.labels.length) parts.push('環境: ' + env.labels.join(' / '));
    let warn = '';
    // P9.23.0 まだ解放されていないステージ（物語の進み具合・前のエリア）
    const locked = (typeof isNormalStageUnlocked === 'function' && !isNormalStageUnlocked(d.id, st.id))
        || (mode === 'challenge' && typeof isChallengeStageUnlocked === 'function' && !isChallengeStageUnlocked(d.id, st.id));
    if (locked) warn += `<br><span class="meta exp-locked">${esc(expLockReason(d.id, st.id, mode))}</span>`;
    if (mode === 'challenge') {
        warn = '<br><span class="meta" style="color:#b3261e;">注意: 時間切れ・全滅で獲得SSと入場料を失い、寿命が全員−2されます</span>';
    }
    const partyNow = getPartyChars();
    let emptyNote = '';
    if (!partyNow.length) {
        emptyNote = yardChars.length
            ? `<div class="exp-empty">パーティが空のため出撃できません。<button type="button" class="btn btn-sm" onclick="showScreen('yard')">パーティ編集へ</button></div>`
            : `<div class="exp-empty">仲間がいません。募集で冒険者を迎えましょう（無料募集はいつでも使えます）。<button type="button" class="btn btn-sm" onclick="showScreen('recruit')">募集へ</button></div>`;
    }
    box.innerHTML = esc(parts.join('　|　')) + warn
        + `<br><span class="meta">パーティ: ${esc(partyNow.map(c => c.name + ' Lv' + (c.level || 1)).join('、') || '（空）')}　所持 SS: ${getResource()}</span>`
        + emptyNote;
    if (typeof expUpdateRunButtons === 'function') expUpdateRunButtons();
}
/** 選んでいるステージ・モードがまだ解放されていないか */
function expStageLocked() {
    const ds = document.getElementById('exp-dungeon'), ss = document.getElementById('exp-stage'), ms = document.getElementById('exp-mode');
    if (!ds || !ss || !ds.value || !ss.value) return false;
    if (typeof isNormalStageUnlocked === 'function' && !isNormalStageUnlocked(ds.value, ss.value)) return true;
    return !!(ms && ms.value === 'challenge' && typeof isChallengeStageUnlocked === 'function' && !isChallengeStageUnlocked(ds.value, ss.value));
}
/** P9.23.0 なぜ出撃できないかを1文で */
function expLockReason(dId, sId, mode) {
    const st = getStage(dId, sId);
    if (st && typeof isNormalStageUnlocked === 'function' && !isNormalStageUnlocked(dId, sId)) {
        const u = st.unlock || {};
        if (u.type === 'story') return '🔒 ギルドの依頼を進めると解放されます';
        if (u.type === 'stageClear') { const s2 = getStage(u.dungeonId, u.stageId); return `🔒 ${(DUNGEON_DEFS[u.dungeonId] || {}).name || ''} ${s2 ? s2.name : ''} を踏破すると解放されます`; }
    }
    if (mode === 'challenge' && st && st.challengeUnlock) {
        const u = st.challengeUnlock; const s2 = getStage(u.dungeonId, u.stageId);
        return `🔒 ${(DUNGEON_DEFS[u.dungeonId] || {}).name || ''} ${s2 ? s2.name : ''}（${u.mode === 'challenge' ? 'チャレンジ' : 'ノーマル'}）を踏破すると解放されます`;
    }
    return '🔒 まだ解放されていません';
}




function fillClassSelectsAndBoot() {
    fillClassSelects();
    if (typeof loadFromStorage === 'function') {
        loadFromStorage();
    }
    if (typeof ensurePartySets === 'function') ensurePartySets();
    if (typeof currentChar === 'undefined' || !currentChar) {
        currentChar = (typeof partyIds !== 'undefined' && partyIds[0]) || (yardChars[0] && yardChars[0].id);
    }
    renderAll();
    showScreen('home');
    if (typeof renderDevSsPanel === 'function') renderDevSsPanel();
}

fillClassSelectsAndBoot();


function lifespanLabel(ch) {
    if (!ch || !ch.isPlayer) return '';
    const cur = (typeof ch.lifespan === 'number') ? ch.lifespan : (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60);
    const max = ch.lifespanMax || (typeof DEFAULT_LIFESPAN !== 'undefined' ? DEFAULT_LIFESPAN : 60);
    return `寿命 ${cur}/${max}`;
}

function accessoryStatusLabel(ch) {
    if (!ch || !ch.accessoryId) return 'アクセ: 未装備';
    const inst = typeof getAccessoryInstance === 'function' ? getAccessoryInstance(ch.accessoryId) : null;
    const def = inst && typeof getAccessoryDef === 'function' ? getAccessoryDef(inst.defId) : null;
    return def ? ('アクセ: ' + def.name + ' Lv' + (inst.level || 1)) : 'アクセ: 装備中';
}

function renderAccessoryInventory() {
    const box = document.getElementById('accessory-inv-list');
    if (!box) return;
    const ss = (typeof getResource === 'function') ? getResource() : 0;
    const hdr = document.getElementById('accessory-inv-ss');
    if (hdr) hdr.textContent = ss + ' SS';
    const defs = (typeof ACCESSORY_DEFS !== 'undefined') ? ACCESSORY_DEFS : {};
    const cap = (typeof ACCESSORY_LEVEL_CAP !== 'undefined') ? ACCESSORY_LEVEL_CAP : 20;
    const lv10 = (typeof isLv10Reached === 'function') ? isLv10Reached() : true;
    const blocks = Object.keys(defs).map(defId => {
        const def = defs[defId];
        const unlocked = typeof isAccessoryTypeUnlocked === 'function' && isAccessoryTypeUnlocked(defId);
        const insts = typeof listAccessoryInstances === 'function' ? listAccessoryInstances(defId) : [];
        const udef = (typeof ACCESSORY_UNLOCK_DEFS !== 'undefined') ? ACCESSORY_UNLOCK_DEFS[defId] : null;
        const isShop = !!(udef && udef.source === 'shop');
        const dropLabel = (udef && udef.source === 'drop') ? (CLEAR_DROP_TABLE[udef.dropFrom] || {}).label || '' : '';
        const fx1 = typeof accessoryEffectsAtLevel === 'function' ? formatAccessoryEffects(accessoryEffectsAtLevel(defId, 1)) : '';
        let buy = '';
        if (isShop) {
            if (!lv10) buy = `<span class="meta">Lv${ACCESSORY_SHOP_REQUIRE_LEVEL}到達キャラがいると購入可</span>`;
            else if (insts.length >= ACCESSORY_MAX_COUNT) buy = `<span class="meta">所持上限（${ACCESSORY_MAX_COUNT}個）</span>`;
            else buy = `<button type="button" class="btn btn-sm btn-blue" ${ss >= udef.cost ? '' : 'disabled'} onclick="onPurchaseAccessory('${defId}')">${unlocked ? 'もう1つ購入' : '解放して購入'} ${udef.cost}SS</button>`;
        } else if (dropLabel) buy = `<span class="meta">入手: ${esc(dropLabel)}の踏破報酬</span>`;
        // 装備中 → Lvの高い順 → 番号順（#番号は入手順のまま）
        const sorted = insts.slice().sort((x, y) => (whoEquipsAccessory(y.id) ? 1 : 0) - (whoEquipsAccessory(x.id) ? 1 : 0) || (y.level || 1) - (x.level || 1) || accessoryNo(x.id) - accessoryNo(y.id));
        const nEq = insts.filter(x => whoEquipsAccessory(x.id)).length;
        const rows = sorted.map(inst => {
            const lv = inst.level || 1;
            const ownerId = whoEquipsAccessory(inst.id);
            const owner = ownerId ? findCharById(ownerId) : null;
            const fx = typeof accessoryEffectsAtLevel === 'function' ? formatAccessoryEffects(accessoryEffectsAtLevel(defId, lv)) : '';
            const cost = lv < cap ? ACCESSORY_UPGRADE_COST[lv + 1] : null;
            const up = cost != null
                ? `<button type="button" class="btn btn-sm btn-blue" ${ss >= cost ? '' : 'disabled'} onclick="onUpgradeAccessory('${inst.id}')">強化→Lv${lv + 1}（${cost}SS）</button>`
                : '<span class="meta">Lv上限</span>';
            const who = owner
                ? `<span class="acc-owner">装備：<b>${esc(owner.name)}</b></span>`
                : '<span class="acc-owner acc-free">未装備</span>';
            return `<div class="acc-inst">
                <div class="acc-inst-main"><span class="acc-no">#${accessoryNo(inst.id)}</span><span class="acc-lv">Lv${lv}</span><span class="acc-fx">${esc(fx)}</span>${who}</div>
                <div class="acc-inst-btns">${up}
                    <button type="button" class="btn btn-sm" onclick="accOpenEquip('${inst.id}')">${owner ? '付け替え' : '装備する'}</button>
                    ${owner ? `<button type="button" class="btn btn-sm btn-blue" onclick="onUnequipAccessory('${owner.id}')">外す</button>` : ''}</div>
            </div>`;
        }).join('');
        return `<div class="acc-block${unlocked ? '' : ' locked'}">
            <div class="acc-head"><div><div class="unlock-title">${esc(def.name)}${unlocked ? '' : ' <span class="meta">[未解放]</span>'}</div>
                <div class="hint">Lv1：${esc(fx1 || '—')}　所持 ${insts.length}/${ACCESSORY_MAX_COUNT}${nEq ? '（装備中 ' + nEq + '）' : ''}</div></div>
                <div class="unlock-actions">${buy}</div></div>
            ${rows}
        </div>`;
    });
    box.innerHTML = blocks.join('') || '<div class="hint">アクセサリー定義がありません</div>';
}

/* ---- アクセサリーを誰に装備するか選ぶ（P9.19.2） ---- */
function accOpenEquip(accId) {
    const inst = getAccessoryInstance(accId);
    if (!inst) return;
    const ownerId = whoEquipsAccessory(accId);
    const party = (typeof getPartyChars === 'function') ? getPartyChars() : [];
    const list = party.concat(yardChars.filter(c => !party.some(p => p.id === c.id)));
    let ov = document.getElementById('acc-equip');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'acc-equip'; ov.className = 'fx-overlay acc-equip-overlay';
        ov.addEventListener('click', e => { if (e.target === ov) accCloseEquip(); });
        document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="fx-card acc-equip-card"><div class="gate-eyebrow">装備するキャラを選ぶ</div>
        <h3 class="acc-equip-title">${esc(accessoryLabel(accId))}</h3>
        <div class="acc-equip-list">${list.map(ch => {
            const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
            const cur = ch.accessoryId ? accessoryLabel(ch.accessoryId) : '';
            const mine = ch.id === ownerId;
            return `<button type="button" class="acc-equip-row${mine ? ' mine' : ''}" ${mine ? 'disabled' : ''} onclick="onAccEquipTo('${accId}','${ch.id}')">
                ${standeeHtml(ch, 'sm')}<span class="acc-equip-who"><b>${esc(ch.name)}</b><small>${esc(cls.name)} Lv${ch.level || 1}${party.some(p => p.id === ch.id) ? '・出撃中' : ''}</small>
                <small>${mine ? 'このアクセサリーを装備中' : (cur ? '今の装備：' + esc(cur) + '（入れ替え）' : '装備なし')}</small></span></button>`;
        }).join('') || '<div class="hint">キャラがいません。</div>'}</div>
        ${ownerId ? `<p class="hint">いま ${esc((findCharById(ownerId) || {}).name || '')} が装備しています。別のキャラを選ぶと付け替えます。</p>` : ''}
        <button type="button" class="btn ar-log-close" onclick="accCloseEquip()">閉じる</button></div>`;
    ov.style.display = 'flex';
    requestAnimationFrame(() => ov.classList.add('fx-in'));
}
function accCloseEquip() {
    const ov = document.getElementById('acc-equip');
    if (ov) { ov.classList.remove('fx-in'); ov.style.display = 'none'; }
}
/** 選んだキャラに装備する。別のキャラが付けていたら、先に外してから付ける */
async function onAccEquipTo(accId, charId) {
    const ownerId = whoEquipsAccessory(accId);
    const srv = typeof serverMode === 'function' && serverMode() && typeof serverAct === 'function';
    if (ownerId && ownerId !== charId) {
        if (srv) { const r0 = await serverAct('accessory_equip', { charId: ownerId, accId: null }); if (!r0.ok) return; }
        else unequipAccessory(ownerId);
    }
    if (srv) { const r = await serverAct('accessory_equip', { charId: charId, accId: accId }); if (!r.ok) return; }
    else { const r = equipAccessory(charId, accId); if (!r.ok) { alert(r.reason || '装備に失敗しました'); return; } if (typeof persist === 'function') persist(); }
    accCloseEquip();
    if (typeof fxToast === 'function') fxToast('<b>' + esc((findCharById(charId) || {}).name || '') + '：' + esc(accessoryLabel(accId)) + '</b><span>装備しました</span>', { tone: 'gold', key: 'acc' });
    renderAccessoryInventory();
}
function onUnequipAccessory(charId) {
    unequipAccessory(charId);
    if (typeof persist === 'function') persist();
    renderAccessoryInventory();
}

function onPurchaseAccessory(defId) {
    const res = purchaseAccessoryUnlock(defId);
    if (!res.ok) { alert(res.reason || '解放に失敗しました'); return; }
    alert(res.newly ? 'アクセサリーを解放しました' : 'アクセサリーを購入しました');
    if (typeof renderResource === 'function') renderResource();
    renderAccessoryInventory();
}
function onUpgradeAccessory(accId) {
    const res = upgradeAccessory(accId);
    if (!res.ok) { alert(res.reason || '強化に失敗しました'); return; }
    alert('強化成功: Lv' + res.level + '（消費 ' + res.cost + ' SS）');
    if (typeof renderResource === 'function') renderResource();
    renderAccessoryInventory();
}

function renderRuleUnlockScreen() {
    const box = document.getElementById('rule-unlock-list');
    if (!box) return;
    const ss = (typeof getResource === 'function') ? getResource() : 0;
    const hdr = document.getElementById('rule-unlock-ss');
    if (hdr) hdr.textContent = ss + ' SS';

    function rowFor(kind, name, udef) {
        const unlocked = kind === 'cond'
            ? (typeof isConditionUnlocked === 'function' && isConditionUnlocked(name))
            : (typeof isTargetUnlocked === 'function' && isTargetUnlocked(name));
        let action = '';
        if (unlocked) {
            action = '<span class="meta unlock-ok">解放済</span>';
        } else if (!udef || udef.cost == null) {
            action = '<span class="meta">初期解放</span>';
        } else if (udef.cost === 'drop') {
            const from = udef.dropFrom === 'boss_fang' ? '変異体・牙王' : (udef.dropFrom === 'boss_mother' ? '胞子の母' : udef.dropFrom);
            action = `<span class="meta">ドロップ: ${from}</span>`;
        } else if (typeof udef.cost === 'number') {
            const can = ss >= udef.cost;
            const fn = kind === 'cond' ? 'onPurchaseCondition' : 'onPurchaseTarget';
            action = `<button type="button" class="btn btn-sm btn-blue" ${can ? '' : 'disabled'}
                onclick="${fn}(decodeURIComponent('${encodeURIComponent(name)}'))">解放 ${udef.cost}SS</button>`;
        }
        return `<div class="unlock-row">
            <div class="unlock-main"><div class="unlock-title">${esc(name)}</div></div>
            <div class="unlock-actions">${action}</div>
        </div>`;
    }

    let html = '<h3 class="unlock-section">条件</h3>';
    const condDefs = (typeof CONDITION_UNLOCK_DEFS !== 'undefined') ? CONDITION_UNLOCK_DEFS : {};
    // 指示書順 + 既存互換分
    const condOrder = (typeof conditions !== 'undefined') ? conditions.slice() : Object.keys(condDefs);
    condOrder.forEach(n => {
        html += rowFor('cond', n, condDefs[n] || { cost: null });
    });
    html += '<h3 class="unlock-section">対象</h3>';
    const tgtDefs = (typeof TARGET_UNLOCK_DEFS !== 'undefined') ? TARGET_UNLOCK_DEFS : {};
    const tgtOrder = (typeof targets !== 'undefined') ? targets.slice() : Object.keys(tgtDefs);
    tgtOrder.forEach(n => {
        html += rowFor('tgt', n, tgtDefs[n] || { cost: null });
    });
    box.innerHTML = html;
}

function onPurchaseCondition(name) {
    const res = purchaseConditionUnlock(name);
    if (!res.ok) { alert(res.reason || '解放に失敗しました'); return; }
    alert('条件を解放しました（' + res.cost + ' SS）');
    if (typeof renderResource === 'function') renderResource();
    renderRuleUnlockScreen();
    if (typeof renderEditor === 'function') renderEditor();
}
function onPurchaseTarget(name) {
    const res = purchaseTargetUnlock(name);
    if (!res.ok) { alert(res.reason || '解放に失敗しました'); return; }
    alert('対象を解放しました（' + res.cost + ' SS）');
    if (typeof renderResource === 'function') renderResource();
    renderRuleUnlockScreen();
    if (typeof renderEditor === 'function') renderEditor();
}

/** P9: SS 消費で 1 レベル成長 */
function onLevelUpSsClick(charId) {
    const res = levelUpWithSs(charId);
    if (!res.ok) {
        alert(res.reason || '成長に失敗しました');
        return;
    }
    alert('成長成功: Lv' + res.level + '（消費 ' + res.cost + ' SS）');
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderResource === 'function') renderResource();
}

function levelUpButtonHtml(ch) {
    if (!ch || !ch.isPlayer) return '';
    const lv = ch.level || 1;
    if (lv >= PLAYER_LEVEL_CAP) return '<span class="meta">Lv上限</span>';
    const cost = (typeof ssCostToNextLevel === 'function') ? ssCostToNextLevel(lv) : null;
    if (cost == null) return '';
    const can = typeof canSpendResource === 'function' && canSpendResource(cost);
    return `<button type="button" class="btn btn-sm btn-blue" ${can ? '' : 'disabled'}
        onclick="event.stopPropagation();onLevelUpSsClick('${ch.id}')">成長 ${cost}SS</button>`;
}

// ========== 開発環境専用 SS 操作 ==========
function devAddSs(amount) {
    if (typeof isDevEnvironment === 'function' && !isDevEnvironment()) {
        alert('開発環境でのみ使用できます');
        return;
    }
    const n = Math.floor(Number(amount) || 0);
    if (!n) return;
    if (n > 0) {
        addResource(n, { noEarn: true });
    } else {
        const cur = getResource();
        const take = Math.min(cur, -n);
        if (take > 0) spendResource(take);
    }
    if (typeof persist === 'function') persist();
    if (typeof renderResource === 'function') renderResource();
    if (typeof renderAll === 'function') renderAll();
    renderDevSsPanel();
}

function devAddSsFromInput() {
    const el = document.getElementById('dev-ss-input');
    if (!el) return;
    devAddSs(el.value);
}

/** 所持 SS を入力値そのものに設定（テスト用） */
function devSetSsFromInput() {
    if (typeof isDevEnvironment === 'function' && !isDevEnvironment()) {
        alert('開発環境でのみ使用できます');
        return;
    }
    const el = document.getElementById('dev-ss-input');
    if (!el) return;
    const n = Math.max(0, Math.floor(Number(el.value) || 0));
    if (typeof gameResource !== 'undefined') {
        gameResource = n;
    } else if (typeof addResource === 'function') {
        const cur = getResource();
        if (n > cur) addResource(n - cur, { noEarn: true });
        else if (n < cur) spendResource(cur - n);
    }
    if (typeof persist === 'function') persist();
    if (typeof renderResource === 'function') renderResource();
    if (typeof renderAll === 'function') renderAll();
    renderDevSsPanel();
}

function renderDevSsPanel() {
    const box = document.getElementById('dev-ss-panel');
    if (!box) return;
    const dev = (typeof isDevEnvironment !== 'function') || isDevEnvironment();
    if (!dev) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'inline-flex';
    const st = document.getElementById('dev-ss-status');
    if (st) st.textContent = getResource() + ' SS';
}


// ================= 祈りの欠片（広告ポイント）=================
function renderAdShop() {
    const box = document.getElementById('ad-shop-body');
    if (!box) return;
    const st = adStatus();
    const items = Object.keys(AD_SHOP).map(kind => {
        const it = AD_SHOP[kind];
        const cur = kind === 'yard' ? st.yardExtra : st.partyExtra;
        const maxed = cur >= it.maxExtra;
        const now = kind === 'yard' ? ('現在の上限 ' + yardCap() + ' 体') : ('現在 ' + partySetCount() + ' セット');
        const can = !maxed && st.points >= it.cost;
        return `<div class="unlock-row"><div class="unlock-main"><div class="unlock-title">${esc(it.label)}</div>
            <div class="hint">${esc(it.desc)}（${esc(now)}）</div></div>
            <div class="unlock-actions">${maxed ? '<span class="meta">上限</span>'
                : `<button type="button" class="btn btn-sm btn-blue" ${can ? '' : 'disabled'} onclick="onAdShopBuy('${kind}')">${it.cost} ${esc(AD_POINT_NAME)}で交換</button>`}</div></div>`;
    }).join('');
    // 冒険者名（サーバー版のみ）。最初の設定は無料、変更は祈りの欠片
    let nameRow = '';
    if (typeof serverMode === 'function' && serverMode()) {
        const nm = (typeof serverState !== 'undefined' && serverState.meta && serverState.meta.playerName) || '';
        const canChange = !nm || st.points >= PLAYER_NAME_COST;
        nameRow = `<h3 style="margin-top:14px;">冒険者名</h3><div class="unlock-row"><div class="unlock-main"><div class="unlock-title">${nm ? esc(nm) : '未設定'}</div>
            ${serverState.meta && serverState.meta.title && titleNameOf(serverState.meta.title) ? `<div class="hint">称号 ${titledNameHtml('【' + titleNameOf(serverState.meta.title) + '】' + ' ').trim()}（名前の前に表示されます。文字数には数えません）</div>` : ''}
            <div class="hint">${nm ? '名前を変えるには ' + PLAYER_NAME_COST + ' ' + esc(AD_POINT_NAME) + 'が必要です（最大' + PLAYER_NAME_MAX + '文字）' : '最初の設定は無料です（最大' + PLAYER_NAME_MAX + '文字）'}</div></div>
            <div class="unlock-actions"><button type="button" class="btn btn-sm btn-blue" ${canChange ? '' : 'disabled'} onclick="onSetPlayerName()">${nm ? PLAYER_NAME_COST + ' ' + esc(AD_POINT_NAME) + 'で変更' : '名前をつける'}</button></div></div>`;
    }
    const adsOn = (typeof adsUiEnabled === 'function') ? adsUiEnabled() : true;
    box.innerHTML = `<div class="enhance-resource">所持 ${esc(AD_POINT_NAME)}：<strong>${st.points}</strong>（上限 ${AD_POINT_CAP}）</div>
        ${adsOn ? `<div class="exp-ad"><button type="button" class="btn" ${st.today >= st.limit || st.points >= AD_POINT_CAP ? 'disabled' : ''} onclick="onClaimAdPoint()">📺 広告を見て ${esc(AD_POINT_NAME)} +${AD_POINT_PER_VIEW}</button>
        <span class="meta">本日 ${st.today} / ${st.limit} 回（日本時間0:00にリセット）${(typeof ADS !== 'undefined' && ADS.client) ? '' : '※広告SDKは未接続のためスタブ動作です'}</span></div>` : `<p class="hint">${esc(AD_POINT_NAME)}は、今後追加する広告機能で受け取れるようになります。</p>`}
        ${nameRow}
        <h3 style="margin-top:14px;">交換</h3>${items}
        <p class="hint">今後、キャラクターの装飾などもここで交換できるようにする予定です。</p>
        ${adsOn ? `<p class="hint">出撃のあとの結果画面でも、広告を見て ${esc(AD_POINT_NAME)} を受け取れます（出撃を${AD_BONUS_RUNS}回ためるごとに、SS +${Math.round(AD_BONUS_SS_RATE * 100)}% とどちらか1つ）。</p>` : ''}`;
}
async function onSetPlayerName() {
    const cur = (serverState.meta && serverState.meta.playerName) || '';
    const v = prompt(cur ? '新しい冒険者名（' + PLAYER_NAME_COST + ' ' + AD_POINT_NAME + 'を使います）' : '冒険者名を入力してください', cur);
    if (v == null) return;
    if (/[【】]/.test(v)) { alert('【】は称号用のため、名前には使えません'); return; }
    const r = await serverAct('set_player_name', { name: v });
    if (r && r.ok && typeof fxToast === 'function') fxToast('<b>冒険者名：' + esc(r.result.name) + '</b>' + (r.result.cost ? '<span>' + esc(AD_POINT_NAME) + ' −' + r.result.cost + '</span>' : ''), { tone: 'gold', sound: 'chime', key: 'pname' });
}
/* ---- 冒険者名の登録（P9.17.0：新規登録時に必ず設定。未設定の既存アカウントも次の起動時に）---- */
function pnameEnsure() {
    if (typeof serverMode !== 'function' || !serverMode()) return false;
    if (typeof serverState === 'undefined' || serverState.phase !== 'ready') return false;
    if (serverState.meta && serverState.meta.playerName) return false;
    let ov = document.getElementById('pname-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'pname-overlay'; ov.className = 'fx-overlay pname-overlay fx-in';
        ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'pname-title');
        ov.innerHTML = `<form class="fx-card pname-card" onsubmit="event.preventDefault(); pnameSubmit();">
            <div class="gate-eyebrow">冒険者台帳</div>
            <h2 id="pname-title" class="pname-title">冒険者名を決めてください</h2>
            <p class="pname-hint">チャットと闘技場で、ほかのプレイヤーに表示されます。最大${PLAYER_NAME_MAX}文字。あとから ${PLAYER_NAME_COST} ${esc(AD_POINT_NAME)}で変更できます。</p>
            <input id="pname-input" class="pname-input" maxlength="${PLAYER_NAME_MAX}" autocomplete="off" placeholder="例：灰色の剣士" required>
            <div class="pname-err" id="pname-err"></div>
            <button type="submit" class="btn pname-ok" id="pname-ok">この名前で登録</button></form>`;
        document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    setTimeout(() => { const i = document.getElementById('pname-input'); if (i) i.focus(); }, 50);
    return true;
}
async function pnameSubmit() {
    const inp = document.getElementById('pname-input'), err = document.getElementById('pname-err'), btn = document.getElementById('pname-ok');
    const v = String(inp && inp.value || '').trim();
    if (!v) { if (err) err.textContent = '名前を入力してください'; return; }
    if (/[【】]/.test(v)) { if (err) err.textContent = (typeof T === 'function' ? T('【】は称号用のため、名前には使えません') : '【】は称号用のため、名前には使えません'); return; }
    if (btn) btn.disabled = true;
    const r = await serverCall('set_player_name', { name: v });
    if (btn) btn.disabled = false;
    if (!r || !r.ok) { if (err) err.textContent = (r && r.message) || '登録できませんでした'; return; }
    const ov = document.getElementById('pname-overlay');
    if (ov) ov.remove();
    if (typeof fxToast === 'function') fxToast('<b>ようこそ、' + esc(r.result.name) + '</b><span>冒険者台帳に登録しました</span>', { tone: 'gold', sound: 'chime', key: 'pname' });
    // P9.22.0 名前の登録に続けて、ギルドマスターからの最初の依頼
    if (typeof storyAfterName === 'function') storyAfterName();
}
/** P9.24.0 称号つきの名前を HTML に。名前には【】を使えないので、先頭の【…】は必ず称号 */
function titledNameHtml(s) {
    const m = /^【([^【】]+)】(.+)$/.exec(String(s == null ? '' : s));
    if (!m) return esc(s == null ? '' : s);
    const t = (typeof T === 'function') ? T(m[1]) : m[1];
    return `<span class="ttl" data-no-i18n>【${esc(t)}】</span>${esc(m[2])}`;
}
/** 自分の表示名（称号つき） */
function myTitledName() { return (typeof serverState !== 'undefined' && serverState.meta && typeof playerDisplayName === 'function') ? playerDisplayName(serverState.meta) : ''; }
function renderHomePlayer() {
    const el = document.getElementById('home-player');
    if (!el) return;
    const nm = (typeof serverState !== 'undefined' && serverState.meta && serverState.meta.playerName) || '';
    el.innerHTML = nm ? `冒険者　<b>${titledNameHtml(myTitledName() || nm)}</b>` : '';
}
async function onClaimAdPoint() {
    const r = await claimAdPointFlow();
    if (!r.ok) { alert(r.error || r.reason || '受け取れませんでした'); }
    renderAdShop();
}
function onAdShopBuy(kind) {
    const r = purchaseAdShop(kind);
    if (!r.ok) { alert(r.reason || '交換できませんでした'); return; }
    alert('交換しました');
    if (typeof renderAll === 'function') renderAll();
    renderAdShop();
}


/* ===== P9.12.0 ホームの編成表示（アクスタ） ===== */
function renderHomeParty() {
    const row = document.getElementById('home-party-row');
    if (!row) return;
    const chars = (typeof getPartyChars === 'function') ? getPartyChars() : [];
    const lab = document.getElementById('home-party-label');
    if (lab && typeof partySets !== 'undefined' && partySets[activePartySetIndex]) lab.textContent = (partySets[activePartySetIndex].name || '出撃') + '　出撃編成';
    let html = chars.map(ch => {
        const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
        const base = standeeBaseClass(ch);
        return `<a class="mat-unit cls-${base}" href="character.html?id=${ch.id}">${standeeHtml(ch, 'md')}<span class="mat-name"><i></i>${esc(cls.name)}</span><span class="mat-lv">Lv${ch.level || 1}</span></a>`;
    }).join('');
    if (!yardChars.length) {
        row.innerHTML = `<div class="mat-callout"><b>仲間がいません</b><span>募集で冒険者を迎えましょう。無料募集はいつでも使えます。</span><button type="button" class="btn btn-sm" onclick="showScreen('recruit')">募集へ</button></div>`;
        return;
    }
    for (let i = chars.length; i < Math.min(MAX_PARTY || 4, 4); i++) html += `<button type="button" class="mat-unit mat-slot" onclick="showScreen('yard')" aria-label="パーティ編集へ"><span class="mat-empty">＋</span><span class="mat-lv">空き</span></button>`;
    row.innerHTML = html;
}
function portraitsRefreshView() {
    try { if (typeof showScreen === 'function' && typeof currentScreen !== 'undefined') showScreen(currentScreen); } catch (e) {}
}


/* ===== P9.12.0 出撃=ルール編集専用 / ヤード=パーティ組み換え専用 ===== */
function renderRuleWho() {
    const box = document.getElementById('rule-who');
    if (!box) return;
    const party = (typeof getPartyChars === 'function') ? getPartyChars() : [];
    activeGroup = 'player';
    if (!party.length) { currentChar = null; box.innerHTML = '<div class="hint">パーティが空です。<button type="button" class="btn btn-sm" onclick="showScreen(\'yard\')">パーティ編集へ</button></div>'; return; }
    if (!party.find(c => c.id === currentChar)) currentChar = party[0].id;
    box.innerHTML = party.map(ch => {
        const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
        return `<button type="button" class="who-btn${ch.id === currentChar ? ' active' : ''}" onclick="selectRuleChar('${ch.id}')">${standeeHtml(ch, 'sm')}<span>${esc(cls.name)}</span></button>`;
    }).join('');
}
function selectRuleChar(id) {
    currentChar = id; activeGroup = 'player';
    renderRuleWho(); renderEditor();
}
function renderYardParty() {
    const box = document.getElementById('yard-party');
    const pc = document.getElementById('party-count');
    const party = (typeof getPartyChars === 'function') ? getPartyChars() : [];
    if (pc) pc.textContent = '(' + party.length + '/' + MAX_PARTY + ')';
    if (!box) return;
    let html = party.map((ch, idx) => {
        const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
        return `<div class="char-card player">
            <div class="char-card-name"><span class="card-stand">${standeeHtml(ch, 'sm')}</span>${idx + 1}. ${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)}
                <span style="font-weight:normal;font-size:10px;">[${esc(cls.name)}] Lv${ch.level || 1}</span></div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                <button class="btn btn-sm" onclick="movePartyUp('${ch.id}')" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn btn-sm" onclick="movePartyDown('${ch.id}')" ${idx === party.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn btn-sm" style="background:#6f6a5a;" onclick="removeFromParty('${ch.id}')">外す</button>
                <a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}">詳細</a>
            </div></div>`;
    }).join('');
    for (let i = party.length; i < MAX_PARTY; i++) html += '<div class="char-card" style="border-style:dashed;color:#5f5849;">（空き枠）</div>';
    box.innerHTML = html;
}


/* ===== P9.13.0 設定 ===== */
function openSettings() {
    const ov = document.getElementById('settings-overlay');
    if (!ov) return;
    const fx = document.getElementById('settings-fx');
    if (fx) fx.innerHTML = (typeof fxSettingsHtml === 'function') ? fxSettingsHtml() : '';
    const ver = document.getElementById('settings-version');
    if (ver) ver.textContent = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '';
    const server = (typeof serverMode === 'function') && serverMode();
    ov.querySelectorAll('.settings-local').forEach(el => { el.style.display = server ? 'none' : ''; });
    ov.querySelectorAll('.settings-server-note').forEach(el => { el.style.display = server ? '' : 'none'; });
    ov.style.display = 'flex';
    document.addEventListener('keydown', settingsKey);
}
function closeSettings() {
    const ov = document.getElementById('settings-overlay');
    if (ov) ov.style.display = 'none';
    document.removeEventListener('keydown', settingsKey);
}
function settingsKey(e) { if (e.key === 'Escape') closeSettings(); }


/* ===== P9.13.0 次の目標（拠点）: 次に何をすれば何が開くかを並べる ===== */
function homeStageRewards(dId, sId, mode) {
    const out = [];
    Object.keys(DUNGEON_DEFS).forEach(d => (DUNGEON_DEFS[d].stages || []).forEach(s => {
        const u = s.challengeUnlock;
        if (u && u.dungeonId === dId && u.stageId === sId && (u.mode || 'normal') === mode && isContentPublic(d, 'challenge')) {
            out.push('チャレンジ「' + DUNGEON_DEFS[d].name + ' ' + s.name + '」');
        }
    }));
    if (dId + ':' + sId + ':' + mode === RULE_ROWS_B2_KEY) out.push('ルールの行 +1');
    if (typeof CLEAR_DROP_TABLE !== 'undefined' && CLEAR_DROP_TABLE[dId + ':' + mode]) out.push('アクセサリーが出ることがある');
    return out;
}
function homeGoals() {
    const goals = [];
    if (!yardChars.length) return goals;
    const party = getPartyChars();
    // 寿命が尽きそう（いちばん急ぐ）
    const dying = party.filter(c => typeof c.lifespan === 'number' && c.lifespan <= 5);
    if (dying.length) goals.push({ tone: 'warn', title: '寿命が残りわずか', detail: dying.map(c => `${c.name}（残${c.lifespan}）`).join('、'), reward: '尽きると引退。育成に使ったSSの一部を抜き出せます', go: "showScreen('yard')" });
    // Lv10
    if (typeof isLv10Reached === 'function' && !isLv10Reached()) {
        const top = yardChars.slice().sort((a, b) => (b.level || 1) - (a.level || 1))[0];
        const lv = top ? (top.level || 1) : 1;
        goals.push({ title: '誰かを Lv10 にする', reward: 'ルールの行 +1・アクセサリーの購入', progress: [Math.min(lv, 10), 10], go: "showScreen('train')" });
    }
    // ノーマルの踏破（公開中の最初の未踏破）
    let normalGoal = null, challengeGoal = null;
    // P9.22.0 迷宮の進め方は「ギルドの依頼」が示すので、ここでは出さない（依頼が終わったら従来どおり）
    const quest = (typeof storyObjective === 'function') ? storyObjective() : null;
    const questOwns = d => (d === 'labyrinth' || d === 'forest') && quest && !quest.done;
    Object.keys(DUNGEON_DEFS).forEach(d => {
        if (!isContentPublic(d, 'normal') || questOwns(d)) return;
        (DUNGEON_DEFS[d].stages || []).forEach(s => {
            if (normalGoal || isStageCleared(d, s.id, 'normal')) return;
            normalGoal = { title: `${DUNGEON_DEFS[d].name} ${s.name} を踏破`, reward: homeStageRewards(d, s.id, 'normal').join('・') || `撃破 ${s.ssPerEnemy || 0} SS/体（敵Lv${s.lv[0]}〜${s.lv[1]}）`, go: `expGoTo('${d}','${s.id}','normal')` };
        });
    });
    // チャレンジ（挑める中で最初の未踏破）
    Object.keys(DUNGEON_DEFS).forEach(d => {
        if (!isContentPublic(d, 'challenge') || questOwns(d)) return;
        (DUNGEON_DEFS[d].stages || []).forEach(s => {
            if (challengeGoal || !s.challengeUnlock || isStageCleared(d, s.id, 'challenge') || !isChallengeStageUnlocked(d, s.id)) return;
            const rw = homeStageRewards(d, s.id, 'challenge');
            rw.push('失敗プール');
            challengeGoal = { title: `${DUNGEON_DEFS[d].name} ${s.name}（チャレンジ）を踏破`, reward: rw.join('・'), go: `expGoTo('${d}','${s.id}','challenge')` };
        });
    });
    if (normalGoal) goals.push(normalGoal);
    if (challengeGoal) goals.push(challengeGoal);
    // 次に覚えるアクション（パーティ内で一番近いもの）
    let near = null;
    party.forEach(c => {
        const lv = c.level || 1;
        skillsForClass(c.classId, lv).forEach(sk => {
            if (!sk.locked || sk.unlockLevel > PLAYER_LEVEL_CAP) return;
            const gap = sk.unlockLevel - lv;
            if (!near || gap < near.gap) near = { gap, c, sk };
        });
    });
    if (near) goals.push({ title: `${near.c.name}を Lv${near.sk.unlockLevel} にする`, reward: `新しいアクション『${near.sk.name}』`, progress: [near.c.level || 1, near.sk.unlockLevel], go: "showScreen('train')" });
    return goals.slice(0, 3);
}
function renderHomeGoals() {
    const box = document.getElementById('home-goals');
    if (!box) return;
    const goals = homeGoals();
    if (!goals.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="goals-head">次の目標</div>' + goals.map(g => {
        const bar = g.progress ? `<span class="goal-bar"><i style="width:${Math.round(100 * g.progress[0] / g.progress[1])}%"></i></span><span class="goal-num">${g.progress[0]}/${g.progress[1]}</span>` : '';
        return `<button type="button" class="goal${g.tone ? ' goal-' + g.tone : ''}" onclick="${g.go}">
            <span class="goal-title">${esc(g.title)}</span>
            ${g.detail ? `<span class="goal-detail">${esc(g.detail)}</span>` : ''}
            <span class="goal-reward">${g.tone === 'warn' ? '' : '報酬：'}${esc(g.reward)}</span>
            ${bar ? `<span class="goal-prog">${bar}</span>` : ''}
        </button>`;
    }).join('');
}
/** 遠征画面を開いて、指定のステージとモードを選んだ状態にする */
function expGoTo(dId, sId, mode) {
    showScreen('expedition');
    const ds = document.getElementById('exp-dungeon');
    if (!ds) return;
    ds.value = dId; onExpDungeonChange();
    const ms = document.getElementById('exp-mode');
    if (ms && [...ms.options].some(o => o.value === mode)) ms.value = mode;
    const ss = document.getElementById('exp-stage');
    if (ss) ss.value = sId;
    renderExpInfo();
}

/** ステージの選択肢に、モードごとの敵Lvと「踏破済」「未解放」を出す */
function expRefreshStageLabels(d, mode) {
    const sel = document.getElementById('exp-stage');
    if (!sel || !d) return;
    [...sel.options].forEach(o => {
        const s = d.stages.find(x => x.id === o.value);
        if (!s) return;
        const lv = (mode === 'challenge' && s.challengeLv) ? s.challengeLv : s.lv;
        const boss = mode === 'challenge' ? (Array.isArray(s.challengeBoss) && s.challengeBoss.length) || !!s.boss : !!s.boss;
        let mark = '';
        if (typeof isStageCleared === 'function' && isStageCleared(d.id, s.id, mode)) mark = '　✓踏破済';
        else if (typeof isNormalStageUnlocked === 'function' && !isNormalStageUnlocked(d.id, s.id)) mark = '　🔒未解放';
        else if (mode === 'challenge' && typeof isChallengeStageUnlocked === 'function' && !isChallengeStageUnlocked(d.id, s.id)) mark = '　🔒未解放';
        o.textContent = `${s.name}（Lv${lv[0]}〜${lv[1]}${boss ? '・ボス' : ''}）${mark}`;
    });
}


/* ===== P9.13.1 キャラ育成（強化 → 一覧からそのままレベルアップ） ===== */
const TRAIN_BULK = 5;
let trainBusy = false;
/** lv から最大 n レベル上げるときの回数と合計費用（上限で止まる） */
function trainCostFor(lv, n) {
    let steps = 0, total = 0;
    for (let L = lv; L < PLAYER_LEVEL_CAP && steps < n; L++) {
        const c = ssCostToNextLevel(L);
        if (c == null) break;
        total += c; steps++;
    }
    return { steps, total };
}
/** 次に覚えるアクション（無ければ null） */
function trainNextSkill(ch) {
    const lv = ch.level || 1;
    let best = null;
    skillsForClass(ch.classId, lv).forEach(sk => {
        if (!sk.locked || sk.unlockLevel > PLAYER_LEVEL_CAP) return;
        if (!best || sk.unlockLevel < best.unlockLevel) best = sk;
    });
    return best;
}
function trainRowHtml(ch, ss, inParty) {
    const lv = ch.level || 1;
    const cls = CLASS_DEFS[ch.classId] || { name: ch.classId };
    let act;
    if (lv >= PLAYER_LEVEL_CAP) {
        act = '<span class="train-max">最大レベル</span>';
    } else {
        const one = ssCostToNextLevel(lv);
        const bulk = trainCostFor(lv, TRAIN_BULK);
        act = `<button type="button" class="btn btn-sm train-up" ${ss >= one && !trainBusy ? '' : 'disabled'} onclick="onTrainLevelUp('${ch.id}', 1)">Lv${lv + 1}へ　<span class="train-cost">${one} SS</span></button>`;
        if (bulk.steps > 1) {
            act += `<button type="button" class="btn btn-sm btn-blue" ${ss >= bulk.total && !trainBusy ? '' : 'disabled'} onclick="onTrainLevelUp('${ch.id}', ${bulk.steps})">+${bulk.steps}（${bulk.total} SS）</button>`;
        }
    }
    const nx = trainNextSkill(ch);
    const next = lv >= PLAYER_LEVEL_CAP ? '引退時の抜き出し倍率が最大です'
        : (nx ? `Lv${nx.unlockLevel} で『${esc(nx.name)}』を覚える` : '');
    const low = typeof ch.lifespan === 'number' && ch.lifespan <= 10;
    return `<div class="train-row${inParty ? ' in-party' : ''}" data-train-id="${ch.id}">
        <span class="card-stand">${standeeHtml(ch, 'sm')}</span>
        <div class="train-main">
            <div class="train-name">${rarityBadgeHtml(ch.rarity)} ${esc(ch.name)} <span class="meta">${[ch.name !== cls.name ? esc(cls.name) : '', inParty ? '出撃中' : ''].filter(Boolean).join('・')}</span></div>
            <div class="train-lv"><span>Lv <b>${lv}</b><span class="meta"> / ${PLAYER_LEVEL_CAP}</span></span><span class="train-bar"><i style="width:${Math.round(100 * lv / PLAYER_LEVEL_CAP)}%"></i></span><span class="meta${low ? ' train-low' : ''}">寿命 ${ch.lifespan}</span></div>
            ${next ? `<div class="train-next">${next}</div>` : ''}
            <div class="train-actions">${act}<a class="btn btn-sm btn-blue" href="character.html?id=${ch.id}">詳細</a></div>
        </div>
    </div>`;
}
function renderTrainScreen() {
    const box = document.getElementById('train-list');
    if (!box) return;
    const ss = getResource();
    const ssEl = document.getElementById('train-ss');
    if (ssEl) { if (typeof fxSetNumber === 'function') fxSetNumber(ssEl, ss); else ssEl.textContent = String(ss); }
    if (!yardChars.length) {
        box.innerHTML = '<div class="hint">キャラがいません。<button type="button" class="btn btn-sm" onclick="showScreen(\'recruit\')">募集へ</button></div>';
        return;
    }
    const order = id => { const i = partyIds.indexOf(id); return i < 0 ? 99 : i; };
    const rows = yardChars.slice().sort((a, b) => order(a.id) - order(b.id) || (b.level || 1) - (a.level || 1) || String(a.name).localeCompare(String(b.name), 'ja'));
    box.innerHTML = rows.map(ch => trainRowHtml(ch, ss, partyIds.indexOf(ch.id) >= 0)).join('');
}
/** n 回続けてレベルアップ（1回ずつサーバーへ。SS不足や上限で止まる） */
async function onTrainLevelUp(id, n) {
    if (trainBusy) return;
    trainBusy = true;
    renderTrainScreen();
    try {
        for (let i = 0; i < n; i++) {
            const ch = yardChars.find(c => c.id === id);
            if (!ch || (ch.level || 1) >= PLAYER_LEVEL_CAP) break;
            const cost = ssCostToNextLevel(ch.level || 1);
            if (cost == null || getResource() < cost) break;
            if (typeof serverMode === 'function' && serverMode()) {
                const r = await serverCall('level_up', { charId: id });
                if (!r.ok) { alert(r.message || '成長に失敗しました'); break; }
            } else {
                const r = levelUpWithSs(id);
                if (!r.ok) { alert(r.reason || '成長に失敗しました'); break; }
                if (typeof renderAll === 'function') renderAll();
            }
        }
    } finally {
        trainBusy = false;
        renderTrainScreen();
    }
}

/** 開発用：出撃のクールタイム解除（サーバー版で上書きされる） */
function devResetCooldown() { alert('サーバー版でのみ使えます'); }
