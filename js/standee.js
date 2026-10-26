/* ===== P9.12.0 アクスタ駒表示 + 端末内ポートレート ===== */
const STANDEE_CLASS = {
    warrior:   { emb: 'M3 13L12 4M10 3l3 3M4 12l-1 2M6 10l2 2', deco: 'M17 44 A15 15 0 0 1 47 44 L47 39 L17 39 Z' },
    mage:      { emb: 'M8 1.5l1.8 4.4 4.7.4-3.6 3.1 1.1 4.6L8 11.4 3.9 14l1.1-4.6L1.5 6.3l4.7-.4z', deco: 'M12 38 L32 4 L52 38 Q32 31 12 38 Z' },
    cleric:    { emb: 'M8 2v12M3 6h10', deco: 'M15 48 A17 17 0 0 1 49 48 L44 48 A12 12 0 0 0 20 48 Z' },
    enchanter: { emb: 'M8 1.5L14 8 8 14.5 2 8zM8 5l3 3-3 3-3-3z', deco: 'M17 46 C14 24 50 24 47 46 C44 36 20 36 17 46 Z' }
};
function standeeBaseClass(ch) {
    let id = ch && ch.classId;
    try { const d = (typeof CLASS_DEFS !== 'undefined') && CLASS_DEFS[id]; if (d && d.baseClassId) id = d.baseClassId; } catch (e) {}
    return STANDEE_CLASS[id] ? id : 'warrior';
}

