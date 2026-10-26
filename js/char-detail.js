/**
 * char-detail.js — キャラクター詳細UI (P8.2.3: Lv20クラスチェンジ実行)
 */
function getQueryId() {
    const q = new URLSearchParams(location.search);
    return q.get('id') || '';
}

// ========== P8.6 装備タブ ==========
function closeAccessoryPicker() {
    const p = document.getElementById('equip-accessory-picker');
    if (p) p.style.display = 'none';
}

function openAccessoryPicker(charId) {
    const p = document.getElementById('equip-accessory-picker');
    const list = document.getElementById('equip-accessory-list');
    if (!p || !list) return;
    list.innerHTML = '';
    const owned = (typeof accessories !== 'undefined') ? accessories : [];
    if (!owned.length) {
        list.innerHTML = '<div class="hint">所持アクセサリーがありません</div>';
    } else {
        owned.forEach(acc => {
            const def = getAccessoryDef(acc.defId);
            if (!def) return;
            const ownerId = whoEquipsAccessory(acc.id);
            const owner = ownerId ? findCharById(ownerId) : null;
            const busy = ownerId && ownerId !== charId;
            const fx = formatAccessoryEffects(typeof accessoryEffectsAtLevel === "function" ? accessoryEffectsAtLevel(acc.defId, acc.level || 1) : (def.effects || {}));
            const div = document.createElement('div');
            div.className = 'equip-pick-item';
            div.style.cssText = 'padding:10px;border-bottom:1px solid #bdb299;';
            const isMine = ownerId === charId;
            div.innerHTML = `<div style="font-weight:700;">${esc(accessoryLabel(acc.id))}</div>
                <div class="hint">${esc(fx || '（効果なし）')}</div>
                ${busy ? `<div class="hint" style="color:#b3261e;">他キャラ装備中: ${esc(owner ? owner.name : ownerId)}（この個体は使用不可）</div>` : ''}
                ${isMine ? `<div class="hint" style="color:#2e6b3a;">このキャラが装備中</div>` : ''}
                <button type="button" class="btn btn-sm btn-blue" style="margin-top:6px;"
                    ${busy || isMine ? 'disabled' : ''}
                    onclick="onPickAccessory('${charId}','${acc.id}')">${busy ? '装備不可' : (isMine ? '装備中' : '装備する')}</button>`;
            list.appendChild(div);
        });
    }
    p.style.display = 'block';
}

function onPickAccessory(charId, accId) {
    const res = equipAccessory(charId, accId);
    if (!res.ok) {
        alert(res.reason || '装備に失敗しました');
        return;
    }
    closeAccessoryPicker();
    const ch = findCharById(charId);
    if (ch) renderEquipPanel(ch);
    if (typeof renderDetail === 'function') renderDetail(ch);
}

function onUnequipAccessory(charId) {
    unequipAccessory(charId);
    const ch = findCharById(charId);
    if (ch) {
        renderEquipPanel(ch);
        if (typeof renderDetail === 'function') renderDetail(ch);
    }
}

function renderEquipPanel(ch) {
    const nameEl = document.getElementById('equip-accessory-name');
    const fxEl = document.getElementById('equip-accessory-effects');
    const actEl = document.getElementById('equip-accessory-actions');
    if (!nameEl || !fxEl || !actEl) return;

    const accId = ch.accessoryId;
    const inst = accId ? getAccessoryInstance(accId) : null;
    const def = inst ? getAccessoryDef(inst.defId) : null;

    if (def) {
        nameEl.textContent = accessoryLabel(inst.id);
        fxEl.textContent = formatAccessoryEffects(typeof accessoryEffectsAtLevel === 'function' ? accessoryEffectsAtLevel(inst.defId, inst.level || 1) : (def.effects || {})) || '';
        actEl.innerHTML = `
            <button type="button" class="btn btn-sm btn-blue" onclick="openAccessoryPicker('${ch.id}')">変更</button>
            <button type="button" class="btn btn-sm" style="background:#6f6a5a;" onclick="onUnequipAccessory('${ch.id}')">外す</button>`;
    } else {
        nameEl.textContent = '[未装備]';
        fxEl.textContent = '';
        actEl.innerHTML = `
            <button type="button" class="btn btn-sm btn-blue" onclick="openAccessoryPicker('${ch.id}')">装備する</button>`;
    }
}

