/**
 * cloud-ui.js — Phase 3a クラウド同期の画面部品（状態表示・設定パネル・連携バナー・競合ダイアログ）
 * ui.js の起動処理のあとに読み込み、最後に cloudInit() を呼ぶ。
 */
const CLOUD_STATUS_LABEL = {
    init: '接続中', syncing: '同期中', synced: '同期済み', dirty: '未同期あり',
    offline: 'オフライン', conflict: '競合あり', loggedout: 'ログアウト中'
};

function cloudEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cloudFmtTime(ms) {
    if (!ms) return '—';
    try { return new Date(ms).toLocaleString(); } catch (e) { return '—'; }
}

function cloudRenderChip() {
    const el = document.getElementById('cloud-chip');
    if (!el) return;
    const st = cloudState.status;
    const label = (serverMode() && st === 'offline') ? 'オフライン（閲覧のみ）' : (CLOUD_STATUS_LABEL[st] || st);
    // 狭い画面では「同期済み」のときだけアイコンのみにする（P9.20.0）
    el.innerHTML = '<span class="cc-ic" aria-hidden="true">☁</span><span class="cc-t"></span>';
    el.lastChild.textContent = label;
    el.setAttribute('aria-label', label);
    el.className = 'cloud-chip cloud-' + st;
    el.title = cloudState.detail || 'クラウドセーブの設定を開く';
}

/* ---------- 設定パネル ---------- */
function cloudOpenPanel() {
    let box = document.getElementById('cloud-panel');
    if (!box) {
        box = document.createElement('div');
        box.id = 'cloud-panel';
        box.className = 'cloud-overlay';
        box.addEventListener('click', (e) => { if (e.target === box) cloudClosePanel(); });
        document.body.appendChild(box);
    }
    box.style.display = 'flex';
    cloudRenderPanel();
}
function cloudClosePanel() {
    const box = document.getElementById('cloud-panel');
    if (box) box.style.display = 'none';
}
function cloudRenderPanel() {
    const box = document.getElementById('cloud-panel');
    if (!box || box.style.display === 'none') return;
    const u = cloudState.user;
    const meta = cloudReadMeta();
    let who;
    if (cloudState.status === 'loggedout') who = 'ログアウト中';
    else if (!u) who = '未ログイン（オフライン）';
    else if (u.is_anonymous) who = 'ゲスト（Google 未連携）';
    else who = 'Google 連携済み' + (u.email ? '（' + u.email + '）' : '');
    const guest = cloudIsGuest();
    const loggedOut = cloudState.status === 'loggedout';
    let btns = '';
    if (guest) {
        btns += '<button type="button" class="btn btn-blue" onclick="cloudUiLink()">Google と連携</button>';
        btns += '<button type="button" class="btn" onclick="cloudUiSignIn()">Google でログイン（別の端末の引き継ぎ）</button>';
    }
    if (loggedOut) {
        btns += '<button type="button" class="btn btn-blue" onclick="cloudUiGuest()">ゲストで開始</button>';
        btns += '<button type="button" class="btn" onclick="cloudUiSignIn()">Google でログイン</button>';
    }
    if (u) {
        btns += '<button type="button" class="btn btn-blue" onclick="cloudSyncNow()">今すぐ同期</button>';
        btns += '<button type="button" class="btn btn-danger" onclick="cloudUiLogout()">ログアウト</button>';
    }
    box.innerHTML = `
    <div class="cloud-dialog panel">
        <h3 style="margin:0 0 8px;">クラウドセーブ</h3>
        <div class="cloud-row"><span>状態</span><strong>${cloudEsc(CLOUD_STATUS_LABEL[cloudState.status] || cloudState.status)}</strong></div>
        <div class="cloud-row"><span>ログイン</span><strong>${cloudEsc(who)}</strong></div>
        <div class="cloud-row"><span>最終同期</span><strong>${cloudEsc(cloudFmtTime(meta.lastSync))}</strong></div>
        ${cloudState.detail ? `<div class="meta" style="margin:6px 0;color:#b3261e;">${cloudEsc(cloudState.detail)}</div>` : ''}
        ${guest ? '<p class="meta" style="margin:8px 0;">ゲストのままブラウザのデータが消えると、セーブも失われます。Google と連携すると、別の端末でも続きから遊べます。</p>' : ''}
        <div class="cloud-btns">${btns}</div>
        <div id="cloud-msg" class="meta" style="margin-top:6px;color:#b3261e;"></div>
        <div style="text-align:right;margin-top:10px;"><button type="button" class="btn btn-sm" onclick="cloudClosePanel()">閉じる</button></div>
    </div>`;
}
function cloudUiMsg(t) {
    const el = document.getElementById('cloud-msg');
    if (el) el.textContent = t || '';
}
async function cloudUiLink() {
    const err = await cloudLinkGoogle();
    if (err) {
        cloudUiMsg(/already|exist/i.test(err)
            ? 'この Google アカウントは別のデータに連携済みです。「Google でログイン」から引き継いでください。（' + err + '）'
            : err);
    }
}
async function cloudUiSignIn() {
    if (!confirm('Google アカウントでログインします。この端末のデータとクラウドのデータが違う場合は、あとで選択画面が出ます。続けますか？')) return;
    const err = await cloudSignInGoogle();
    if (err) cloudUiMsg(err);
}
async function cloudUiGuest() { await cloudStartGuest(); }
async function cloudUiLogout() {
    if (!confirm('ログアウトします。この端末のセーブは消えませんが、クラウドとの同期は止まります。')) return;
    await cloudLogout();
}

