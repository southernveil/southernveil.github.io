/**
 * cloud.js — Phase 3a クラウドセーブ（Supabase）
 * 方針: ブラウザ保存が主、クラウドはバックアップ。クラウドが使えなくても従来どおり遊べる。
 * 依存: storage.js（serializeState / loadFromStorage / STORAGE_KEY）, supabase-js(CDN)
 * UI は cloud-ui.js が担当（cloudRenderChip / cloudShowConflict などを呼ぶ）。
 */
const CLOUD_META_KEY = 'gambit_cloud_meta_v1';
const CLOUD_BACKUP_KEY = 'gambit_save_backup_before_cloud';
const CLOUD_PUSH_DELAY_MS = 3000;
const CLOUD_RETRY_MS = [30000, 120000, 600000];
const CLOUD_BANNER_FIRST = 10;
const CLOUD_BANNER_EVERY = 50;

const cloudState = {
    status: 'init',      // init | syncing | synced | dirty | offline | conflict | loggedout
    detail: '',
    client: null,
    user: null,
    pushing: false,
    pushAgain: false,
    pushTimer: null,
    retryTimer: null,
    retryIdx: 0,
    dirtySeq: 0,
    armed: false,
    allowAnon: false,    // P9.21.0 ゲストで始めることを選んだ（タイトル画面を出さずにゲストを作る）
    conflict: null       // { row }
};

