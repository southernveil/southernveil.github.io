/**
 * i18n.js — P9.18.0 多言語対応（英語を先行）
 * ゲームの文言は日本語のまま書き、表示する直前に辞書で置き換える（gettext 方式）。
 *  - 辞書：js/i18n-en.js の I18N_EN（完全一致）と I18N_EN_PAT（{n} などの差し込みを含む型）
 *  - 画面の文字（テキスト・title・placeholder・aria-label）を MutationObserver で自動的に置き換える
 *  - alert / confirm / prompt と document.title も置き換える
 *  - 戦闘エンジンや保存データの日本語（スキル名・ターゲット名など）はそのまま。表示だけが変わる
 *  - 辞書に無い文字は日本語のまま出る（I18N.missing に記録。開発用）
 */
const I18N_LANG_KEY = 'gambit_lang_v1';
const I18N = { lang: 'ja', dict: null, pats: [], cache: new Map(), missing: new Set(), observer: null, done: new WeakMap() };
/** 並びの区切り（強い順） */
const I18N_SEPS = [
    { re: /\n/, split: /(\n)/, map: {} },
    { re: /　\|　| \| /, split: /(　\|　| \| )/, map: { '　|　': '  |  ' } },
    { re: / \/ |／/, split: /( \/ |／)/, map: { '／': ' / ' } },
    { re: /、|，| & /, split: /(、|，| & )/, map: { '、': ', ', '，': ', ' } },
    { re: /・/, split: /(・)/, map: { '・': ' · ' } },
    { re: / +/, split: /( +)/, map: {} }
];
const I18N_JP_RE = /[぀-ヿ㐀-鿿！-｠]/;   // 日本語の文字（かな・カナ・漢字・全角記号）

function i18nDetect() {
    let saved = null;
    try { saved = localStorage.getItem(I18N_LANG_KEY); } catch (e) { /* 無視 */ }
    if (saved === 'ja' || saved === 'en') return saved;
    const nav = String((navigator.languages && navigator.languages[0]) || navigator.language || 'ja').toLowerCase();
    return nav.startsWith('ja') ? 'ja' : 'en';
}
function i18nSetLang(lang) {
    if (lang !== 'ja' && lang !== 'en') return;
    try { localStorage.setItem(I18N_LANG_KEY, lang); } catch (e) { /* 無視 */ }
    location.reload();   // 表示中の文言をまとめて切り替えるため読み直す
}

/* ---------- 辞書 ---------- */
function i18nEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/** 型 'あと{t}です' → 正規表現。{名前} は任意の文字列、{n} は数（カンマ・小数・符号つき）にだけ一致 */
function i18nCompile(src, dst) {
    const names = [];
    let re = '';
    let i = 0;
    const m = src.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    let rest = src;
    m.forEach(tok => {
        const at = rest.indexOf(tok);
        re += i18nEsc(rest.slice(0, at));
        const name = tok.slice(1, -1);
        names.push(name);
        re += /^n\d*$/.test(name) ? '([+\\-−]?[\\d,]+(?:\\.\\d+)?)' : (/^L\d*$/.test(name) ? '([A-ZＡ-Ｚ])' : '([\\s\\S]+?)');
        rest = rest.slice(at + tok.length);
        i++;
    });
    re += i18nEsc(rest);
    return { re: new RegExp('^' + re + '$'), names: names, dst: dst, len: src.length };
}
function i18nInit() {
    I18N.lang = i18nDetect();
    if (I18N.lang === 'en' && typeof I18N_EN !== 'undefined') {
        I18N.dict = I18N_EN;
        I18N.pats = (typeof I18N_EN_PAT !== 'undefined' ? I18N_EN_PAT : []).map(p => i18nCompile(p[0], p[1]));
        I18N.pats.sort((a, b) => b.len - a.len);   // 長い（具体的な）型を先に試す
    }
    try { document.documentElement.lang = I18N.lang; document.documentElement.dataset.lang = I18N.lang; } catch (e) { /* 無視 */ }
}