/* ---------- 連携バナー ---------- */
function cloudRenderBanner() {
    const el = document.getElementById('cloud-banner');
    if (!el) return;
    el.style.display = cloudBannerVisible() ? 'flex' : 'none';
}

/* ---------- 競合ダイアログ ---------- */
function cloudSummaryHtml(title, s, extra) {
    if (!s) return '';
    return `<div class="cloud-side">
        <div class="cloud-side-title">${cloudEsc(title)}</div>
        <div class="cloud-row"><span>最終保存</span><strong>${cloudEsc(s.savedAt ? new Date(s.savedAt).toLocaleString() : '—')}</strong></div>
        <div class="cloud-row"><span>SS</span><strong>${s.ss}</strong></div>
        <div class="cloud-row"><span>キャラ数</span><strong>${s.chars}</strong></div>
        <div class="cloud-row"><span>最高 Lv</span><strong>${s.maxLv}</strong></div>
        ${extra || ''}
    </div>`;
}
function cloudShowConflict() {
    const c = cloudState.conflict;
    if (!c) return;
    let box = document.getElementById('cloud-conflict');
    if (!box) {
        box = document.createElement('div');
        box.id = 'cloud-conflict';
        box.className = 'cloud-overlay';
        document.body.appendChild(box);
    }
    box.style.display = 'flex';
    const local = cloudSummarize(serializeState());
    const cloud = cloudSummarize(c.row.data);
    box.innerHTML = `
    <div class="cloud-dialog panel" style="max-width:560px;">
        <h3 style="margin:0 0 6px;">データが食い違っています</h3>
        <p class="meta" style="margin:0 0 8px;">この端末とクラウドで、別々に進んだデータがあります。どちらかを選ぶと、選ばなかった方は上書きされます。迷うときは先にそれぞれをJSONで保存してください。</p>
        <div class="cloud-sides">
            ${cloudSummaryHtml('この端末', local, '<button type="button" class="btn btn-sm" onclick="cloudDownloadSide(\'local\')">JSONで保存</button>')}
            ${cloudSummaryHtml('クラウド', cloud, '<button type="button" class="btn btn-sm" onclick="cloudDownloadSide(\'cloud\')">JSONで保存</button>')}
        </div>
        <div class="cloud-btns" style="margin-top:12px;">
            <button type="button" class="btn btn-blue" onclick="cloudChoose('local')">この端末のデータで上書き</button>
            <button type="button" class="btn btn-blue" onclick="cloudChoose('cloud')">クラウドのデータで上書き</button>
        </div>
    </div>`;
}
function cloudDownloadSide(which) {
    const c = cloudState.conflict;
    const data = which === 'cloud' ? (c && c.row.data) : serializeState();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gambit_save_' + which + '.json';
    a.click();
    URL.revokeObjectURL(url);
}
async function cloudChoose(choice) {
    const label = choice === 'cloud' ? 'クラウドのデータ' : 'この端末のデータ';
    if (!confirm(label + 'を残して、もう一方を上書きします。よろしいですか？')) return;
    const box = document.getElementById('cloud-conflict');
    if (box) box.style.display = 'none';
    await cloudResolveConflict(choice);
}

/* ---------- 起動 ---------- */
cloudRenderChip();
cloudRenderBanner();
cloudInit();