/* ---------- ローカルメタ（セーブ本体には入れない） ---------- */
function cloudReadMeta() {
    try {
        const m = JSON.parse(localStorage.getItem(CLOUD_META_KEY) || '{}');
        return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }
}
function cloudWriteMeta(patch) {
    const m = Object.assign(cloudReadMeta(), patch || {});
    try { localStorage.setItem(CLOUD_META_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
    return m;
}
function cloudDeviceId() {
    const m = cloudReadMeta();
    if (m.deviceId) return m.deviceId;
    let id;
    try { id = crypto.randomUUID(); } catch (e) { id = 'd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
    cloudWriteMeta({ deviceId: id });
    return id;
}

/* ---------- 状態 ---------- */
function cloudSetStatus(status, detail) {
    cloudState.status = status;
    cloudState.detail = detail || '';
    if (typeof cloudRenderChip === 'function') cloudRenderChip();
    if (typeof cloudRenderPanel === 'function') cloudRenderPanel();
    if (typeof cloudRenderBanner === 'function') cloudRenderBanner();
}
function cloudConfigured() {
    const c = window.GAMBIT_CLOUD;
    return !!(c && c.url && c.key && window.supabase && typeof window.supabase.createClient === 'function');
}
function cloudIsGuest() {
    return !!(cloudState.user && cloudState.user.is_anonymous);
}
function cloudHasLocalSave() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
}
function cloudErrMsg(e) {
    return (e && (e.message || e.error_description || e.msg)) ? String(e.message || e.error_description || e.msg) : String(e);
}

/* ---------- 保存の呼び出し口（storage.js の persist() から） ---------- */
function cloudOnPersist() {
    if (serverMode()) return;
    if (!cloudState.armed) return;
    cloudState.dirtySeq++;
    cloudWriteMeta({ dirty: true });
    if (cloudState.status === 'synced') cloudSetStatus('dirty');
    cloudSchedulePush();
}
function cloudSchedulePush() {
    if (!cloudState.client || !cloudState.user || cloudState.status === 'conflict') return;
    if (cloudState.pushTimer) clearTimeout(cloudState.pushTimer);
    cloudState.pushTimer = setTimeout(() => { cloudState.pushTimer = null; cloudPush(); }, CLOUD_PUSH_DELAY_MS);
}
function cloudScheduleRetry() {
    if (cloudState.retryTimer) clearTimeout(cloudState.retryTimer);
    const ms = CLOUD_RETRY_MS[Math.min(cloudState.retryIdx, CLOUD_RETRY_MS.length - 1)];
    cloudState.retryIdx++;
    cloudState.retryTimer = setTimeout(() => {
        cloudState.retryTimer = null;
        if (cloudState.user) cloudPush(); else cloudInit();
    }, ms);
}

/* ---------- 初期化 ---------- */
async function cloudInit() {
    cloudState.armed = true;
    if (!cloudConfigured()) {
        cloudSetStatus('offline', 'クラウドに接続できません（設定または読込失敗）');
        if (serverMode() && typeof serverOffline === 'function') serverOffline('接続できません');
        return;
    }
    try {
        if (!cloudState.client) {
            const c = window.GAMBIT_CLOUD;
            cloudState.client = window.supabase.createClient(c.url, c.key, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gambit_sb_auth' }
            });
            cloudState.client.auth.onAuthStateChange((ev, session) => {
                cloudState.user = session ? session.user : null;   // コールバック内で通信しない
                if (typeof serverOnAuth === 'function') serverOnAuth(ev, session);
                if (typeof cloudRenderPanel === 'function') cloudRenderPanel();
            });
        }
        // P9.21.0 まだ始めていない／ログアウトした人には、タイトル画面で始め方を選んでもらう
        const titleFirst = serverMode() && typeof titleOpen === 'function' && !cloudState.allowAnon;
        if (cloudReadMeta().loggedOut && titleFirst) {
            cloudSetStatus('loggedout', 'ログアウト中です');
            titleOpen();
            return;
        }
        if (cloudReadMeta().loggedOut) {
            cloudSetStatus('loggedout', 'ログアウト中です');
            if (serverMode() && typeof serverOffline === 'function') { serverOffline('ログアウト中'); serverState.phase = 'loggedout'; }
            return;
        }
        cloudSetStatus('syncing');
        const got = await cloudState.client.auth.getSession();
        let session = got && got.data ? got.data.session : null;
        if (!session && titleFirst) {
            cloudSetStatus('loggedout', 'まだ始めていません');
            titleOpen();
            return;
        }
        if (!session) {
            const captchaToken = await cloudCaptchaToken();
            const r = await cloudState.client.auth.signInAnonymously(captchaToken ? { options: { captchaToken: captchaToken } } : undefined);
            if (r.error) throw r.error;
            session = r.data.session;
        }
        cloudState.user = session.user;
        if (serverMode() && typeof serverStartup === 'function') { await serverStartup(); return; }
        await cloudStartupSync();
    } catch (e) {
        console.warn('cloudInit failed', e);
        cloudSetStatus('offline', cloudErrMsg(e));
        if (serverMode() && typeof serverOffline === 'function') serverOffline(cloudErrMsg(e));
        cloudScheduleRetry();
    }
}

/* ---------- 人間確認（Cloudflare Turnstile）：新しいアカウントを作るときだけ ---------- */
let cloudTurnstileLoading = null;
function cloudLoadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (cloudTurnstileLoading) return cloudTurnstileLoading;
    cloudTurnstileLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { cloudTurnstileLoading = null; reject(new Error('人間確認を読み込めませんでした')); };
        document.head.appendChild(s);
    });
    return cloudTurnstileLoading;
}
async function cloudCaptchaToken() {
    const key = window.GAMBIT_CLOUD && window.GAMBIT_CLOUD.turnstileSiteKey;
    if (!key) return undefined;
    await cloudLoadTurnstile();
    return new Promise((resolve, reject) => {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:99999;display:none;background:#1e1e1e;padding:14px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.6);';
        box.innerHTML = '<div style="color:#ddd;font-size:13px;margin-bottom:8px;">人間確認をお願いします</div><div class="ts-slot"></div>';
        document.body.appendChild(box);
        let wid = null, done = false;
        const finish = (fn, v) => {
            if (done) return; done = true; clearTimeout(timer);
            try { if (wid !== null) window.turnstile.remove(wid); } catch (e) { /* ignore */ }
            box.remove(); fn(v);
        };
        const timer = setTimeout(() => finish(reject, new Error('人間確認がタイムアウトしました')), 90000);
        try {
            wid = window.turnstile.render(box.querySelector('.ts-slot'), {
                sitekey: key, appearance: 'interaction-only',
                'before-interactive-callback': () => { box.style.display = 'block'; },
                callback: tok => finish(resolve, tok),
                'error-callback': () => finish(reject, new Error('人間確認に失敗しました。時間をおいて再読み込みしてください')),
                'timeout-callback': () => finish(reject, new Error('人間確認の期限が切れました'))
            });
        } catch (e) { finish(reject, e); }
    });
}

