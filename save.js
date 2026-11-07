/* セーブ：localStorage（作品専用キー・バージョン付き）＋セーブコード書き出し/読み込み。
 * 永続性は保証されない（ブラウザ設定やiOS Safariの保存領域削除で消える可能性あり）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YCSave = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'yofuda_caravan.v1.save';
  const VERSION = 1;
  const PREFIX = 'YC1.';

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function b64enc(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64dec(s) {
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(s)));
  }
  function fresh(P) { return { v: VERSION, P, G: null, settings: { sound: false } }; }
  function migrate(o) {
    if (!o || typeof o !== 'object' || typeof o.v !== 'number') throw new Error('セーブデータの形式が不正です');
    if (o.v > VERSION) throw new Error('新しいバージョンのセーブです');
    if (!o.P || !o.P.numLv || !o.P.roleLv) throw new Error('成長データがありません');
    o.settings = o.settings || {};
    return o;
  }
  function encode(state) {
    const json = JSON.stringify(state);
    return PREFIX + b64enc(json) + '.' + hash(json);
  }
  function decode(code) {
    code = String(code || '').trim();
    if (!code.startsWith(PREFIX)) throw new Error('セーブコードではありません');
    const body = code.slice(PREFIX.length);
    const dot = body.lastIndexOf('.');
    if (dot < 0) throw new Error('セーブコードが壊れています');
    let json;
    try { json = b64dec(body.slice(0, dot)); } catch (e) { throw new Error('セーブコードが壊れています'); }
    if (hash(json) !== body.slice(dot + 1)) throw new Error('チェックサムが一致しません（コピー漏れの可能性）');
    return migrate(JSON.parse(json));
  }
  function load(storage, newPersist) {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { state: fresh(newPersist()), error: null };
      return { state: migrate(JSON.parse(raw)), error: null };
    } catch (e) { return { state: fresh(newPersist()), error: 'セーブの読み込みに失敗: ' + e.message }; }
  }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return null; } catch (e) { return '保存に失敗しました（容量不足またはプライベートモード）: ' + e.message; }
  }
  return { KEY, VERSION, encode, decode, load, save, fresh };
});