/* --- ポートレート保存（IndexedDB、この端末のみ） --- */
const PORTRAIT_URLS = {};
let __portraitDb = null;
function portraitOpen() {
    return new Promise((resolve) => {
        if (__portraitDb) return resolve(__portraitDb);
        try {
            const req = indexedDB.open('gambit-portraits', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('p');
            req.onsuccess = () => { __portraitDb = req.result; resolve(__portraitDb); };
            req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}
async function portraitsInit() {
    const db = await portraitOpen();
    if (!db) return;
    await new Promise((resolve) => {
        try {
            const tx = db.transaction('p', 'readonly');
            const req = tx.objectStore('p').openCursor();
            req.onsuccess = () => {
                const c = req.result;
                if (c) { try { PORTRAIT_URLS[c.key] = URL.createObjectURL(c.value); } catch (e) {} c.continue(); }
                else resolve();
            };
            req.onerror = () => resolve();
        } catch (e) { resolve(); }
    });
    if (typeof portraitsRefreshView === 'function') portraitsRefreshView();
}
/** rect（元画像上の切り抜き範囲 {x,y,w,h}）が無ければ、中央・少し上寄りで 2:3 に切り抜く */
function portraitCrop(file, rect) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const W = 240, H = 360, ratio = W / H;
            let sw = img.width, sh = img.height;
            if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
            let sx = (img.width - sw) / 2;
            let sy = (img.height - sh) * 0.25; // 顔が上寄りの絵が多いので少し上を基準に切り抜く
            if (rect && rect.w > 0 && rect.h > 0) { sx = rect.x; sy = rect.y; sw = rect.w; sh = rect.h; }
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
            URL.revokeObjectURL(url);
            cv.toBlob(b => b ? resolve(b) : reject(new Error('変換に失敗しました')), 'image/jpeg', 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
        img.src = url;
    });
}
async function portraitSet(id, file, rect) {
    if (!file || !/^image\//.test(file.type)) { alert('画像ファイルを選んでください'); return false; }
    if (file.size > 12 * 1024 * 1024) { alert('画像が大きすぎます（12MBまで）'); return false; }
    const db = await portraitOpen();
    if (!db) { alert('この環境では画像を保存できません'); return false; }
    let blob;
    try { blob = await portraitCrop(file, rect); } catch (e) { alert(e.message); return false; }
    await new Promise((resolve) => {
        const tx = db.transaction('p', 'readwrite');
        tx.objectStore('p').put(blob, id);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
    if (PORTRAIT_URLS[id]) { try { URL.revokeObjectURL(PORTRAIT_URLS[id]); } catch (e) {} }
    PORTRAIT_URLS[id] = URL.createObjectURL(blob);
    if (typeof portraitsRefreshView === 'function') portraitsRefreshView();
    return true;
}
async function portraitClear(id) {
    const db = await portraitOpen();
    if (db) await new Promise((resolve) => {
        const tx = db.transaction('p', 'readwrite');
        tx.objectStore('p').delete(id);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
    if (PORTRAIT_URLS[id]) { try { URL.revokeObjectURL(PORTRAIT_URLS[id]); } catch (e) {} delete PORTRAIT_URLS[id]; }
    if (typeof portraitsRefreshView === 'function') portraitsRefreshView();
}

/* --- 立ち絵のプリセット（P9.20.0） --- */
/** full: true で全身（3:4）、false で駒用の上半身（2:3） */
function portraitPresetUrl(key, full) {
    const k = (typeof portraitPresetOk === 'function' && portraitPresetOk(key)) ? key : 'warrior_m';
    return 'img/pt/' + k + (full ? '-full' : '') + '.webp';
}
/** このキャラの絵の URL。この端末で自分の画像を設定していればそれを優先 */
function portraitUrlOf(ch, full) {
    if (ch && ch.id != null && PORTRAIT_URLS[ch.id]) return PORTRAIT_URLS[ch.id];
    if (typeof portraitKeyOf !== 'function') return null;
    return portraitPresetUrl(portraitKeyOf(ch), full);
}

/* --- 駒のHTML --- */
function standeeHash(s) { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
/** size: 'sm' | 'md' | 'lg'。ch: {id, classId, lifespan?, name?} */
function standeeHtml(ch, size, opts) {
    opts = opts || {};
    size = size || 'md';
    const base = standeeBaseClass(ch);
    const def = STANDEE_CLASS[base];
    const url = portraitUrlOf(ch, size === 'xl');
    const low = typeof ch.lifespan === 'number' && ch.lifespan <= 10;
    const tilt = low ? -((standeeHash(ch.id) % 3) + 5) : 0;
    const fig = url
        ? `<img src="${url}" alt="" draggable="false" decoding="async">`
        : `<svg viewBox="0 0 64 96" aria-hidden="true"><path d="M6 96C6 72 20 64 32 64s26 8 26 32z" class="st-dark"/><circle cx="32" cy="44" r="13" fill="#f0dcc0"/><path d="${def.deco}" class="st-dark"/></svg>`;
    const life = (typeof ch.lifespan === 'number') ? ch.lifespan : '';
    const sid = ch.id != null ? ` data-stand-id="${String(ch.id).replace(/"/g, '')}"` : '';
    return `<span class="stand stand-${size} cls-${base}${low ? ' stand-low' : ''}" style="--tilt:${tilt}deg"${sid}>
        <span class="stand-fig">${fig}<span class="stand-gloss"></span></span>
        <span class="stand-base"><svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${def.emb}"/></svg>${life !== '' ? `<b>${life}</b>` : ''}</span>
    </span>`;
}

/* --- ポートレート変更UI（キャラ詳細などから呼ぶ） --- */
function portraitPick(id) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) { alert('画像ファイルを選んでください'); return; }
        if (f.size > 12 * 1024 * 1024) { alert('画像が大きすぎます（12MBまで）'); return; }
        portraitCropDialog(f, rect => portraitSet(id, f, rect));
    };
    inp.click();
}

/* --- 立ち絵を選ぶ（P9.20.0）：プリセット8枚から選ぶ／この端末だけ自分の画像を使う --- */
function portraitPresetOpen(charId) {
    const ch = (typeof findCharById === 'function') ? findCharById(charId) : null;
    if (!ch) return;
    portraitPresetClose();
    const base = (typeof getBaseClassId === 'function') ? getBaseClassId(ch.classId) : ch.classId;
    const keys = PORTRAIT_PRESETS.filter(k => portraitPresetClass(k) === base).concat(PORTRAIT_PRESETS.filter(k => portraitPresetClass(k) !== base));
    const cur = portraitKeyOf(ch), custom = !!PORTRAIT_URLS[ch.id];
    const count = {};
    const cells = keys.map(k => {
        const cls = portraitPresetClass(k);
        count[cls] = (count[cls] || 0) + 1;
        const name = ((typeof CLASS_DEFS !== 'undefined' && CLASS_DEFS[cls]) || {}).name || cls;
        const on = !custom && k === cur;
        return `<button type="button" class="pp-cell cls-${cls}${on ? ' on' : ''}" onclick="portraitPresetChoose('${String(ch.id).replace(/'/g, '')}','${k}')" aria-pressed="${on}">
            <img src="${portraitPresetUrl(k, false)}" alt="" loading="lazy" decoding="async"><span>${esc(name)} ${count[cls]}</span></button>`;
    }).join('');
    const ov = document.createElement('div');
    ov.id = 'pp-overlay'; ov.className = 'fx-overlay pp-overlay';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '立ち絵を選ぶ');
    ov.addEventListener('click', e => { if (e.target === ov) portraitPresetClose(); });
    ov.innerHTML = `<div class="fx-card pp-card">
        <div class="gate-eyebrow">${esc(ch.name)}</div>
        <div class="pp-title">立ち絵を選ぶ</div>
        <div class="pp-grid">${cells}</div>
        <div class="pp-own">
            <button type="button" class="btn btn-sm btn-blue" onclick="portraitPresetClose();portraitPick('${String(ch.id).replace(/'/g, '')}')">自分の画像を使う</button>
            ${custom ? `<button type="button" class="btn btn-sm btn-blue" onclick="portraitPresetClearOwn('${String(ch.id).replace(/'/g, '')}')">自分の画像をやめる</button>` : ''}
            <span class="meta">自分の画像はこの端末にだけ保存され、ほかのプレイヤーには見えません</span>
        </div>
        <button type="button" class="btn pp-close" onclick="portraitPresetClose()">閉じる</button>
    </div>`;
    document.body.appendChild(ov);
    ov.style.display = 'flex';
    requestAnimationFrame(() => ov.classList.add('fx-in'));
}
function portraitPresetClose() { const ov = document.getElementById('pp-overlay'); if (ov) ov.remove(); }
async function portraitPresetChoose(charId, key) {
    const ch = findCharById(charId);
    if (!ch) return;
    if (typeof serverMode === 'function' && serverMode()) {
        const r = await serverCall('set_portrait', { charId: charId, key: key });
        if (!r || !r.ok) { alert((r && r.message) || '変更できませんでした'); return; }
    } else {
        ch.portrait = key;
        if (typeof persist === 'function') persist();
    }
    const c2 = findCharById(charId);
    if (c2) c2.portrait = key;
    // プリセットを選んだら、この端末の自分の画像はやめる（選んだ絵が見えるように）
    if (PORTRAIT_URLS[charId]) await portraitClear(charId);
    portraitPresetClose();
    if (typeof portraitsRefreshView === 'function') portraitsRefreshView();
}
async function portraitPresetClearOwn(charId) {
    await portraitClear(charId);
    portraitPresetClose();
    portraitPresetOpen(charId);
}

/* --- 切り抜き位置の調整（ドラッグで移動・スライダー／ホイールで拡大） --- */
function portraitCropDialog(file, onOk) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); alert('画像を読み込めませんでした'); };
    img.onload = () => {
        const FW = 200, FH = 300;
        const base = Math.max(FW / img.width, FH / img.height);
        const st = { zoom: 1, tx: 0, ty: 0 };
        const lim = () => { const sc = base * st.zoom; return { x: Math.max(0, (img.width * sc - FW) / 2), y: Math.max(0, (img.height * sc - FH) / 2) }; };
        const clamp = () => { const l = lim(); st.tx = Math.max(-l.x, Math.min(l.x, st.tx)); st.ty = Math.max(-l.y, Math.min(l.y, st.ty)); };
        st.ty = lim().y * 0.5;   // 初期は少し上寄り（顔が入りやすい）
        const ov = document.createElement('div');
        ov.className = 'crop-overlay';
        ov.innerHTML = `<div class="crop-card" role="dialog" aria-modal="true" aria-label="ポートレートの位置を調整">
            <div class="crop-title">ポートレートの位置を調整</div>
            <div class="crop-frame" style="width:${FW}px;height:${FH}px"><img class="crop-img" alt="" draggable="false"></div>
            <label class="crop-zoom">拡大 <input type="range" min="1" max="3" step="0.01" value="1"></label>
            <div class="crop-note">ドラッグで位置を動かせます。画像はこの端末にのみ保存されます。</div>
            <div class="crop-actions"><button type="button" class="btn btn-blue crop-cancel">やめる</button><button type="button" class="btn crop-ok">この位置で決める</button></div>
        </div>`;
        document.body.appendChild(ov);
        const im = ov.querySelector('.crop-img'), frame = ov.querySelector('.crop-frame'), zoom = ov.querySelector('input[type=range]');
        im.src = url;
        const draw = () => {
            clamp();
            const sc = base * st.zoom;
            im.style.width = (img.width * sc) + 'px'; im.style.height = (img.height * sc) + 'px';
            im.style.left = (FW / 2 - img.width * sc / 2 + st.tx) + 'px'; im.style.top = (FH / 2 - img.height * sc / 2 + st.ty) + 'px';
        };
        draw();
        let drag = null;
        frame.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty }; try { frame.setPointerCapture(e.pointerId); } catch (er) { /* 無視 */ } e.preventDefault(); });
        frame.addEventListener('pointermove', e => { if (!drag) return; st.tx = drag.tx + (e.clientX - drag.x); st.ty = drag.ty + (e.clientY - drag.y); draw(); });
        const end = () => { drag = null; };
        frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
        frame.addEventListener('wheel', e => { e.preventDefault(); st.zoom = Math.max(1, Math.min(3, st.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); zoom.value = st.zoom; draw(); }, { passive: false });
        zoom.addEventListener('input', () => { st.zoom = Number(zoom.value) || 1; draw(); });
        const close = () => { ov.remove(); URL.revokeObjectURL(url); };
        ov.querySelector('.crop-cancel').onclick = close;
        ov.querySelector('.crop-ok').onclick = () => {
            const sc = base * st.zoom;
            const left = FW / 2 - img.width * sc / 2 + st.tx, top = FH / 2 - img.height * sc / 2 + st.ty;
            const rect = { x: -left / sc, y: -top / sc, w: FW / sc, h: FH / sc };
            close();
            onOk(rect);
        };
    };
    img.src = url;
}
if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => { portraitsInit(); });