/* ---------- クラウド行の取得 ---------- */
async function cloudFetchRow() {
    const r = await cloudState.client.from('game_saves')
        .select('data, rev, updated_at, device_id, app_version')
        .eq('user_id', cloudState.user.id).maybeSingle();
    if (r.error) throw r.error;
    return r.data ? { data: r.data.data, rev: Number(r.data.rev), updatedAt: r.data.updated_at, deviceId: r.data.device_id } : null;
}

/* ---------- 起動時の判定（指示書 §5 の表） ---------- */
async function cloudStartupSync() {
    const uid = cloudState.user.id;
    let meta = cloudReadMeta();
    if (meta.userId !== uid) meta = cloudWriteMeta({ userId: uid, rev: 0 });   // 別ユーザー扱い: 初めての連携
    const row = await cloudFetchRow();
    const hasLocal = cloudHasLocalSave();

    if (!row) {                                    // クラウドにデータなし
        cloudWriteMeta({ rev: 0 });
        if (hasLocal) { cloudWriteMeta({ dirty: true }); await cloudPush(); }
        else cloudSetStatus('synced');
        return;
    }
    if (!hasLocal) { cloudApplyRow(row); return; } // 新規端末: クラウドを読み込む
    if (meta.rev === row.rev) {
        if (meta.dirty) await cloudPush(); else cloudSetStatus('synced');
        return;
    }
    if (meta.rev > 0 && meta.rev < row.rev && !meta.dirty) { cloudApplyRow(row); return; }  // 他端末で進んだ分
    cloudRaiseConflict(row);                        // 競合
}

/* ---------- 送信 ---------- */
async function cloudPush() {
    if (!cloudState.client || !cloudState.user) return false;
    if (cloudState.status === 'conflict') return false;
    if (cloudState.pushing) { cloudState.pushAgain = true; return false; }
    cloudState.pushing = true;
    if (cloudState.pushTimer) { clearTimeout(cloudState.pushTimer); cloudState.pushTimer = null; }
    cloudSetStatus('syncing');
    const seq = cloudState.dirtySeq;
    let ok = false;
    try {
        const meta = cloudReadMeta();
        const payload = serializeState();
        const r = await cloudState.client.rpc('save_game', {
            p_data: payload,
            p_expected_rev: meta.rev | 0,
            p_app_version: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : null,
            p_device_id: cloudDeviceId()
        });
        if (r.error) throw r.error;
        const res = Array.isArray(r.data) ? r.data[0] : r.data;
        if (res && res.saved) {
            const stillDirty = (seq !== cloudState.dirtySeq);
            cloudWriteMeta({ rev: Number(res.new_rev), dirty: stillDirty, lastSync: Date.now() });
            cloudState.retryIdx = 0;
            ok = true;
            cloudSetStatus(stillDirty ? 'dirty' : 'synced');
            if (stillDirty) cloudSchedulePush();
        } else {
            const row = await cloudFetchRow();
            if (row) cloudRaiseConflict(row);
            else { cloudWriteMeta({ rev: 0 }); cloudSetStatus('offline', '保存に失敗しました（再試行します）'); cloudScheduleRetry(); }
        }
    } catch (e) {
        console.warn('cloudPush failed', e);
        cloudSetStatus('offline', cloudErrMsg(e));
        cloudScheduleRetry();
    } finally {
        cloudState.pushing = false;
        if (cloudState.pushAgain) { cloudState.pushAgain = false; if (ok) cloudSchedulePush(); }
    }
    return ok;
}

/* ---------- クラウドのデータをこの端末へ ---------- */
function cloudApplyRow(row) {
    let prev = null;
    try { prev = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(row.data));
        if (!loadFromStorage()) throw new Error('クラウドのデータを読み込めませんでした');
    } catch (e) {
        try { if (prev != null) localStorage.setItem(STORAGE_KEY, prev); } catch (e2) { /* ignore */ }
        try { loadFromStorage(); } catch (e3) { /* ignore */ }
        cloudSetStatus('offline', cloudErrMsg(e));
        return false;
    }
    if (prev != null) { try { localStorage.setItem(CLOUD_BACKUP_KEY, prev); } catch (e) { /* ignore */ } }
    cloudWriteMeta({ rev: row.rev, dirty: false, lastSync: Date.now() });
    cloudState.conflict = null;
    if (typeof ensurePartySets === 'function') ensurePartySets();
    if (typeof renderAll === 'function') renderAll();
    if (typeof showScreen === 'function' && typeof currentScreen !== 'undefined') showScreen(currentScreen);
    cloudSetStatus('synced');
    return true;
}

