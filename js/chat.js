/**
 * chat.js — P9.16.0 お知らせ と 定型チャット
 * - お知らせ（announcements）と発言（chat_messages）は Supabase から直接読む（読み取り専用。RLS で表示中のものだけ）
 * - 発言は Edge Function の chat_post（定型文の番号だけを送る。名前は冒険者名）
 * - 画面を開いている間だけ 15 秒ごとに読み直す。未読はヘッダーのボタンに印を出す
 */
const CHAT_POLL_MS = 15000;
const CHAT_SEEN_KEY = 'gambit_chat_seen_v1';   // { notice: 最後に見たお知らせID, chat: 最後に見た発言ID }
const CHAT_MUTE_KEY = 'gambit_chat_mute_v1';   // { author: 名前 } 非表示にした相手（この端末だけ）
const CHAT_NOTICE_KIND = { info: 'お知らせ', maint: 'メンテナンス', event: 'イベント', update: '更新' };

const chatState = { tab: 'notice', cat: 'greet', notices: [], msgs: [], timer: null, me: null, nextPostAt: 0, loaded: false, error: '', sending: false };

function chatLang() { return (typeof I18N !== 'undefined' && I18N.lang === 'en') ? 'en' : 'ja'; }
function chatRead(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } }
function chatWrite(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 無視 */ } }
function chatClient() {
    if (typeof serverMode !== 'function' || !serverMode() || typeof serverGetClient !== 'function') return null;
    return serverGetClient();
}
function chatPresetText(id) {
    const p = CHAT_PRESETS.find(x => x.id === id);
    if (!p) return '…';
    return (chatLang() === 'en' && p.en) ? p.en : p.ja;
}
function chatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const now = new Date();
    return d.toDateString() === now.toDateString() ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}
