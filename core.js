/* 夜札のキャラバン — コアエンジン（ブラウザ／Node 共用）。DOM 非依存。
 * 状態 G は JSON 直列化可能。乱数は G.rs（mulberry32 状態）のみを使うので、保存→再読込で抽選結果は変わらない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================= 数値設定（SIM_REPORT.md で確定） ================= */
  const CFG = {
    hpBase: 120, hpGrow: 1.55,
    typeMul: { normal: 1, strong: 1.3, boss: 2.0 },
    diffMul: { easy: 0.7, normal: 1, deep: 1.5 },
    handSize: 8, discards: 3, maxHp: 5, maxSel: 5,
    reward: { base: 90, perStage: 25, speed: 30 }, // 速攻: 使わなかった攻撃1回あたり
    startCg: 100,
    price: { train: 70, scout: 90, remove: 50, rerollStep: 100, sellLoot: 150 },
    supplyModLimit: 3, supplyRemoveLimit: 2,
    helperSlots: 4, itemSlots: 2, lootSlots: 2, handCap: 10,
    trainVal: { pow: 20, cmb: 1.0, gld: 60, mtl: 1.8 },
    expRole: (lv) => 2 + lv, expNum: (lv) => 3 + lv,
    lvCap: 20, numLvBonus: 1, roleLvBonus: 0.02,
    draftSupplies: [0, 1, 2, 3, 5], // 補給(0始まり)のうちドラフトがあるもの＋開始時
  };

  const SUITS = [
    { id: 0, name: '星', col: '#e9c46a' },
    { id: 1, name: '月', col: '#8ecae6' },
    { id: 2, name: '剣', col: '#e76f51' },
    { id: 3, name: '花', col: '#9bd48a' },
  ];

  /* ================= 役 ================= */
  // base=役基礎値, mult=役倍率, tags=内包タグ（DESIGN.md 第2・補完1）
  const ROLES = {
    high:       { name: 'ハイカード',       base: 10,  mult: 1.0,  tags: [], ex: false },
    pair:       { name: 'ワンペア',         base: 20,  mult: 1.0,  tags: ['pair'] },
    twopair:    { name: 'ツーペア',         base: 30,  mult: 2.0,  tags: ['pair', 'twopair'] },
    three:      { name: 'スリーカード',     base: 40,  mult: 3.0,  tags: ['pair', 'triple'] },
    straight:   { name: 'ストレート',       base: 40,  mult: 3.0,  tags: ['straight'] },
    flush:      { name: 'フラッシュ',       base: 45,  mult: 3.5,  tags: ['flush'] },
    fullhouse:  { name: 'フルハウス',       base: 50,  mult: 4.0,  tags: ['pair', 'twopair', 'triple', 'fh'] },
    four:       { name: 'フォーカード',     base: 80,  mult: 8.0,  tags: ['pair', 'triple', 'quad'] },
    sflush:     { name: 'ストレートフラッシュ', base: 100, mult: 10.0, tags: ['straight', 'flush'] },
    five:       { name: 'ファイブカード',   base: 120, mult: 12.0, tags: ['pair', 'triple', 'quad'], ex: true },
    flushhouse: { name: 'フラッシュハウス', base: 130, mult: 14.0, tags: ['pair', 'twopair', 'triple', 'flush', 'fh'], ex: true },
    flushfive:  { name: 'フラッシュファイブ', base: 150, mult: 18.0, tags: ['pair', 'triple', 'quad', 'flush'], ex: true },
  };
  const ROLE_ORDER = ['high', 'pair', 'twopair', 'three', 'straight', 'flush', 'fullhouse', 'four', 'sflush', 'five', 'flushhouse', 'flushfive'];
  // 「fh」タグ＝役名そのもの（フルハウス／フラッシュハウス）を条件にする第7テーマ用。
  const TAG_NAMES = { pair: 'ペア', twopair: 'ツーペア', triple: '三枚組', quad: '四枚組', straight: '連番', flush: '同紋', fh: 'フルハウス系' };

  function isWild(c) { return c.t === 'wld' || c.w === 1; }

  /** 提出札(1〜5枚)から成立役を判定。idx は得点札の添字。 */
  function evalHand(cards) {
    const len = cards.length;
    const freq = {};
    for (let i = 0; i < len; i++) (freq[cards[i].n] = freq[cards[i].n] || []).push(i);
    const groups = Object.values(freq).sort((a, b) => b.length - a.length || cards[b[0]].n - cards[a[0]].n);
    const pat = groups.map((g) => g.length);
    let flush = false, straight = false;
    if (len === 5) {
      let s = -1, ok = true;
      for (const c of cards) { if (isWild(c)) continue; if (s < 0) s = c.s; else if (s !== c.s) { ok = false; break; } }
      flush = ok;
      if (groups.length === 5) {
        const ns = cards.map((c) => c.n).sort((a, b) => a - b);
        straight = ns[4] - ns[0] === 4 || (ns[4] === 14 && ns[3] === 5 && ns[0] === 2 && ns[1] === 3 && ns[2] === 4);
      }
    }
    const all = [0, 1, 2, 3, 4].slice(0, len);
    let role, idx;
    if (pat[0] === 5) { role = flush ? 'flushfive' : 'five'; idx = all; }
    else if (len === 5 && pat[0] === 3 && pat[1] === 2) { role = flush ? 'flushhouse' : 'fullhouse'; idx = all; }
    else if (pat[0] === 4) { role = 'four'; idx = groups[0]; }
    else if (straight && flush) { role = 'sflush'; idx = all; }
    else if (flush) { role = 'flush'; idx = all; }
    else if (straight) { role = 'straight'; idx = all; }
    else if (pat[0] === 3) { role = 'three'; idx = groups[0]; }
    else if (pat[0] === 2 && pat[1] === 2) { role = 'twopair'; idx = groups[0].concat(groups[1]); }
    else if (pat[0] === 2) { role = 'pair'; idx = groups[0]; }
    else {
      role = 'high'; let b = 0;
      for (let i = 1; i < len; i++) if (cards[i].n > cards[b].n) b = i;
      idx = [b];
    }
    return { role, idx, tags: ROLES[role].tags };
  }

  /* ================= データ：助っ人 36名 ================= */
  // テーマ別の値 [★3加算, ★4倍率加算, ★5最終倍率(+)]
  const THEMES = [
    { id: 'pair',     tag: 'pair',     name: 'ペア',     chara: 'リコ', v: [35, 0.5, 0.25] },
    { id: 'twopair',  tag: 'twopair',  name: 'ツーペア', chara: 'ノエ', v: [55, 1.0, 0.40] },
    { id: 'triple',   tag: 'triple',   name: '三枚組',   chara: 'ミラ', v: [70, 1.2, 0.50] },
    { id: 'quad',     tag: 'quad',     name: '四枚組',   chara: 'ガロ', v: [90, 2.0, 0.80] },
    { id: 'straight', tag: 'straight', name: '連番',     chara: 'セラ', v: [70, 1.5, 0.60] },
    { id: 'flush',    tag: 'flush',    name: '同紋',     chara: 'ユキ', v: [70, 1.5, 0.60] },
    { id: 'fh',       tag: 'fh',       name: 'フルハウス', chara: 'ハル', v: [100, 2.0, 0.80] },
  ];
  const SPECIALS = [
    { id: 'combo',    name: '連撃',       chara: 'カイ',   v: [0.30, 0.60, 1.00] },
    { id: 'econ',     name: '経済',       chara: 'ポッケ', v: [50, 80, 120] },
    { id: 'discard',  name: 'すてる操作', chara: 'ロロ',   v: [1, 1, 2] },
    { id: 'pile',     name: '捨て札蓄積', chara: 'ネム',   v: [3, 0.12, 0.03] },
    { id: 'compress', name: '圧縮蓄積',   chara: 'ダイ',   v: [4, 0.12, 0.035] },
  ];
  const STAR_TITLE = { 3: '見習い', 4: '旅の', 5: '星詠みの' };
  const HELPERS = [];
  const HELPER_BY_ID = {};
  const CHARAS = THEMES.map((t) => t.id).concat(SPECIALS.map((s) => s.id));
  (function build() {
    let k = 0;
    const mk = (set, kind, ci) => {
      for (let i = 0; i < 3; i++) {
        const star = 3 + i;
        const h = { id: 'h' + String(++k).padStart(2, '0'), set: set.id, kind, star, chara: ci + 1, name: STAR_TITLE[star] + set.chara, setName: set.name, v: set.v[i] };
        HELPERS.push(h); HELPER_BY_ID[h.id] = h;
      }
    };
    THEMES.forEach((t, i) => mk(t, 'theme', i));
    SPECIALS.forEach((s, i) => mk(s, 'special', 7 + i));
  })();
  const THEME_BY_ID = {}; THEMES.forEach((t) => (THEME_BY_ID[t.id] = t));

  function helperText(h) {
    const T = THEME_BY_ID[h.set];
    if (h.kind === 'theme') {
      const tn = TAG_NAMES[T.tag];
      if (h.star === 3) return `「${tn}」成立時 加算+${h.v}`;
      if (h.star === 4) return `「${tn}」成立時 倍率+${h.v}`;
      return `「${tn}」成立時 最終倍率×${(1 + h.v).toFixed(2)}`;
    }
    const i = h.star - 3;
    switch (h.set) {
      case 'combo': return `5枚提出時 追撃（ダメージ+${Math.round(h.v * 100)}%）`;
      case 'econ': return i === 2 ? `戦闘報酬CG+${h.v}／所持CG100ごとに最終倍率+4%（最大+60%）` : `戦闘報酬CG+${h.v}`;
      case 'discard': return ['すてる回数+1', '手札+1', 'すてる回数+2／手札+1'][i];
      case 'pile': return i === 0 ? `すてて捨てた札1枚ごとに加算+${h.v}` : i === 1 ? `すてて捨てた札1枚ごとに倍率+${h.v}` : `すてて捨てた札1枚ごとに最終倍率+${Math.round(h.v * 100)}%`;
      case 'compress': return i === 0 ? `デッキを減らした枚数ごとに加算+${h.v}` : i === 1 ? `デッキを減らした枚数ごとに倍率+${h.v}` : `デッキを減らした枚数ごとに最終倍率+${(h.v * 100).toFixed(1)}%`;
    }
    return '';
  }

  /* ================= データ：戦利品（基礎8×接辞6） ================= */
  const LOOT_BASES = [
    { id: 'add',   noun: 'ランタン',   v: 40,   text: (v) => `加算+${v}` },
    { id: 'madd',  noun: '羅針盤',     v: 1.0,  text: (v) => `倍率+${v}` },
    { id: 'final', noun: '星の外套',   v: 0.25, text: (v) => `最終倍率×${(1 + v).toFixed(2)}` },
    { id: 'card',  noun: '砂時計',     v: 8,    text: (v) => `得点札1枚ごとに加算+${v}` },
    { id: 'echo',  noun: '銀の鈴',     v: 0.25, text: (v) => `追撃（ダメージ+${Math.round(v * 100)}%）` },
    { id: 'cg',    noun: '金の財布',   v: 80,   text: (v) => `条件を満たす攻撃で撃破すると CG+${v}` },
    { id: 'pile',  noun: '古いトランク', v: 4,  text: (v) => `すてて捨てた札1枚ごとに加算+${v}` },
    { id: 'cardm', noun: '星図の栞',   v: 0.25, text: (v) => `得点札1枚ごとに倍率+${v}` },
  ];
  const LOOT_AFFIXES = [
    { id: 'pair',     pre: '双子の',   m: 0.7, cond: '「ペア」成立時' },
    { id: 'triple',   pre: '三つ星の', m: 1.0, cond: '「三枚組」成立時' },
    { id: 'straight', pre: '橋渡しの', m: 1.4, cond: '「連番」成立時' },
    { id: 'flush',    pre: '紋織りの', m: 1.4, cond: '「同紋」成立時' },
    { id: 'five',     pre: '満ち手の', m: 1.0, cond: '5枚提出時' },
    { id: 'crisis',   pre: '窮鼠の',   m: 1.3, cond: '耐久が2以下のとき' },
  ];
  const LOOT_BASE_BY_ID = {}; LOOT_BASES.forEach((b) => (LOOT_BASE_BY_ID[b.id] = b));
  const LOOT_AFF_BY_ID = {}; LOOT_AFFIXES.forEach((a) => (LOOT_AFF_BY_ID[a.id] = a));
  function lootInfo(l) {
    const b = LOOT_BASE_BY_ID[l.b], a = LOOT_AFF_BY_ID[l.a];
    const v = round2(b.v * a.m);
    const vv = b.id === 'cg' || b.id === 'card' || b.id === 'pile' || b.id === 'add' ? Math.round(v) : v;
    return { name: a.pre + b.noun, v: vv, text: `${a.cond}：${b.text(vv)}`, base: b, aff: a };
  }
  function lootCondOk(l, tags, count, hp) {
    switch (l.a) {
      case 'five': return count === 5;
      case 'crisis': return hp <= 2;
      default: return tags.includes(l.a);
    }
  }
  function round2(x) { return Math.round(x * 100) / 100; }

  /* ================= データ：どうぐ 10種 ================= */
  const ITEMS = [
    { id: 'torch',   name: 'たいまつ',   price: 70,  text: 'この戦闘のすてる回数+1' },
    { id: 'wind',    name: 'ひきよせ',   price: 60,  text: '手札をすべて捨てて引き直す（すてる回数を消費しない）' },
    { id: 'dust',    name: 'ほしくず',   price: 120, text: '次の攻撃の最終倍率×1.5' },
    { id: 'charm',   name: 'おまもり',   price: 100, text: '耐久+1（戦闘中・上限+2まで）' },
    { id: 'mirror',  name: 'かがみ',     price: 80,  text: '次の攻撃の加算+120' },
    { id: 'knot',    name: 'むすびめ',   price: 90,  text: '次の攻撃の倍率+2' },
    { id: 'pouch',   name: 'ふくろ',     price: 60,  text: '札を2枚引く（手札は最大10枚）' },
    { id: 'signal',  name: 'のろし',     price: 130, text: '敵の現在HPを20%減らす' },
    { id: 'prism',   name: 'プリズム',   price: 80,  text: '手札1枚を選び、この戦闘のあいだ全紋章扱い' },
    { id: 'cheer',   name: 'はげまし',   price: 100, text: '次の攻撃が倒しきれなくても耐久が減らない' },
  ];
  const ITEM_BY_ID = {}; ITEMS.forEach((i) => (ITEM_BY_ID[i.id] = i));

  /* ================= データ：加護 6種 ================= */
  const BOONS = [
    { id: 'std',      name: '標準',         text: '変更なし', init: true },
    { id: 'hand',     name: '大きな手',     text: '手札+1 ／ すてる-1', init: true, hand: 1, discards: -1 },
    { id: 'toss',     name: '投げ札',       text: 'すてる+2 ／ 手札-1', init: true, hand: -1, discards: 2 },
    { id: 'slot',     name: '賑やかな荷車', text: '助っ人枠+1 ／ 耐久-1', unlock: '第6戦に到達する', helperSlots: 1, hp: -1 },
    { id: 'rich',     name: '商人の財布',   text: '初期CG+400・どうぐ枠+1 ／ 戦闘報酬CG-30%', unlock: 'いずれかの難易度でクリア', startCg: 400, itemSlots: 1, rewardMul: 0.7 },
    { id: 'compress', name: '身軽な旅',     text: '開始時に不要札を最大8枚除去（44枚前後で開始）／ すてる-1', unlock: '「ふつう」以上でクリア', discards: -1, startRemove: 8 },
  ];
  const BOON_BY_ID = {}; BOONS.forEach((b) => (BOON_BY_ID[b.id] = b));

  /* ================= 敵 ================= */
  const STAGE_TYPE = ['normal', 'normal', 'strong', 'normal', 'normal', 'strong', 'normal', 'normal', 'boss'];
  function enemyHp(stage, diff) {
    const raw = CFG.hpBase * Math.pow(CFG.hpGrow, stage) * CFG.typeMul[STAGE_TYPE[stage]] * CFG.diffMul[diff];
    return Math.max(10, Math.round(raw / 10) * 10);
  }
  const CHAPTER_NAMES = ['第一夜 灯の街道', '第二夜 砂時計の砂漠', '第三夜 星の塔'];
  const ENEMY_NAMES = {
    normal: ['迷い灯', '忘れ傘', '砂の写し絵', '鈴なり鼠', '歯車の影', '星くず蛾'],
    strong: ['門番の大鴉', '回廊の仮面', '砂海のエイ'],
    boss: '星喰らいの王',
  };

  /* ================= 乱数・ユーティリティ ================= */
  function rnd(G) {
    let t = (G.rs = (G.rs + 0x6D2B79F5) | 0);
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  function rint(G, n) { return Math.floor(rnd(G) * n); }
  function shuffle(G, a) { for (let i = a.length - 1; i > 0; i--) { const j = rint(G, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pickW(G, items, wf) {
    let tot = 0; for (const it of items) tot += wf(it);
    let r = rnd(G) * tot;
    for (const it of items) { r -= wf(it); if (r < 0) return it; }
    return items[items.length - 1];
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ================= 恒常成長 ================= */
  function newPersist() {
    const numLv = {}, numExp = {}, roleLv = {}, roleExp = {};
    for (let n = 2; n <= 14; n++) { numLv[n] = 0; numExp[n] = 0; }
    for (const r of ROLE_ORDER) { roleLv[r] = 0; roleExp[r] = 0; }
    return { v: 1, numLv, numExp, roleLv, roleExp, picks: {}, runs: 0, clears: { easy: 0, normal: 0, deep: 0 }, bestStage: 0, boons: ['std', 'hand', 'toss'], codexSeen: {}, tutorial: 0 };
  }
  function maxPersist() {
    const P = newPersist();
    for (const n in P.numLv) P.numLv[n] = CFG.lvCap;
    for (const r in P.roleLv) P.roleLv[r] = CFG.lvCap;
    return P;
  }
  function gainExp(P, kind, key, amount) {
    const lv = kind === 'num' ? P.numLv : P.roleLv, ex = kind === 'num' ? P.numExp : P.roleExp;
    const f = kind === 'num' ? CFG.expNum : CFG.expRole;
    ex[key] += amount;
    while (lv[key] < CFG.lvCap && ex[key] >= f(lv[key])) { ex[key] -= f(lv[key]); lv[key]++; }
    if (lv[key] >= CFG.lvCap) ex[key] = 0;
  }
  /** ラン終了時：G.exp（戦闘ごと・同一役1回／同一数字1回）を恒常成長へ反映 */
  function applyRunToPersist(P, G) {
    for (const r in G.exp.roles) gainExp(P, 'role', r, G.exp.roles[r]);
    for (const n in G.exp.nums) gainExp(P, 'num', n, G.exp.nums[n]);
    P.runs++;
    if (G.won) P.clears[G.diff]++;
    P.bestStage = Math.max(P.bestStage, G.stage + (G.won ? 1 : 0));
    for (const id in G.picked) P.picks[id] = (P.picks[id] || 0) + G.picked[id];
    // 加護の解放
    const add = (b) => { if (!P.boons.includes(b)) P.boons.push(b); };
    if (G.stage >= 5) add('slot');
    if (G.won) add('rich');
    if (G.won && G.diff !== 'easy') add('compress');
  }
  /** 図鑑：助っ人の解放判定（★3は初期解放、★4=同系統★3を2回以上ドラフト、★5=同系統★4を2回以上ドラフト＋クリア実績） */
  function helperUnlocked(P, h) {
    if (CFG.allUnlocked) return true;
    if (h.star === 3) return true;
    const sib = HELPERS.find((x) => x.set === h.set && x.star === h.star - 1);
    const picks = P.picks[sib.id] || 0;
    if (h.star === 4) return picks >= 2 || !!CFG.initStar4Sets && CFG.initStar4Sets.includes(h.set);
    const clears = P.clears.easy + P.clears.normal + P.clears.deep;
    return picks >= 2 && clears >= 1;
  }

  /* ================= ラン生成 ================= */
  function makeDeck(G) {
    const d = [];
    for (let s = 0; s < 4; s++) for (let n = 2; n <= 14; n++) d.push({ u: G.uidn++, n, s, t: '' });
    return d;
  }
  function newRun(seed, diff, boonId, P, opts) {
    opts = opts || {};
    const boon = BOON_BY_ID[boonId] || BOONS[0];
    const G = {
      v: 1, rs: seed | 0, uidn: 1, diff: diff || 'normal', boon: boon.id, stage: 0, phase: 'draft', won: false,
      deck: [], helpers: [], loots: [], items: [], cg: CFG.startCg + (boon.startCg || 0),
      P: null, // 熟練（ラン開始時のスナップショット）
      exp: { roles: {}, nums: {} }, picked: {}, supplyNo: 0, battle: null, sup: null, lootChoice: null, stats: { maxDmg: 0, battles: 0 },
    };
    G.P = { numLv: clone(P.numLv), roleLv: clone(P.roleLv), unlocked: HELPERS.filter((h) => helperUnlocked(P, h)).map((h) => h.id) };
    G.deck = makeDeck(G);
    if (boon.startRemove && opts.startRemove) {
      const ids = opts.startRemove.slice(0, boon.startRemove);
      G.deck = G.deck.filter((c) => !ids.includes(c.u));
    }
    G.draft = makeDraft(G, true);
    return G;
  }
  function boonOf(G) { return BOON_BY_ID[G.boon]; }
  function helperSlots(G) { return CFG.helperSlots + (boonOf(G).helperSlots || 0); }
  function itemSlots(G) { return CFG.itemSlots + (boonOf(G).itemSlots || 0); }
  function maxHp(G) { return CFG.maxHp + (boonOf(G).hp || 0); }
  function hasHelper(G, set, star) { return G.helpers.some((id) => HELPER_BY_ID[id].set === set && (star == null || HELPER_BY_ID[id].star === star)); }
  function helperObjs(G) { return G.helpers.map((id) => HELPER_BY_ID[id]); }
  function handSizeOf(G) {
    let n = CFG.handSize + (boonOf(G).hand || 0);
    for (const h of helperObjs(G)) if (h.set === 'discard' && h.star >= 4) n += 1;
    return n;
  }
  function discardsOf(G) {
    let n = CFG.discards + (boonOf(G).discards || 0);
    for (const h of helperObjs(G)) if (h.set === 'discard') n += h.star === 3 ? 1 : h.star === 5 ? 2 : 0;
    return Math.max(0, n);
  }

  /* ================= ドラフト ================= */
  const RELATED = { // 助っ人テーマの関連（内包関係に基づく）
    pair: ['pair', 'twopair', 'triple', 'quad', 'fh'], twopair: ['pair', 'twopair', 'fh'], triple: ['pair', 'triple', 'quad', 'fh'],
    quad: ['pair', 'triple', 'quad'], straight: ['straight'], flush: ['flush', 'fh'], fh: ['pair', 'twopair', 'triple', 'fh'],
  };
  function isRelated(G, h) {
    const owned = helperObjs(G).filter((x) => x.kind === 'theme');
    if (!owned.length) return h.kind === 'theme' || h.set === 'combo';
    if (h.kind === 'special') return true;
    return owned.some((o) => RELATED[o.set].includes(h.set) || RELATED[h.set].includes(o.set));
  }
  function makeDraft(G, start) {
    const pool = HELPERS.filter((h) => G.P.unlocked.includes(h.id) && !G.helpers.includes(h.id));
    const stage = G.stage + (start ? 0 : 1);
    const wStar = (h) => (h.star === 3 ? (stage < 3 ? 3 : 2) : h.star === 4 ? (stage < 3 ? 2 : 3) : (stage < 3 ? 1 : 3));
    const cands = [];
    const rel = pool.filter((h) => isRelated(G, h));
    if (rel.length) cands.push(pickW(G, rel, wStar).id);
    while (cands.length < 3) {
      const rest = pool.filter((h) => !cands.includes(h.id));
      if (!rest.length) break;
      cands.push(pickW(G, rest, wStar).id);
    }
    return { cands, rerolls: 0 };
  }
  function rerollCost(G, d) { return d.rerolls === 0 ? 0 : CFG.price.rerollStep * d.rerolls; }
  function draftReroll(G) {
    const d = G.phase === 'draft' ? G.draft : G.sup && G.sup.draft;
    if (!d) return false;
    const c = rerollCost(G, d);
    if (G.cg < c) return false;
    G.cg -= c;
    const rr = d.rerolls + 1;
    const nd = makeDraft(G, G.phase === 'draft');
    nd.rerolls = rr;
    if (G.phase === 'draft') G.draft = nd; else G.sup.draft = nd;
    return true;
  }
  /** 助っ人を選ぶ。replaceId 指定で入れ替え。pick=null で見送り */
  function draftPick(G, id, replaceId) {
    const d = G.phase === 'draft' ? G.draft : G.sup && G.sup.draft;
    if (!d) return false;
    if (id != null) {
      if (!d.cands.includes(id)) return false;
      if (G.helpers.length >= helperSlots(G)) {
        if (!replaceId || !G.helpers.includes(replaceId)) return false;
        G.helpers[G.helpers.indexOf(replaceId)] = id;
      } else G.helpers.push(id);
      G.picked[id] = (G.picked[id] || 0) + 1;
    }
    if (G.phase === 'draft') { G.draft = null; beginBattle(G); } else G.sup.draft = null;
    return true;
  }

  /* ================= ダメージ計算 ================= */
  function cardVal(G, c) { return c.n + (G.P.numLv[c.n] || 0) * CFG.numLvBonus + (c.t === 'pow' ? CFG.trainVal.pow : 0); }

  /**
   * 提出札 sel（実際に提出する全札）のうち、roleCards（役判定に使う部分集合）で成立役を決め、ダメージを返す。
   * ctx: {piled, hp, fx:{final,add,madd}} 省略可。
   */
  function calcPlay(G, sel, roleCards, ctx) {
    ctx = ctx || (G.battle ? { piled: G.battle.piled, hp: G.battle.hp, fx: G.battle.fx } : { piled: 0, hp: 5, fx: null });
    const ev = evalHand(roleCards);
    const R = ROLES[ev.role];
    const scoring = ev.idx.map((i) => roleCards[i]);
    const tags = ev.tags;
    const bd = { role: ev.role, scoring, sum: 0, base: R.base, adds: [], mult0: 0, madds: [], finals: [], echoes: [], active: [], cardNote: [] };
    let sum = 0, cadd = 0, cmadd = 0, cfinal = 1, cg = 0;
    for (const c of scoring) {
      sum += cardVal(G, c);
      if (c.t === 'cmb') { cmadd += CFG.trainVal.cmb; bd.cardNote.push('コンボ'); }
      if (c.t === 'mtl') { cfinal *= CFG.trainVal.mtl; bd.cardNote.push('メタル'); }
      if (c.t === 'gld') { cg += CFG.trainVal.gld; bd.cardNote.push('ゴールド'); }
    }
    bd.sum = sum;
    const roleLv = G.P.roleLv[ev.role] || 0;
    bd.mult0 = round2(R.mult * (1 + CFG.roleLvBonus * roleLv));
    let add = cadd, madd = cmadd, final = cfinal, echo = 0;
    if (cmadd) bd.madds.push(['コンボ札', cmadd]);
    if (cfinal !== 1) bd.finals.push(['メタル札', cfinal]);
    const piled = ctx.piled || 0;
    const compressed = Math.max(0, 52 - G.deck.length);
    for (const h of helperObjs(G)) {
      let hit = false;
      if (h.kind === 'theme') {
        const tag = THEME_BY_ID[h.set].tag;
        if (!tags.includes(tag)) continue;
        hit = true;
        if (h.star === 3) { add += h.v; bd.adds.push([h.name, h.v]); }
        else if (h.star === 4) { madd += h.v; bd.madds.push([h.name, h.v]); }
        else { final *= 1 + h.v; bd.finals.push([h.name, 1 + h.v]); }
      } else if (h.set === 'combo') {
        if (sel.length === 5) { echo += h.v; hit = true; bd.echoes.push([h.name, h.v]); }
      } else if (h.set === 'pile') {
        if (!piled) continue; hit = true;
        if (h.star === 3) { add += h.v * piled; bd.adds.push([h.name, h.v * piled]); }
        else if (h.star === 4) { madd += h.v * piled; bd.madds.push([h.name, round2(h.v * piled)]); }
        else { const f = 1 + h.v * piled; final *= f; bd.finals.push([h.name, round2(f)]); }
      } else if (h.set === 'compress') {
        if (!compressed) continue; hit = true;
        if (h.star === 3) { add += h.v * compressed; bd.adds.push([h.name, h.v * compressed]); }
        else if (h.star === 4) { madd += h.v * compressed; bd.madds.push([h.name, round2(h.v * compressed)]); }
        else { const f = 1 + h.v * compressed; final *= f; bd.finals.push([h.name, round2(f)]); }
      } else if (h.set === 'econ' && h.star === 5) {
        const f = 1 + Math.min(0.6, Math.floor(G.cg / 100) * 0.04);
        if (f > 1) { final *= f; hit = true; bd.finals.push([h.name, round2(f)]); }
      }
      if (hit) bd.active.push(h.id);
    }
    for (const l of G.loots) {
      if (!lootCondOk(l, tags, sel.length, ctx.hp)) continue;
      const info = lootInfo(l), v = info.v;
      switch (l.b) {
        case 'add': add += v; bd.adds.push([info.name, v]); break;
        case 'madd': madd += v; bd.madds.push([info.name, v]); break;
        case 'final': final *= 1 + v; bd.finals.push([info.name, 1 + v]); break;
        case 'card': add += v * scoring.length; bd.adds.push([info.name, v * scoring.length]); break;
        case 'echo': echo += v; bd.echoes.push([info.name, v]); break;
        case 'cg': cg += v; break;
        case 'pile': if (piled) { add += v * piled; bd.adds.push([info.name, v * piled]); } break;
        case 'cardm': madd += v * scoring.length; bd.madds.push([info.name, round2(v * scoring.length)]); break;
      }
      bd.active.push('L:' + info.name);
    }
    const fx = ctx.fx;
    if (fx) {
      if (fx.add) { add += fx.add; bd.adds.push(['かがみ', fx.add]); }
      if (fx.madd) { madd += fx.madd; bd.madds.push(['むすびめ', fx.madd]); }
      if (fx.final !== 1) { final *= fx.final; bd.finals.push(['ほしくず', fx.final]); }
    }
    bd.addTotal = add; bd.maddTotal = round2(madd); bd.finalTotal = round2(final); bd.echo = echo;
    bd.rawBase = sum + R.base + add;
    bd.rawMult = bd.mult0 + madd;
    bd.dmg = Math.floor(bd.rawBase * bd.rawMult * final * (1 + echo));
    bd.cg = cg;
    bd.tags = tags;
    bd.rest = sel.filter((c) => !scoring.includes(c));
    return bd;
  }

  /** 選択札に対し、予測ダメージ最大の役・得点札を自動採用（部分集合を総当り）。 */
  function bestPlay(G, sel, ctx) {
    const n = sel.length;
    let best = null;
    for (let m = 1; m < (1 << n); m++) {
      const sub = [];
      for (let i = 0; i < n; i++) if (m & (1 << i)) sub.push(sel[i]);
      const r = calcPlay(G, sel, sub, ctx);
      if (!best || r.dmg > best.dmg) best = r;
    }
    return best;
  }

  /* ================= 戦闘 ================= */
  function stageInfo(G, stage) {
    stage = stage == null ? G.stage : stage;
    const type = STAGE_TYPE[stage];
    const ch = Math.floor(stage / 3);
    let name;
    if (type === 'boss') name = ENEMY_NAMES.boss;
    else if (type === 'strong') name = ENEMY_NAMES.strong[ch];
    else name = ENEMY_NAMES.normal[ch * 2 + (stage % 3)];
    return { stage, type, chapter: ch, name, hp: enemyHp(stage, G.diff), art: type === 'boss' ? 'boss_' + (ch + 1) : type === 'strong' ? 'strong_' + (ch + 1) : 'mob_' + (ch * 2 + (stage % 3) + 1) };
  }
  function beginBattle(G) {
    const info = stageInfo(G);
    const deck = G.deck.map((c) => ({ ...c }));
    shuffle(G, deck);
    G.phase = 'battle';
    G.battle = {
      hp: maxHp(G), maxHp: maxHp(G), enemyMax: info.hp, enemyHp: info.hp, deck, discardPile: [], hand: [],
      discardsLeft: discardsOf(G), piled: 0, attacks: 0, fx: { final: 1, add: 0, madd: 0 }, shield: false, reshuffles: 0,
      usedRoles: {}, usedNums: {}, log: [], over: null, cgBonus: 0, handSize: handSizeOf(G),
    };
    draw(G, G.battle.handSize);
    return G;
  }
  function draw(G, n) {
    const b = G.battle;
    for (let i = 0; i < n; i++) {
      if (!b.deck.length) {
        if (!b.discardPile.length) return;
        b.deck = shuffle(G, b.discardPile); b.discardPile = [];
        b.reshuffles++;
        b.hp -= 1; b.log.push('山札が尽きた！耐久-1');
        if (b.hp <= 0) { endBattle(G, false); return; }
      }
      b.hand.push(b.deck.pop());
    }
  }
  function takeCards(b, uids) {
    const out = [];
    for (const u of uids) { const i = b.hand.findIndex((c) => c.u === u); if (i < 0) return null; out.push(b.hand[i]); }
    return out;
  }
  function removeFromHand(b, cards) { for (const c of cards) b.hand.splice(b.hand.indexOf(c), 1); }

  function doDiscard(G, uids) {
    const b = G.battle;
    if (!b || b.over || b.discardsLeft <= 0 || !uids.length || uids.length > 5) return false;
    const cards = takeCards(b, uids);
    if (!cards || new Set(uids).size !== uids.length) return false;
    removeFromHand(b, cards);
    b.discardPile.push(...cards);
    b.discardsLeft--; b.piled += cards.length;
    draw(G, b.handSize - b.hand.length);
    return true;
  }
  function doAttack(G, uids, forcedRoleCards) {
    const b = G.battle;
    if (!b || b.over || !uids.length || uids.length > 5 || new Set(uids).size !== uids.length) return null;
    const cards = takeCards(b, uids);
    if (!cards) return null;
    const res = forcedRoleCards ? calcPlay(G, cards, forcedRoleCards) : bestPlay(G, cards);
    b.attacks++;
    removeFromHand(b, cards);
    // 経験値（同一戦闘・同一役1回／同一数字1回）
    b.usedRoles[res.role] = 1;
    for (const c of res.scoring) b.usedNums[c.n] = 1;
    G.stats.maxDmg = Math.max(G.stats.maxDmg, res.dmg);
    b.fx = { final: 1, add: 0, madd: 0 };
    b.enemyHp -= res.dmg;
    const win = b.enemyHp <= 0;
    // メタル札：1/4で逃走（デッキから恒久除去）
    const fled = [];
    for (const c of cards) {
      if (c.t === 'mtl' && rnd(G) < 0.25) fled.push(c);
    }
    for (const c of cards) {
      if (fled.includes(c)) { G.deck = G.deck.filter((d) => d.u !== c.u); } else b.discardPile.push(c);
    }
    res.fled = fled;
    if (win) {
      b.cgBonus += res.cg;
      b.enemyHp = 0;
      endBattle(G, true, res);
    } else {
      if (b.shield) b.shield = false; else b.hp -= 1;
      if (b.hp <= 0) endBattle(G, false, res);
      else draw(G, b.handSize - b.hand.length);
    }
    return res;
  }
  function endBattle(G, won, res) {
    const b = G.battle;
    b.over = won ? 'win' : 'lose';
    G.stats.battles++;
    for (const r in b.usedRoles) G.exp.roles[r] = (G.exp.roles[r] || 0) + 1;
    for (const n in b.usedNums) G.exp.nums[n] = (G.exp.nums[n] || 0) + 1;
    if (won) {
      const R = CFG.reward;
      let cg = R.base + R.perStage * G.stage + R.speed * Math.max(0, 5 - b.attacks);
      cg *= boonOf(G).rewardMul || 1;
      let flat = b.cgBonus;
      for (const h of helperObjs(G)) if (h.set === 'econ') flat += h.v;
      b.reward = Math.round(cg + flat);
      G.cg += b.reward;
    }
  }
  /** 戦闘終了後の遷移 */
  function afterBattle(G) {
    const b = G.battle;
    if (!b || !b.over) return false;
    if (b.over === 'lose') { G.phase = 'result'; G.won = false; return true; }
    if (G.stage === 8) { G.phase = 'result'; G.won = true; return true; }
    if (STAGE_TYPE[G.stage] === 'strong') { G.lootChoice = makeLoot(G); G.phase = 'loot'; return true; }
    enterSupply(G); return true;
  }
  function makeLoot(G) {
    const out = [];
    while (out.length < 3) {
      const l = { b: LOOT_BASES[rint(G, 8)].id, a: LOOT_AFFIXES[rint(G, 6)].id };
      if (!out.some((x) => x.b === l.b && x.a === l.a)) out.push(l);
    }
    return out;
  }
  /** 戦利品：idx を選ぶ。mode='equip'(replaceIdx 指定で入れ替え)/'sell'。 */
  function lootChoose(G, idx, mode, replaceIdx) {
    if (G.phase !== 'loot') return false;
    const l = G.lootChoice[idx]; if (!l) return false;
    if (mode === 'sell') G.cg += CFG.price.sellLoot;
    else if (G.loots.length < CFG.lootSlots) G.loots.push(l);
    else if (replaceIdx != null && G.loots[replaceIdx]) G.loots[replaceIdx] = l;
    else return false;
    G.lootChoice = null;
    enterSupply(G);
    return true;
  }
  function sellEquipped(G, i) {
    if (!G.loots[i]) return false;
    G.loots.splice(i, 1); G.cg += CFG.price.sellLoot; return true;
  }

  /* ================= 補給（ドラフト・商店・工房） ================= */
  function enterSupply(G) {
    G.phase = 'supply';
    const no = G.supplyNo++;
    const sup = { no, draft: null, shop: [], mods: 0, removes: 0, train: null, scout: null };
    if (CFG.draftSupplies.includes(no)) sup.draft = makeDraft(G, false);
    const ids = shuffle(G, ITEMS.map((i) => i.id)).slice(0, 3);
    sup.shop = ids.map((id) => ({ id, sold: false }));
    G.sup = sup;
  }
  function nextBattle(G) {
    if (G.phase !== 'supply') return false;
    G.stage++; G.sup = null; beginBattle(G); return true;
  }
  function itemPrice(G, id) {
    return ITEM_BY_ID[id].price;
  }
  function buyItem(G, i) {
    const s = G.sup && G.sup.shop[i];
    if (!s || s.sold) return false;
    const p = itemPrice(G, s.id);
    if (G.cg < p || G.items.length >= itemSlots(G)) return false;
    G.cg -= p; s.sold = true; G.items.push(s.id); return true;
  }
  const TRAIN_NAMES = { pow: 'パワー', cmb: 'コンボ', gld: 'ゴールド', wld: 'ワイルド', mtl: 'メタル' };
  const TRAIN_TEXT = {
    pow: `数字+${CFG.trainVal.pow}`, cmb: `得点札になると倍率+${CFG.trainVal.cmb}`, gld: `得点札で撃破するとCG+${CFG.trainVal.gld}`,
    wld: '全紋章扱い', mtl: `得点札になると最終倍率×${CFG.trainVal.mtl}（使うたび1/4でデッキから逃走）`,
  };
  function canMod(G, kind) {
    const s = G.sup; if (!s) return false;
    if (s.mods >= CFG.supplyModLimit) return false;
    if (kind === 'remove' && s.removes >= CFG.supplyRemoveLimit) return false;
    return G.cg >= CFG.price[kind];
  }
  /** 訓練：種類を選ぶと山札から3枚引いて提示（支払いはここで確定）。 */
  function trainStart(G, type) {
    if (!canMod(G, 'train') || G.sup.train || !TRAIN_NAMES[type]) return false;
    const pool = shuffle(G, G.deck.map((c) => c.u)).slice(0, 3);
    if (!pool.length) return false;
    G.cg -= CFG.price.train; G.sup.mods++;
    G.sup.train = { type, cands: pool };
    return true;
  }
  function trainApply(G, uid) {
    const tr = G.sup && G.sup.train;
    if (!tr || !tr.cands.includes(uid)) return false;
    const c = G.deck.find((x) => x.u === uid);
    c.t = tr.type; G.sup.train = null; return true;
  }
  function scoutStart(G) {
    if (!canMod(G, 'scout') || G.sup.scout) return false;
    const pool = shuffle(G, G.deck.map((c) => c.u)).slice(0, 3);
    G.cg -= CFG.price.scout; G.sup.mods++;
    G.sup.scout = pool;
    return true;
  }
  function scoutApply(G, uid) {
    const sc = G.sup && G.sup.scout;
    if (!sc || !sc.includes(uid)) return false;
    const src = G.deck.find((x) => x.u === uid);
    G.deck.push({ u: G.uidn++, n: src.n, s: src.s, t: src.t });
    G.sup.scout = null; return true;
  }
  function removeCard(G, uid) {
    if (!canMod(G, 'remove')) return false;
    const i = G.deck.findIndex((c) => c.u === uid);
    if (i < 0 || G.deck.length <= 20) return false;
    G.cg -= CFG.price.remove; G.sup.mods++; G.sup.removes++;
    G.deck.splice(i, 1); return true;
  }

  /* ================= どうぐ ================= */
  function useItem(G, slot, targetUid) {
    const b = G.battle;
    if (!b || b.over) return false;
    const id = G.items[slot]; if (!id) return false;
    switch (id) {
      case 'torch': b.discardsLeft++; break;
      case 'wind': {
        b.discardPile.push(...b.hand); b.hand = [];
        draw(G, b.handSize); break;
      }
      case 'dust': b.fx.final *= 1.5; break;
      case 'charm': if (b.hp >= b.maxHp + 2) return false; b.hp++; break;
      case 'mirror': b.fx.add += 120; break;
      case 'knot': b.fx.madd += 2; break;
      case 'pouch': draw(G, Math.min(2, CFG.handCap - b.hand.length)); break;
      case 'signal': b.enemyHp = Math.max(1, Math.ceil(b.enemyHp * 0.8)); break;
      case 'prism': { const c = b.hand.find((x) => x.u === targetUid); if (!c) return false; c.w = 1; break; }
      case 'cheer': b.shield = true; break;
    }
    G.items.splice(slot, 1);
    return true;
  }

  /* ================= セーブ ================= */
  function serialize(G, P) { return JSON.stringify({ G, P }); }

  return {
    CFG, SUITS, ROLES, ROLE_ORDER, TAG_NAMES, HELPERS, HELPER_BY_ID, THEMES, SPECIALS, THEME_BY_ID, CHARAS,
    LOOT_BASES, LOOT_AFFIXES, ITEMS, ITEM_BY_ID, BOONS, BOON_BY_ID, STAGE_TYPE, CHAPTER_NAMES,
    evalHand, calcPlay, bestPlay, enemyHp, stageInfo, helperText, lootInfo, lootCondOk, cardVal,
    rnd, rint, shuffle, clone, newPersist, maxPersist, gainExp, applyRunToPersist, helperUnlocked,
    newRun, helperSlots, itemSlots, maxHp, handSizeOf, discardsOf, isRelated, RELATED,
    draftReroll, draftPick, rerollCost, beginBattle, doDiscard, doAttack, afterBattle, lootChoose, sellEquipped,
    enterSupply, nextBattle, buyItem, itemPrice, trainStart, trainApply, scoutStart, scoutApply, removeCard, canMod, TRAIN_NAMES, TRAIN_TEXT,
    useItem, serialize, makeDeck, draw,
  };
});
