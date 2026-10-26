/**
 * cloud-config.js — Phase 3a
 * 公開してよい値だけを書く（Project URL と publishable(anon) key）。
 * service_role / secret キーや DB パスワードは絶対に書かない。
 */
window.GAMBIT_CLOUD = {
    url: 'https://cgqjtdxysxzprtivunmr.supabase.co',
    key: 'sb_publishable_r7VYHRrsWtPI4AhywpvdlA_yspsmCTQ',
    // 'server' = ゲームの状態をサーバーが管理（3b-1） / 'backup' = ブラウザ主・クラウドはバックアップ（3a）
    mode: 'server',
    functionName: 'swift-endpoint',
    // Cloudflare Turnstile の「サイトキー」（公開してよい値）。空なら人間確認なし。シークレットキーはここに書かない
    turnstileSiteKey: '0x4AAAAAAFkZTozA9vLHq8OJ',
    // Google AdSense のサイト運営者ID（ca-pub-…。公開してよい値）。空なら広告は出さず疑似視聴のまま
    adsenseClient: '',
    // true の間はテスト広告（H5 Games Ads の審査が通ったら false に）
    adsTest: true
};
