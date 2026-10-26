/**
 * ads.js — P9.19.0 リワード広告（Google AdSense の H5 Games Ads ＝ Ad Placement API）
 * cloud-config.js の adsenseClient（ca-pub-…。公開してよい値）が空なら何もしない（今までどおりの疑似視聴）。
 * 設定されていれば、広告ボーナス・祈りの欠片の「広告を見る」で本物のリワード広告を出す。
 *  - 視聴を最後まで終えたときだけ { watched: true }。途中で閉じた・広告が用意できなかったときは watched: false
 *  - H5 Games Ads にはサーバー側の視聴確認がないため、報酬の上限（1日の回数・出撃5回ごと）はサーバーが守る
 */
const ADS = { ready: false, loading: false, client: '', test: false, lastStatus: '' };

function adsInit() {
    const c = window.GAMBIT_CLOUD || {};
    const client = String(c.adsenseClient || '').trim();
    if (!/^ca-pub-\d{10,20}$/.test(client)) return;   // 未設定 → 疑似視聴のまま
    ADS.client = client;
    ADS.test = c.adsTest !== false;   // 審査が通るまではテスト広告（data-adbreak-test）
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-ad-frequency-hint', '30s');
    if (ADS.test) s.setAttribute('data-adbreak-test', 'on');
    s.onload = () => { ADS.ready = true; };
    document.head.appendChild(s);
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
    try {
        const sound = (typeof fxSettings !== 'undefined' && fxSettings.sound === false) ? 'off' : 'on';
        window.adConfig({ preloadAdBreaks: 'on', sound: sound });
    } catch (e) { /* 無視 */ }
    if (typeof setAdProvider === 'function') setAdProvider(adsShowRewarded);
}

/** リワード広告を1回出す。@returns Promise<{watched, reason}> */
function adsShowRewarded() {
    return new Promise(resolve => {
        let settled = false, shown = false;
        const done = (r) => { if (settled) return; settled = true; clearTimeout(timer); resolve(r); };
        // 広告が来ないまま何も起きない場合の保険
        const timer = setTimeout(() => done({ watched: false, reason: 'timeout' }), shown ? 120000 : 15000);
        try {
            window.adBreak({
                type: 'reward',
                name: 'gambit_reward',
                beforeReward: (showAdFn) => { shown = true; clearTimeout(timer); showAdFn(); },   // ボタンを押した時点で同意済み
                beforeAd: () => { if (typeof fxSetMuted === 'function') fxSetMuted(true); },
                afterAd: () => { if (typeof fxSetMuted === 'function') fxSetMuted(false); },
                adDismissed: () => done({ watched: false, reason: 'dismissed' }),
                adViewed: () => done({ watched: true }),
                adBreakDone: (info) => {
                    ADS.lastStatus = info && info.breakStatus || '';
                    if (!settled) done({ watched: false, reason: ADS.lastStatus || 'notReady' });
                }
            });
        } catch (e) { done({ watched: false, reason: 'error' }); }
    });
}
/** 失敗の理由をプレイヤー向けの文に */
function adsReasonText(reason) {
    if (reason === 'dismissed') return '広告を最後まで見ると受け取れます';
    if (reason === 'frequencyCapped') return '少し時間をおいてから、もう一度お試しください';
    return 'いまは広告を用意できませんでした。少し時間をおいてお試しください';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', adsInit); else adsInit();