/** 自分の発言者ID（サーバーと同じ：ユーザーIDの SHA-256 の先頭12桁） */
async function chatMyAuthor() {
    if (chatState.me) return chatState.me;
    const uid = (typeof serverState !== 'undefined' && serverState.userId) || null;
    if (!uid || !(window.crypto && crypto.subtle)) return null;
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
        chatState.me = Array.from(new Uint8Array(buf)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
    return chatState.me;
}

/* ---- 読み込み ---- */
async function chatFetch() {
    const c = chatClient();
    if (!c) { chatState.error = 'サーバー版でのみ使えます'; return false; }
    try {
        const [n, m] = await Promise.all([
            c.from('announcements').select('id, created_at, starts_at, kind, pinned, title, body, title_en, body_en').order('id', { ascending: false }).limit(30),
            c.from('chat_messages').select('id, created_at, author, name, preset').order('id', { ascending: false }).limit(60)
        ]);
        if (n.error || m.error) throw new Error((n.error || m.error).message);
        chatState.notices = n.data || [];
        chatState.msgs = (m.data || []).slice().reverse();
        chatState.loaded = true; chatState.error = '';
        return true;
    } catch (e) {
        chatState.error = '読み込めませんでした（' + String(e && e.message || e).slice(0, 60) + '）';
        return false;
    }
}
/** 未読があるかだけ調べる（起動時・拠点に戻ったとき） */
async function chatCheckUnread() {
    // ログインが終わる前に読むと 401 になるので、サーバーにつながってから
    if (typeof serverState === 'undefined' || serverState.phase !== 'ready') return;
    const c = chatClient();
    if (!c) return;
    try {
        const [n, m] = await Promise.all([
            c.from('announcements').select('id').order('id', { ascending: false }).limit(1),
            c.from('chat_messages').select('id').order('id', { ascending: false }).limit(1)
        ]);
        const seen = chatRead(CHAT_SEEN_KEY);
        chatSetBadge((n.data && n.data[0] && n.data[0].id > (seen.notice | 0)) ? 'notice' : ((m.data && m.data[0] && m.data[0].id > (seen.chat | 0)) ? 'chat' : ''));
    } catch (e) { /* 印を出さないだけ */ }
}
function chatSetBadge(kind) {
    const b = document.getElementById('chat-btn');
    if (!b) return;
    b.classList.toggle('has-notice', kind === 'notice');
    b.classList.toggle('has-chat', kind === 'chat');
}
function chatMarkSeen() {
    const seen = chatRead(CHAT_SEEN_KEY);
    const maxN = chatState.notices.reduce((a, x) => Math.max(a, x.id | 0), 0);
    const maxM = chatState.msgs.reduce((a, x) => Math.max(a, x.id | 0), 0);
    if (chatState.tab === 'notice') seen.notice = Math.max(seen.notice | 0, maxN);
    if (chatState.tab === 'chat') seen.chat = Math.max(seen.chat | 0, maxM);
    chatWrite(CHAT_SEEN_KEY, seen);
    chatSetBadge(maxN > (seen.notice | 0) ? 'notice' : (maxM > (seen.chat | 0) ? 'chat' : ''));
}

/* ---- 画面 ---- */
function chatOpen(tab) {
    if (tab) chatState.tab = tab;
    if (typeof showScreen === 'function') showScreen('chat');
}
/** showScreen('chat') から呼ぶ */
async function renderChatScreen() {
    chatRender();
    await chatMyAuthor();
    await chatFetch();
    chatRender();
    chatMarkSeen();
    chatStartPoll();
}
function chatStartPoll() {
    chatStopPoll();
    chatState.timer = setInterval(async () => {
        if (typeof currentScreen !== 'undefined' && currentScreen !== 'chat') { chatStopPoll(); return; }
        if (document.hidden) return;
        const box = document.getElementById('chat-list');
        const atBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        if (await chatFetch()) { chatRenderList(atBottom); chatMarkSeen(); }
    }, CHAT_POLL_MS);
}
function chatStopPoll() { if (chatState.timer) { clearInterval(chatState.timer); chatState.timer = null; } }
function chatSetTab(tab) { chatState.tab = tab; chatRender(); chatMarkSeen(); }
function chatSetCat(cat) { chatState.cat = cat; chatRenderComposer(); }

function chatRender() {
    const tabs = document.getElementById('chat-tabs');
    if (tabs) {
        const seen = chatRead(CHAT_SEEN_KEY);
        const unN = chatState.notices.some(x => x.id > (seen.notice | 0));
        const unM = chatState.msgs.some(x => x.id > (seen.chat | 0));
        tabs.innerHTML = [['notice', 'お知らせ', unN], ['chat', '定型チャット', unM]].map(([k, label, un]) =>
            `<button type="button" class="chat-tab${chatState.tab === k ? ' active' : ''}${un && chatState.tab !== k ? ' unread' : ''}" onclick="chatSetTab('${k}')">${label}</button>`).join('');
    }
    const nb = document.getElementById('chat-notice-pane'), cb = document.getElementById('chat-chat-pane');
    if (nb) nb.style.display = chatState.tab === 'notice' ? '' : 'none';
    if (cb) cb.style.display = chatState.tab === 'chat' ? '' : 'none';
    chatRenderNotices();
    chatRenderList(true);
    chatRenderComposer();
}
/** 属性に入れる発言者ID（英数字だけにする） */
function chatSafeId(a) { return String(a || '').replace(/[^0-9a-z]/gi, '').slice(0, 32); }
function chatBodyHtml(t) { return esc(String(t || '')).replace(/\n/g, '<br>'); }
function chatRenderNotices() {
    const box = document.getElementById('chat-notice-pane');
    if (!box) return;
    if (chatState.error && !chatState.loaded) { box.innerHTML = `<div class="hint">${esc(chatState.error)}</div>`; return; }
    if (!chatState.loaded) { box.innerHTML = '<div class="hint">読み込み中…</div>'; return; }
    if (!chatState.notices.length) { box.innerHTML = '<div class="hint">お知らせはありません</div>'; return; }
    const seen = chatRead(CHAT_SEEN_KEY);
    const list = chatState.notices.slice().sort((a, b) => (b.pinned - a.pinned) || (b.id - a.id));
    const en = chatLang() === 'en';
    box.innerHTML = list.map(n => {
        const title = (en && n.title_en) ? n.title_en : n.title, body = (en && n.body_en) ? n.body_en : n.body;
        return `<article class="notice notice-${esc(n.kind)}${n.pinned ? ' pinned' : ''}${n.id > (seen.notice | 0) ? ' new' : ''}">
            <div class="notice-meta"><span class="notice-kind">${esc(CHAT_NOTICE_KIND[n.kind] || 'お知らせ')}</span>${n.pinned ? '<span class="notice-pin">固定</span>' : ''}<span class="notice-date">${esc(chatTime(n.starts_at || n.created_at))}</span></div>
            <h3 class="notice-title">${esc(title)}</h3>${body ? `<div class="notice-body">${chatBodyHtml(body)}</div>` : ''}</article>`;
    }).join('');
}
function chatRenderList(scrollBottom) {
    const box = document.getElementById('chat-list');
    if (!box) return;
    if (chatState.error && !chatState.loaded) { box.innerHTML = `<div class="hint">${esc(chatState.error)}</div>`; return; }
    if (!chatState.loaded) { box.innerHTML = '<div class="hint">読み込み中…</div>'; return; }
    const mute = chatRead(CHAT_MUTE_KEY);
    const msgs = chatState.msgs.filter(m => !mute[m.author]);
    const hiddenN = Object.keys(mute).length;
    box.innerHTML = (msgs.length ? msgs.map(m => {
        const mine = chatState.me && m.author === chatState.me;
        return `<div class="chat-msg${mine ? ' mine' : ''}"><div class="chat-head">${mine ? `<span class="chat-name">${titledNameHtml(m.name)}</span>`
            : `<button type="button" class="chat-name" data-author="${chatSafeId(m.author)}" onclick="chatMute(this.dataset.author)" title="この人を非表示にする">${titledNameHtml(m.name)}</button>`}<span class="chat-time">${esc(chatTime(m.created_at))}</span></div>
            <div class="chat-bubble">${esc(chatPresetText(m.preset))}</div></div>`;
    }).join('') : '<div class="hint">まだ発言はありません。下の定型文から話しかけてみましょう。</div>')
        + (hiddenN ? `<div class="chat-muted">非表示にしている人：${hiddenN}人 <button type="button" class="btn btn-sm btn-blue" onclick="chatUnmuteAll()">すべて表示に戻す</button></div>` : '');
    if (scrollBottom) box.scrollTop = box.scrollHeight;
}
function chatRenderComposer() {
    const box = document.getElementById('chat-composer');
    if (!box) return;
    const name = (typeof serverState !== 'undefined' && serverState.meta && serverState.meta.playerName) || '';
    if (!name) {
        box.innerHTML = `<div class="chat-callout"><b>冒険者名を設定すると発言できます</b><span>最初の設定は無料です</span><button type="button" class="btn btn-sm" onclick="showScreen('ad-shop')">名前をつける</button></div>`;
        return;
    }
    const wait = Math.max(0, chatState.nextPostAt - Date.now());
    const cats = CHAT_PRESET_CATS.map(c => `<button type="button" class="chat-cat${chatState.cat === c.id ? ' active' : ''}" onclick="chatSetCat('${c.id}')">${esc(chatLang() === 'en' ? c.en : c.ja)}</button>`).join('');
    const btns = CHAT_PRESETS.filter(p => p.cat === chatState.cat).map(p =>
        `<button type="button" class="chat-preset" ${wait > 0 || chatState.sending ? 'disabled' : ''} onclick="chatSend('${p.id}')">${esc(chatPresetText(p.id))}</button>`).join('');
    box.innerHTML = `<div class="chat-cats">${cats}</div><div class="chat-presets">${btns}</div>
        <div class="chat-as">${titledNameHtml(myTitledName() || name)} として発言${wait > 0 ? `<span class="chat-wait">（あと${Math.ceil(wait / 1000)}秒）</span>` : ''}</div>`;
    if (wait > 0) setTimeout(() => { if (Date.now() >= chatState.nextPostAt) chatRenderComposer(); }, Math.min(wait, 1000) + 30);
}

/* ---- 発言・非表示 ---- */
async function chatSend(presetId) {
    if (chatState.sending || Date.now() < chatState.nextPostAt) return;
    chatState.sending = true; chatRenderComposer();
    let r;
    try { r = await serverCall('chat_post', { preset: presetId }); } catch (e) { r = { ok: false, message: '送信できませんでした' }; }
    chatState.sending = false;
    if (r && r.ok) {
        chatState.nextPostAt = Date.now() + CHAT_POST_INTERVAL_MS;
        if (r.author) chatState.me = r.author;
        if (r.message && !chatState.msgs.some(m => m.id === r.message.id)) chatState.msgs.push(r.message);
        chatRenderList(true); chatMarkSeen();
    } else {
        if (r && typeof r.readyInMs === 'number') chatState.nextPostAt = Date.now() + r.readyInMs;
        if (typeof fxToast === 'function') fxToast('<b>' + esc((r && r.message) || '送信できませんでした') + '</b>', { tone: 'ink', key: 'chat' });
    }
    chatRenderComposer();
}
function chatMute(author) {
    if (!author) return;
    const hit = chatState.msgs.find(m => m.author === author);
    const name = hit ? hit.name : '';
    if (!confirm(`「${name}」の発言を非表示にしますか？（この端末だけ。あとで戻せます）`)) return;
    const m = chatRead(CHAT_MUTE_KEY); m[author] = String(name || ''); chatWrite(CHAT_MUTE_KEY, m);
    chatRenderList(false);
}
function chatUnmuteAll() { chatWrite(CHAT_MUTE_KEY, {}); chatRenderList(true); }