function switchDetailTab(name) {
    document.querySelectorAll('.detail-tab-panel').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.detail-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === name);
    });
    const panel = document.getElementById('tab-' + name);
    if (panel) panel.style.display = 'block';
}

function growthFor(ch) {
    if (typeof getCharGrowth === 'function') return getCharGrowth(ch, ch.classId);
    if (typeof getClassGrowth === 'function') return getClassGrowth(ch.classId);
    const def = CLASS_DEFS[ch.classId];
    return def && def.growth ? def.growth : {};
}

function formatBonusList(bonus) {
    if (!bonus || !Object.keys(bonus).length) return '<li>（なし）</li>';
    return Object.keys(bonus).map(k => {
        const v = bonus[k];
        const sign = v >= 0 ? '+' : '';
        return `<li>${k.toUpperCase()} ${sign}${v}</li>`;
    }).join('');
}

function refreshDetailPage() {
    const id = getQueryId();
    const ch = findCharById(id);
    if (!ch) return;
    renderDetail(ch);
}

function onClassChangeClick(targetClassId) {
    const id = getQueryId();
    const ch = findCharById(id);
    if (!ch) return;
    const td = getClassDef(targetClassId);
    const name = td ? td.name : targetClassId;
    const axis = td && td.axis ? td.axis : '';
    if (!confirm(`${ch.name} を【${axis}】${name} にクラスチェンジしますか？\n（固定ボーナスが適用されます。取り消しはできません）`)) {
        return;
    }
    const ok = performClassChange(id, targetClassId);
    if (ok) {
        refreshDetailPage();
        alert(`クラスチェンジ完了: ${name}`);
    }
}

function renderClassChangePanel(ch) {
    const wrap = document.getElementById('cc-mock');
    const gate = document.getElementById('cc-gate');
    if (!wrap || !gate) return;

    const def = getClassDef(ch.classId) || {};
    const lv = ch.level || 1;

    if (def.tier === 3) {
        gate.textContent = 'これ以上のクラスチェンジはありません';
        wrap.innerHTML = '<p class="hint">3次クラスです。</p>';
        return;
    }

    if (def.tier === 2 && lv < 40) {
        gate.textContent = '次のクラスチェンジは Lv40 で解放';
        wrap.innerHTML = '';
        return;
    }

    if (def.tier === 1 && lv < 20) {
        gate.textContent = 'P9: 当面クラスチェンジは無効（Lv20キャップ）';
        wrap.innerHTML = '';
        return;
    }

    if (!canClassChange(ch)) {
        gate.textContent = 'クラスチェンジ不可';
        wrap.innerHTML = '';
        return;
    }

    gate.textContent = def.tier === 1 ? 'クラスチェンジ可能（Lv20）' : 'クラスチェンジ可能（Lv40）';
    const opts = getClassChangeOptions(ch.classId) || {};
    const axes = ['陽光', '月輪'];
    let html = '<div class="cc-cards">';
    let any = false;
    axes.forEach(axis => {
        const nextId = opts[axis];
        if (!nextId) return;
        any = true;
        const nd = getClassDef(nextId) || {};
        const bonus = getClassBonus(nextId) || {};
        html += `<div class="cc-card">
            <div class="cc-card-title">${esc(nd.name || nextId)}</div>
            <div class="cc-card-path">${esc(axis)}</div>
            <ul>${formatBonusList(bonus)}</ul>
            <button type="button" class="btn btn-blue" style="margin-top:8px;"
                onclick="onClassChangeClick('${nextId}')">このクラスに変更</button>
        </div>`;
    });
    html += '</div>';
    if (!any) {
        html = '<p class="hint">派生先クラスが定義されていません。</p>';
    }
    wrap.innerHTML = html;
}

