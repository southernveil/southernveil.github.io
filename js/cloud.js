/**
 * cloud.js — Phase 3a クラウドセーブ（Supabase）
 * P9.24.2 ログイン（Supabase Auth）と接続状態の管理だけ。データの読み書きはすべてサーバー（server.js → Edge Function）
 * 依存: supabase-js(CDN)。UI は cloud-ui.js（cloudRenderChip など）
 */
const CLOUD_META_KEY = 'gambit_cloud_meta_v1';
const CLOUD_RETRY_MS = [30000, 120000, 600000];
const CLOUD_BANNER_FIRST = 10;
const CLOUD_BANNER_EVERY = 50;

const cloudState = {
    status: 'init',      // init | syncing | synced | dirty | offline | conflict | loggedout
    detail: '',
    client: null,
    user: null,
    retryTimer: null,
    retryIdx: 0,
    armed: false,
    allowAnon: false     // P9.21.0 ゲストで始めることを選んだ（タイトル画面を出さずにゲストを作る）
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

/* ---------- 保存の呼び出し口（storage.js の persist() から） ----------
 * P9.24.2 データはサーバー（Edge Function）だけが保存する。ブラウザからクラウドへ直接書き込む旧方式は廃止 */
function cloudOnPersist() { /* 何もしない */ }
function cloudScheduleRetry() {
    if (cloudState.retryTimer) clearTimeout(cloudState.retryTimer);
    const ms = CLOUD_RETRY_MS[Math.min(cloudState.retryIdx, CLOUD_RETRY_MS.length - 1)];
    cloudState.retryIdx++;
    cloudState.retryTimer = setTimeout(() => {
        cloudState.retryTimer = null;
        if (cloudState.user) { if (typeof serverRefresh === 'function') serverRefresh(); } else cloudInit();
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
        if (typeof serverStartup === 'function') await serverStartup();
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
    cloudWriteMeta({ loggedOut: true, userId: null, rev: 0 });
    cloudSetStatus('loggedout', 'ログアウトしました（この端末のセーブは残っています）');
    // サーバー版はタイトル画面（始め方の選択）に戻る
    if (serverMode()) setTimeout(() => location.reload(), 200);
}
async function cloudSyncNow() {
    if (!cloudState.user) { await cloudInit(); return; }
    if (typeof serverRefresh === 'function') await serverRefresh();
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

/* ---------- 回線が戻ったとき ---------- */
window.addEventListener('online', () => {
    if (!cloudState.armed) return;
    if (!cloudState.user) { if (cloudState.status === 'offline') cloudInit(); return; }
    if (typeof serverRefresh === 'function') serverRefresh();
});