/** 1つの文字列を訳す（前後の空白は保つ）。訳が無ければそのまま */
function T(s) {
    if (I18N.lang === 'ja' || !I18N.dict || s == null) return s;
    s = String(s);
    if (!I18N_JP_RE.test(s)) return s;
    const lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0];
    const core = s.slice(lead.length, s.length - trail.length);
    return lead + i18nCore(core, 0) + trail;
}
function i18nCore(s, depth) {
    if (I18N.cache.has(s)) return I18N.cache.get(s);
    let out = null;
    if (Object.prototype.hasOwnProperty.call(I18N.dict, s)) out = I18N.dict[s];
    let fallback = null;
    if (out == null) {
        // 型を順に試す。差し込み部分まで訳しきれた結果を優先する
        for (const p of I18N.pats) {
            const m = s.match(p.re);
            if (!m) continue;
            const vals = {};
            p.names.forEach((nm, i) => { const v = m[i + 1]; vals[nm] = (depth < 5 && I18N_JP_RE.test(v)) ? i18nCore(v, depth + 1) : v; });
            const r = p.dst.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => vals[k] != null ? vals[k] : '');
            if (!I18N_JP_RE.test(r)) { out = r; break; }
            if (fallback == null) fallback = r;
        }
    }
    if (out == null && depth < 4) {
        // 区切りのある並びは、強い区切りから順に分けて、部分ごとに訳してみる（改行 →　|　→ / → 、・& ）
        for (const lv of I18N_SEPS) {
            if (!lv.re.test(s)) continue;
            const parts = s.split(lv.split);
            const tr = parts.map((x, i) => (i % 2 === 1) ? (lv.map[x] != null ? lv.map[x] : x) : (I18N_JP_RE.test(x) ? x.match(/^\s*/)[0] + i18nCore(x.trim(), depth + 1) + x.match(/\s*$/)[0] : x));
            const joined = tr.join('');
            if (!I18N_JP_RE.test(joined)) { out = joined; break; }
            if (fallback == null) fallback = joined;
            break;
        }
    }
    if (out == null && fallback != null) { out = fallback; if (depth === 0) I18N.missing.add(s); }
    if (out == null) { if (depth === 0) I18N.missing.add(s); out = s; }
    if (I18N.cache.size > 20000) I18N.cache.clear();
    if (depth === 0 || !I18N_JP_RE.test(out)) I18N.cache.set(s, out);   // 途中の深さで訳しきれなかった結果は覚えない
    return out;
}
/** コードから使う：t('次の出撃まで {t}', { t: '0:30' }) */
function t(ja, vars) {
    let s = T(ja);
    if (vars) s = String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
    return s;
}

/* ---------- 画面の自動置き換え ---------- */
const I18N_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
/** 属性を訳す（変わるときだけ書き換える。同じ値を書くと監視が無限に反応するため） */
function i18nAttr(node, a) {
    const v = node.getAttribute(a);
    if (!v || !I18N_JP_RE.test(v)) return;
    const tv = T(v);
    if (tv !== v) node.setAttribute(a, tv);
}
function i18nNode(node) {
    if (node.nodeType === 3) {
        const v = node.nodeValue;
        if (!v || !I18N_JP_RE.test(v) || I18N.done.get(node) === v) return;
        const p = node.parentNode;
        if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA' || (p.closest && p.closest('[data-no-i18n]')))) return;
        const tr = T(v);
        I18N.done.set(node, tr);
        if (tr !== v) node.nodeValue = tr;
        return;
    }
    if (node.nodeType !== 1) return;
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE' || node.hasAttribute('data-no-i18n')) return;
    I18N_ATTRS.forEach(a => i18nAttr(node, a));
    if (node.nodeName === 'INPUT' && (node.type === 'button' || node.type === 'submit') && I18N_JP_RE.test(node.value)) { const tv = T(node.value); if (tv !== node.value) node.value = tv; }
    if (node.nodeName === 'TEXTAREA' || node.isContentEditable) return;
    for (let c = node.firstChild; c; c = c.nextSibling) i18nNode(c);
}
function i18nStart() {
    i18nInit();
    if (I18N.lang === 'ja' || !I18N.dict) return;
    const go = () => {
        i18nNode(document.body);
        document.title = T(document.title);
        I18N.observer = new MutationObserver(list => {
            for (const m of list) {
                if (m.type === 'characterData') i18nNode(m.target);
                else if (m.type === 'attributes') { if (I18N_ATTRS.indexOf(m.attributeName) >= 0) i18nAttr(m.target, m.attributeName); }
                else m.addedNodes.forEach(n => i18nNode(n));
            }
        });
        I18N.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    // ダイアログ
    const lines = s => String(s == null ? '' : s).split('\n').map(x => T(x)).join('\n');
    const a = window.alert, c = window.confirm, p = window.prompt;
    window.alert = m => a.call(window, lines(m));
    window.confirm = m => c.call(window, lines(m));
    window.prompt = (m, d) => p.call(window, lines(m), d);
}
/** 複数行のテキスト（ログの書き出し・Discord 通知など、画面の外へ出る文字）を1行ずつ訳す */
function i18nText(s) {
    if (I18N.lang === 'ja' || s == null) return s;
    return String(s).split('\n').map(x => T(x)).join('\n');
}
/** オブジェクトの中の文字列をまとめて訳す（Discord の送信内容など）。Discord の文字数上限で切り詰め直す */
function i18nDeep(o, key) {
    if (I18N.lang === 'ja' || o == null) return o;
    if (typeof o === 'string') {
        const r = i18nText(o);
        const max = key === 'title' || key === 'name' || key === 'username' ? 256 : (key === 'value' ? 1024 : (key === 'description' ? 4096 : 0));
        return max && r.length > max ? r.slice(0, max - 1) + '…' : r;
    }
    if (Array.isArray(o)) return o.map(x => i18nDeep(x, key));
    if (typeof o === 'object') { const out = {}; Object.keys(o).forEach(k => { out[k] = i18nDeep(o[k], k); }); return out; }
    return o;
}
/** 開発用：まだ訳が無い文字の一覧 */
function i18nMissingList() { return Array.from(I18N.missing); }

i18nStart();