function renderDetail(ch) {
    const classDef = getClassDef(ch.classId) || CLASS_DEFS[ch.classId] || {};
    const className = classDef.name || ch.classId;
    const lv = ch.level || 1;
    const g = growthFor(ch);

    document.getElementById('detail-title').textContent = ch.name + ' — 詳細';
    document.getElementById('dh-name').textContent = ch.name;
    if (typeof standeeHtml === 'function') {
        document.getElementById('dh-stand').innerHTML = standeeHtml(ch, 'xl');
        const pb = document.getElementById('dh-portrait-btn');
        if (pb) pb.onclick = () => portraitPresetOpen(ch.id);
        const rb = document.getElementById('dh-rename-btn'), tb = document.getElementById('dh-retire-btn');
        if (rb) rb.onclick = () => onDetailRename(ch.id);
        if (tb) tb.onclick = () => onDetailRetire(ch.id);
        window.portraitsRefreshView = () => { const c = findCharById(ch.id) || ch; document.getElementById('dh-stand').innerHTML = standeeHtml(c, 'xl'); };
    }
    document.getElementById('dh-lv').textContent = 'Lv' + lv;
    try {
        const p = previewExtract(ch);
        const rng = lv < 2 ? '0（Lv1 は抜き出せません）' : (p.min + '〜' + p.max);
        document.getElementById('dh-ssinfo').innerHTML = '成長に使ったSS ' + p.held + '　／　いま引退した場合の抜き出し見込み ' + rng + ' SS';
    } catch (e) {}
    if (typeof renderLevelUpControl === 'function') renderLevelUpControl(ch);
    document.getElementById('dh-class').textContent = className;

    const pathEl = document.getElementById('dh-path');
    if (classDef.axis === '陽光' || classDef.axis === '月輪') {
        pathEl.style.display = '';
        pathEl.textContent = classDef.axis;
    } else {
        pathEl.style.display = 'none';
        pathEl.textContent = '';
    }
    document.getElementById('dh-side').textContent = ch.isPlayer ? '味方' : '敵';
    document.getElementById('dh-rarity').innerHTML = rarityBadgeHtml(ch.rarity);
    document.getElementById('dh-bonus').textContent = bonusSummaryText(ch);

    const tbody = document.querySelector('#stat-table tbody');
    tbody.innerHTML = '';
    [
        ['HP', ch.maxHp, g.hp],
        ['ATK', ch.atk, g.atk],
        ['DEF', ch.def, g.def],
        ['INT', ch.int, g.int],
        ['MND', ch.mnd, g.mnd],
        ['AGI', ch.agi, g.agi],
        ['DEX', ch.dex, g.dex]
    ].forEach(([label, val, rate]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${label}</td><td>${val}</td><td>${rate != null ? rate : '—'}</td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('class-current').textContent =
        className + (classDef.axis ? `【${classDef.axis}】` : '');

    const hist = document.getElementById('class-history');
    const history = (Array.isArray(ch.classHistory) && ch.classHistory.length)
        ? ch.classHistory
        : [ch.classId];
    hist.innerHTML = history.map((cid, i) => {
        const d = getClassDef(cid) || {};
        const nm = d.name || cid;
        const ax = d.axis ? `【${d.axis}】` : '';
        const arrow = i > 0 ? '<div class="hist-arrow">↓</div>' : '';
        return `${arrow}<div class="hist-node">${esc(nm)}${esc(ax)}</div>`;
    }).join('');

    const gbody = document.querySelector('#growth-table tbody');
    gbody.innerHTML = '';
    STAT_KEYS.forEach(k => {
        const tr = document.createElement('tr');
        const gbv = (ch.growthBonus && ch.growthBonus[k]) || 0;
        const mark = gbv ? ` <span class="bonus-mark">(個体 +${gbv})</span>` : '';
        tr.innerHTML = `<td>${k.toUpperCase()}</td><td>${g[k] != null ? g[k] : '—'}${mark}</td>`;
        gbody.appendChild(tr);
    });

    renderClassChangePanel(ch);

    const list = document.getElementById('action-list');
    list.innerHTML = '';
    const skills = skillsForClass(ch.classId, ch.level || 1);
    if (!skills.length) {
        list.innerHTML = '<li class="meta">（未設定）</li>';
    } else {
        skills.forEach(sk => {
            const li = document.createElement('li');
            if (sk.locked) li.style.opacity = '0.55';
            const uses = sk.uses < 0 ? '∞' : ('×' + sk.uses);
            const lock = sk.locked ? ` <span class="meta">[Lv${sk.unlockLevel}解放]</span>` : '';
            const ref = (sk.atkStat && sk.defStat)
                ? ` [${sk.atkStat.toUpperCase()}→${sk.defStat.toUpperCase()}]`
                : '';
            li.textContent = `${sk.name} (${uses})${ref}${sk.locked ? ' [Lv'+sk.unlockLevel+'解放]' : ''}`;
            list.appendChild(li);
        });
    }
}

function bootDetail() {
    if (typeof loadFromStorage === 'function') loadFromStorage();
    if (typeof syncMeta === 'function') syncMeta();

    const id = getQueryId();
    const ch = (typeof findCharById === 'function')
        ? findCharById(id)
        : (yardChars.find(c => c.id === id) || enemyChars.find(c => c.id === id));

    if (!ch) {
        document.getElementById('detail-missing').style.display = 'block';
        document.getElementById('detail-root').style.display = 'none';
        return;
    }
    if (!Array.isArray(ch.classHistory) || !ch.classHistory.length) {
        ch.classHistory = [ch.classId];
    }
    document.getElementById('detail-missing').style.display = 'none';
    document.getElementById('detail-root').style.display = 'block';
    renderDetail(ch);
    switchDetailTab('status');
}

bootDetail();

function renderLevelUpControl(ch) {
    const el = document.getElementById('dh-levelup');
    if (!el) return;
    if (!ch.isPlayer) { el.innerHTML = ''; return; }
    const lv = ch.level || 1;
    if (lv >= PLAYER_LEVEL_CAP) {
        el.innerHTML = '<span class="meta">レベル上限（Lv' + PLAYER_LEVEL_CAP + '）</span>';
        return;
    }
    const cost = ssCostToNextLevel(lv);
    const can = canSpendResource(cost);
    el.innerHTML = `<button type="button" class="btn btn-sm btn-blue" ${can ? '' : 'disabled'}
        onclick="onDetailLevelUp('${ch.id}')">SS ${cost} で Lv${lv + 1} へ成長</button>
        <span class="meta">所持 ${getResource()} SS</span>`;
}
function onDetailLevelUp(charId) {
    const res = levelUpWithSs(charId);
    if (!res.ok) { alert(res.reason || '失敗'); return; }
    const ch = findCharById(charId);
    if (ch) renderDetail(ch);
    alert('Lv' + res.level + ' に成長（' + res.cost + ' SS）');
}


/* P9.12.0 ヤード詳細から移した操作（サーバー接続時は server.js が上書き） */
function onDetailRename(charId) {
    if (typeof renameChar === 'function') renameChar(charId);
}
function onDetailRetire(charId) {
    const ch = findCharById(charId);
    if (!ch) return;
    if (!confirm(ch.name + ' を引退させますか？（取り消しできません）')) return;
    const res = retireChar(charId);
    if (!res.ok) { alert(res.reason); return; }
    location.href = 'index.html';
}