/* ---------- 競合 ---------- */
function cloudSummarize(data) {
    if (!data) return null;
    const chars = Array.isArray(data.yardChars) ? data.yardChars : [];
    return {
        savedAt: data.savedAt || '',
        ss: data.resource | 0,
        chars: chars.length,
        maxLv: chars.reduce((m, c) => Math.max(m, c.level | 0), 0)
    };
}
function cloudRaiseConflict(row) {
    cloudState.conflict = { row: row };
    cloudSetStatus('conflict', '端末とクラウドのデータが食い違っています');
    if (typeof cloudShowConflict === 'function') cloudShowConflict();
}
async function cloudResolveConflict(choice) {
    const c = cloudState.conflict;
    if (!c) return;
    if (choice === 'cloud') {
        cloudApplyRow(c.row);
    } else {
        cloudWriteMeta({ rev: c.row.rev, dirty: true });
        cloudState.conflict = null;
        cloudSetStatus('dirty');
        await cloudPush();
    }
}

/* ---------- ログイン操作 ---------- */
function cloudRedirectUrl() {
    return location.origin + location.pathname;
}
async function cloudLinkGoogle() {
    if (!cloudState.client || !cloudState.user) return 'クラウドに接続できていません';
    const r = await cloudState.client.auth.linkIdentity({ provider: 'google', options: { redirectTo: cloudRedirectUrl() } });
    return r.error ? cloudErrMsg(r.error) : '';
}
async function cloudSignInGoogle() {
    if (!cloudState.client) return 'クラウドに接続できていません';
    cloudWriteMeta({ loggedOut: false });
    const r = await cloudState.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: cloudRedirectUrl() } });
    return r.error ? cloudErrMsg(r.error) : '';
}
async function cloudStartGuest() {
    cloudState.allowAnon = true;
    cloudWriteMeta({ loggedOut: false });
    await cloudInit();
}
async function cloudLogout() {
    if (!cloudState.client) return;
    try { await cloudState.client.auth.signOut(); } catch (e) { console.warn(e); }
    cloudState.user = null;
    if (cloudState.pushTimer) { clearTimeout(cloudState.pushTimer); cloudState.pushTimer = null; }
    cloudWriteMeta({ loggedOut: true, userId: null, rev: 0 });
    cloudSetStatus('loggedout', 'ログアウトしました（この端末のセーブは残っています）');
    // サーバー版はタイトル画面（始め方の選択）に戻る
    if (serverMode()) setTimeout(() => location.reload(), 200);
}
async function cloudSyncNow() {
    if (serverMode()) { if (!cloudState.user) await cloudInit(); else await serverRefresh(); return; }
    if (!cloudState.user) { await cloudInit(); return; }
    cloudWriteMeta({ dirty: true });
    cloudState.retryIdx = 0;
    await cloudPush();
}

/* ---------- 出撃回数とバナー ---------- */
function cloudNoteSortie() {
    const m = cloudReadMeta();
    cloudWriteMeta({ sorties: (m.sorties | 0) + 1 });
}
function cloudBannerVisible() {
    if (!cloudIsGuest() || cloudState.status === 'loggedout') return false;
    const m = cloudReadMeta();
    const at = (typeof m.bannerAt === 'number') ? m.bannerAt : CLOUD_BANNER_FIRST;
    return (m.sorties | 0) >= at;
}
function cloudDismissBanner() {
    const m = cloudReadMeta();
    cloudWriteMeta({ bannerAt: (m.sorties | 0) + CLOUD_BANNER_EVERY });
    if (typeof cloudRenderBanner === 'function') cloudRenderBanner();
}

/* ---------- 復帰時の送信 ---------- */
window.addEventListener('online', () => {
    if (!cloudState.armed) return;
    if (!cloudState.user) { if (cloudState.status === 'offline') cloudInit(); return; }
    if (cloudReadMeta().dirty) cloudSchedulePush();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && cloudState.armed && cloudReadMeta().dirty && cloudState.user && cloudState.status !== 'conflict') cloudPush();
});
