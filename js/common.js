/**
 * common.js — 定数・ユーティリティ (P8.3)
 */
const MAX_PARTY = 4;
const PARTY_SET_COUNT = 3;
const APP_VERSION = 'P9.21.1';
const MAX_RULES = 10;

/** 統合リソース表示名（P9確定） */
const RESOURCE_LABEL = 'SS';
/** 単発バトル勝利時の旧暫定報酬。遠征経済が本線のため 0（互換のため定数は残す） */
const PROVISIONAL_WIN_REWARD = 0;
/** 新規ゲーム初期 SS */
const PROVISIONAL_RESOURCE_INIT = 0;
/** キャラクター基本寿命（探索回数）。P9確定 */
const DEFAULT_LIFESPAN = 60;
/** クラスチェンジを当面無効化（P9: Lv20キャップ・CCなし） */
const CLASS_CHANGE_ENABLED = false;

/** サーバー管理モード（Phase 3b-1）か。cloud-config.js の mode で切替 */
function serverMode() {
    return !!(typeof window !== 'undefined' && window.GAMBIT_CLOUD && window.GAMBIT_CLOUD.mode === 'server');
}

function genId(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

function diceMult(dice) {
    if (dice <= 5) return 0.8;
    if (dice <= 15) return 1.0;
    if (dice <= 19) return 1.2;
    return 1.5;
}

function esc(s) {
    return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 味方の初期ルール: 1行目だけ「常に → 敵1体 → 通常攻撃」（conditions[0]=常に / targets[1]=敵1体 / skill 0=通常攻撃） */
function defaultPlayerRules() {
    const r = emptyRules();
    r[0] = { active: true, cond: 0, tgt: 1, skill: 0 };
    return r;
}
function emptyRules() {
    return Array(MAX_RULES).fill(null).map(() => ({ active: false, cond: 0, tgt: 0, skill: 0 }));
}

/** 開発環境判定（localhost / 127.0.0.1 / file）。?public=1 を付けると公開状態として動く */
function isDevEnvironment() {
    try {
        if (typeof location !== 'undefined' && /(^|[?&])public=1(&|$)/.test(location.search || '')) return false; // 公開状態の確認用
        if (typeof location === 'undefined') return true;
        const h = location.hostname || '';
        if (h === 'localhost' || h === '127.0.0.1' || h === '') return true;
        if (location.protocol === 'file:') return true;
    } catch (e) {}
    return false;
}
