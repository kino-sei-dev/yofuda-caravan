/* 夜札のキャラバン — UI（スマホ縦画面前提）。ゲームロジックは core.js、保存は save.js。 */
(function () {
  'use strict';
  const Y = window.YC, SV = window.YCSave;
  const app = document.getElementById('app');
  const modal = document.getElementById('modal');
  let S; // {v,P,G,settings}
  const ui = { screen: 'title', sel: [], sort: 'num', diff: 'normal', boon: 'std', startRemove: [], tab: 'helper', last: null, pendingPrism: null, replaceFor: null, deckMode: null, toast: null, saveErr: null, importMsg: '' };

  /* ---------- 共通 ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function art(file, label, cls, glyph) {
    const h = hash(file) % 360;
    return `<div class="art ${cls || ''}" style="--c1:hsl(${h},40%,28%);--c2:hsl(${(h + 40) % 360},45%,12%)" title="${esc(label)}"><span class="ph">${glyph || '★'}</span><img src="${file}.webp" alt="${esc(label)}" loading="lazy" onerror="this.remove()"></div>`;
  }
  const GLYPH = { pair: '双', twopair: '二', triple: '三', quad: '四', straight: '橋', flush: '紋', fh: '館', combo: '撃', econ: '銭', discard: '捨', pile: '札', compress: '縮' };
  const SUIT_SVG = [
    '<svg viewBox="0 0 20 20"><polygon points="10,1 12.5,7.5 19,8 14,12.5 15.5,19 10,15.5 4.5,19 6,12.5 1,8 7.5,7.5" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 20 20"><path d="M14 2a8 8 0 1 0 4 14A7 7 0 0 1 14 2z" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 20 20"><polygon points="10,1 16,10 10,19 4,10" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 20 20"><g fill="currentColor"><circle cx="10" cy="5" r="4"/><circle cx="10" cy="15" r="4"/><circle cx="5" cy="10" r="4"/><circle cx="15" cy="10" r="4"/></g></svg>',
  ];
  const SUIT_COL = ['#a8801c', '#2a77a0', '#b43c26', '#3f8a3a'];
  const NL = (n) => (n === 14 ? 'A' : n === 13 ? 'K' : n === 12 ? 'Q' : n === 11 ? 'J' : String(n));
  const TRAIN_BADGE = { pow: 'P', cmb: 'C', gld: 'G', wld: 'W', mtl: 'M' };
  function cardHTML(c, o) {
    o = o || {};
    const face = c.n >= 11 && c.n <= 13 ? `<span class="face" style="background-image:url(face_${c.n - 10}.webp)"></span>` : '';
    const wild = c.t === 'wld' || c.w === 1;
    const st = `${o.style || ''}`;
    return `<div class="card c${c.s} ${o.sel ? 'sel' : ''} ${o.cls || ''}" data-u="${c.u}" style="${st}" ${o.act ? `data-act="${o.act}"` : ''}>${face}<b>${NL(c.n)}</b><span style="color:${SUIT_COL[c.s]}">${SUIT_SVG[c.s]}</span>${c.t ? `<i class="badge">${TRAIN_BADGE[c.t]}</i>` : wild ? '<i class="badge">W</i>' : ''}</div>`;
  }
  function stars(n) { return '★'.repeat(n); }
  function helperCard(h, o) {
    o = o || {};
    return `<div class="helper ${o.on ? 'on' : ''} ${o.cls || ''}" ${o.act ? `data-act="${o.act}" data-id="${h.id}"` : ''}>${art('char_' + String(h.chara).padStart(2, '0'), h.name, '', GLYPH[h.set])}<div style="flex:1;min-width:0"><div><b>${esc(h.name)}</b> <span class="star">${stars(h.star)}</span> <span class="tiny">${esc(h.setName)}</span></div><div class="small">${esc(Y.helperText(h))}</div></div>${o.btn || ''}</div>`;
  }
  function toast(msg) { ui.toast = msg; render(); setTimeout(() => { if (ui.toast === msg) { ui.toast = null; render(); } }, 2200); }
  function persist() { ui.saveErr = SV.save(localStorage, S); }
  function commit() { persist(); render(); }
  function confirmDlg(text, onOk, okLabel) {
    modal.hidden = false;
    modal.innerHTML = `<div class="modal-bg"><div class="modal"><p>${text}</p><div class="row between" style="margin-top:12px"><button data-m="no">もどる</button><button class="danger" data-m="ok">${okLabel || 'つづける'}</button></div></div></div>`;
    modal.onclick = (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      modal.hidden = true; modal.innerHTML = ''; modal.onclick = null;
      if (b.dataset.m === 'ok') onOk();
    };
  }
  const G = () => S.G;

  /* ---------- 画面振り分け ---------- */
  function screen() {
    if (ui.screen) return ui.screen;
    if (!S.G) return 'title';
    return { draft: 'draft', battle: 'battle', supply: 'supply', loot: 'loot', result: 'result' }[S.G.phase] || 'title';
  }
  function render() {
    const s = screen();
    const fn = { title, boon, draft, battle, supply, loot, result, codex, settings }[s];
    app.innerHTML = (ui.saveErr ? `<div class="warn">${esc(ui.saveErr)}（設定画面のセーブコードで手動バックアップできます）</div>` : '') + fn();
    if (ui.toast) app.insertAdjacentHTML('beforeend', `<div class="toast">${esc(ui.toast)}</div>`);
  }

  /* ---------- タイトル ---------- */
  function title() {
    const P = S.P;
    const g = S.G;
    return `<div class="panel" style="text-align:center">${art('kv', '夜札のキャラバン', 'kv', '夜札')}<h1 style="margin-top:10px">夜札のキャラバン</h1><div class="small">星図の夜を渡る、札とキャラバンのローグライク</div></div>
    ${g && g.phase !== 'result' ? `<button class="pri wide" data-act="continue">つづきから（第${g.stage + 1}戦・${{ easy: 'やさしい', normal: 'ふつう', deep: '深層' }[g.diff]}）</button>` : ''}
    <div class="panel"><h3>あたらしく旅に出る</h3><div class="row gap">${['easy', 'normal', 'deep'].map((d) => `<button class="tab ${ui.diff === d ? 'on' : ''}" data-act="diff" data-d="${d}">${{ easy: 'やさしい', normal: 'ふつう', deep: '深層' }[d]}</button>`).join('')}</div>
    <button class="pri wide" style="margin-top:8px" data-act="newrun">加護を選んではじめる</button></div>
    <div class="row gap"><button class="wide" data-act="go" data-s="codex">図鑑</button><button class="wide" data-act="go" data-s="settings">設定・セーブ</button></div>
    <div class="small panel">ラン ${P.runs} 回／クリア ${P.clears.easy + P.clears.normal + P.clears.deep} 回／最高到達 第${P.bestStage}戦</div>`;
  }

  /* ---------- 加護選択 ---------- */
  function boon() {
    const B = Y.BOON_BY_ID[ui.boon];
    let h = `<h2>加護を選ぶ</h2>` + Y.BOONS.map((b) => {
      const un = S.P.boons.includes(b.id);
      return `<div class="panel ${un ? '' : 'locked'} ${ui.boon === b.id ? 'helper on' : ''}" ${un ? `data-act="pickboon" data-b="${b.id}"` : ''} style="display:block"><b>${b.name}</b><div class="small">${b.text}</div>${un ? '' : `<div class="tiny">解放条件：${b.unlock}</div>`}</div>`;
    }).join('');
    if (B.startRemove) {
      const deck = Y.makeDeck({ uidn: 1 });
      h += `<div class="panel"><h3>最初に除く札（最大${B.startRemove}枚・${ui.startRemove.length}選択中）</h3><div>${deck.map((c) => cardHTML(c, { cls: 'static mini', sel: ui.startRemove.includes(c.u), act: 'togglestart' })).join('')}</div></div>`;
    }
    h += `<div class="row between"><button data-act="go" data-s="title">もどる</button><button class="pri" data-act="startrun">この加護で出発</button></div>`;
    return h;
  }

  /* ---------- ドラフト ---------- */
  function draftPanel(g, d, startScreen) {
    const full = g.helpers.length >= Y.helperSlots(g);
    const cost = Y.rerollCost(g, d);
    return `<div class="panel"><h3>仲間をえらぶ（無料3択）</h3>${d.cands.map((id) => {
      const h = Y.HELPER_BY_ID[id];
      return helperCard(h, { btn: `<button class="pri" data-act="pick" data-id="${id}">${full ? 'いれかえ' : '仲間にする'}</button>` });
    }).join('')}
    ${ui.replaceFor ? `<div class="hint">入れ替える助っ人をタップしてください（もどるには「見送り」以外の操作）</div>` : ''}
    <div class="row between" style="margin-top:6px"><button data-act="reroll" ${g.cg < cost ? 'disabled' : ''}>リロール（${cost === 0 ? '無料' : cost + 'CG'}）</button><button data-act="skipdraft">見送る</button></div>
    <div class="tiny" style="margin-top:4px">候補のうち最低1名は今の構成に関連する系統から出ます。</div></div>`;
  }
  function ownedHelpers(g, swap) {
    const slots = Y.helperSlots(g);
    let h = '';
    for (let i = 0; i < slots; i++) {
      const id = g.helpers[i];
      if (id) h += helperCard(Y.HELPER_BY_ID[id], swap ? { act: 'replace', cls: 'sel' } : {});
      else h += `<div class="helper muted"><div class="art" style="width:44px;height:44px;border-radius:8px"></div>（空き枠）</div>`;
    }
    return h;
  }
  function draft() {
    const g = G();
    return `<h2>出発前の仲間えらび</h2><div class="small">助っ人は ${Y.helperSlots(g)} 枠。同じ系統の★3・★4・★5は重ねられます。</div>${draftPanel(g, g.draft)}<div class="panel"><h3>いまの仲間</h3>${ownedHelpers(g, !!ui.replaceFor)}</div>`;
  }

  /* ---------- 戦闘 ---------- */
  function sortedHand(b) {
    const h = b.hand.slice();
    if (ui.sort === 'num') h.sort((a, c) => c.n - a.n || a.s - c.s);
    else h.sort((a, c) => a.s - c.s || c.n - a.n);
    return h;
  }
  function roleChips(g, b) {
    // 手札から作れる役ごとの最大ダメージ候補（役名タップで札を自動選択）
    const best = {};
    const hand = b.hand, n = hand.length;
    const idx = [];
    (function rec(st) {
      if (idx.length) {
        const sub = idx.map((i) => hand[i]);
        const ev = Y.evalHand(sub);
        if (ev.idx.length === sub.length) {
          const r = Y.calcPlay(g, sub, sub);
          if (!best[r.role] || r.dmg > best[r.role].dmg) best[r.role] = { dmg: r.dmg, u: sub.map((c) => c.u), role: r.role };
        }
      }
      if (idx.length === 5) return;
      for (let i = st; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
    })(0);
    return Object.values(best).sort((a, c) => c.dmg - a.dmg).slice(0, 5);
  }
  function battle() {
    const g = G(), b = g.battle, info = Y.stageInfo(g);
    const sel = ui.sel.filter((u) => b.hand.some((c) => c.u === u));
    ui.sel = sel;
    const selCards = sel.map((u) => b.hand.find((c) => c.u === u));
    const res = selCards.length && !b.over ? Y.bestPlay(g, selCards) : null;
    const pct = Math.max(0, b.enemyHp / b.enemyMax * 100);
    const lethal = res && res.dmg >= b.enemyHp;
    const deckLow = b.deck.length < 6;
    const hand = sortedHand(b);
    const W = Math.min(464, window.innerWidth - 16), cw = 54, n = hand.length;
    const step = n > 1 ? Math.min(cw + 4, (W - cw) / (n - 1)) : 0, off = (W - (cw + step * (n - 1))) / 2;
    const handHtml = hand.map((c, i) => {
      const inScore = res && res.scoring.some((x) => x.u === c.u), inRest = res && res.rest.some((x) => x.u === c.u);
      return cardHTML(c, { sel: sel.includes(c.u), act: 'card', style: `left:${off + i * step}px;z-index:${i + 1}`, cls: inScore ? 'scoring' : inRest ? 'rest' : '' });
    }).join('');
    const tipN = S.P.runs < 2 && g.stats.battles < 2;
    let h = `<div class="panel"><div class="tiny">${Y.CHAPTER_NAMES[info.chapter]} ／ 第${g.stage + 1}戦${info.type === 'strong' ? '（強敵）' : info.type === 'boss' ? '（ボス）' : ''}</div>
    <div class="enemy">${art(info.art, info.name, '', '敵')}<div style="flex:1"><b>${esc(info.name)}</b><div class="bar"><i style="width:${pct}%"></i></div><div class="small">HP ${Math.max(0, b.enemyHp)} / ${b.enemyMax}</div>
    <div class="small">耐久 <span class="pips">${Array.from({ length: Math.max(b.maxHp, b.hp) }, (_, i) => `<span class="pip ${i < b.hp ? '' : 'off'}"></span>`).join('')}</span> ／ 山札 <span class="${deckLow ? 'hp-bad' : ''}">${b.deck.length}</span>枚 ／ CG ${g.cg}</div></div></div>
    ${deckLow ? '<div class="warn">山札が少ない！尽きると捨て札を戻して耐久-1。</div>' : ''}
    ${b.log.length ? `<div class="tiny red">${esc(b.log[b.log.length - 1])}</div>` : ''}</div>`;
    h += `<div class="hbar">${g.helpers.map((id) => { const hh = Y.HELPER_BY_ID[id]; return `<div class="hmini ${res && res.active.includes(id) ? 'on' : ''}">${art('char_' + String(hh.chara).padStart(2, '0'), hh.name, '', GLYPH[hh.set])}${esc(hh.name)}</div>`; }).join('')}</div>`;
    if (g.loots.length) h += `<div class="tiny gold">装備: ${g.loots.map((l) => esc(Y.lootInfo(l).name)).join('、')}</div>`;
    if (g.items.length) h += `<div class="row gap wrap" style="margin-top:4px">${g.items.map((id, i) => `<button class="chip sub" data-act="item" data-i="${i}" ${b.over ? 'disabled' : ''}>${Y.ITEM_BY_ID[id].name}</button>`).join('')}</div>`;
    if (ui.pendingPrism != null) h += '<div class="hint">プリズムを使う手札を1枚タップ</div>';
    if (tipN) h += `<div class="hint">札を最大5枚えらんで「たたかう」。役に使わない札も一緒に出せます。「すてる」で札を入れ替え（${b.discardsLeft}回）。耐久0か、倒しきれない攻撃が続くと敗北。</div>`;
    if (b.over) {
      h += `<div class="panel" style="text-align:center"><h2>${b.over === 'win' ? '撃破！' : '力尽きた…'}</h2>${b.over === 'win' ? `<div>CG +${b.reward}</div>` : '<div class="small">ここまでの経験は恒常成長に反映されます</div>'}<button class="pri wide" data-act="after">${b.over === 'win' ? (g.stage === 8 ? 'ラン結果へ' : 'つぎへ') : 'ラン結果へ'}</button></div>`;
    }
    h += `<div class="dmgpop">${ui.last ? `${esc(Y.ROLES[ui.last.role].name)}  ${ui.last.dmg} ダメージ！` : ''}</div>`;
    h += `<div class="row between"><div class="chips">${b.over ? '' : roleChips(g, b).map((c) => `<button class="chip sub" data-act="chip" data-u="${c.u.join(',')}">${Y.ROLES[c.role].name} ${c.dmg}</button>`).join('')}</div></div>`;
    h += `<div class="hand">${handHtml}</div>`;
    h += `<div class="row between"><div class="row gap"><button class="sortbtn" data-act="sort" data-k="num">数字順</button><button class="sortbtn" data-act="sort" data-k="suit">紋章順</button></div><div class="tiny">選択 ${sel.length}/5</div></div>`;
    h += `<div class="actions"><button class="sub" data-act="discard" ${b.over || !sel.length || b.discardsLeft <= 0 ? 'disabled' : ''}>すてる<small>残り${b.discardsLeft}回</small></button>
      <button class="pri atk" data-act="attack" ${b.over || !sel.length ? 'disabled' : ''}>たたかう${res ? `<small>${Y.ROLES[res.role].name} ${res.dmg}${lethal ? '・撃破見込み' : `・残${b.enemyHp - res.dmg}`}</small>` : '<small>札をえらぶ</small>'}</button></div>`;
    if (res) {
      const f = res;
      h += `<div class="panel bd"><div><span class="k">採用役</span>${Y.ROLES[f.role].name}（×${f.mult0}）</div>
      <div><span class="k">得点札</span>${f.scoring.map((c) => cardHTML(c, { cls: 'static mini scoring' })).join('')}<span class="small"> 合計 ${f.sum}</span></div>
      <div><span class="k">捨てるだけ</span>${f.rest.length ? f.rest.map((c) => cardHTML(c, { cls: 'static mini rest' })).join('') : 'なし'}</div>
      <div><span class="k">発動</span>${f.active.length ? f.active.map((id) => esc(id.startsWith('L:') ? id.slice(2) : Y.HELPER_BY_ID[id].name)).join('、') : 'なし'}</div>
      <div class="small" style="margin-top:4px">(札${f.sum} + 基礎${f.base} + 加算${f.addTotal}) × (倍率${f.mult0} + ${f.maddTotal}) × 最終${f.finalTotal}${f.echo ? ` × 追撃${(1 + f.echo).toFixed(2)}` : ''} = <b class="gold">${f.dmg}</b></div></div>`;
    }
    return h;
  }

  /* ---------- 補給 ---------- */
  function deckGrid(g, mode) {
    const cards = g.deck.slice().sort((a, b) => a.s - b.s || b.n - a.n);
    return `<div class="panel"><h3>デッキ ${g.deck.length}枚${mode === 'remove' ? '（除く札をタップ）' : ''}</h3><div>${cards.map((c) => cardHTML(c, { cls: 'static mini', act: mode === 'remove' ? 'rm' : '' })).join('')}</div><button class="wide" data-act="deckclose">とじる</button></div>`;
  }
  function supply() {
    const g = G(), s = g.sup, next = Y.stageInfo(g, g.stage + 1), P = Y.CFG.price;
    let h = `<h2>補給 <span class="gold">${g.cg} CG</span></h2><div class="small">次：第${g.stage + 2}戦 ${esc(next.name)}（${next.type === 'boss' ? 'ボス' : next.type === 'strong' ? '強敵' : '通常'}・HP ${next.hp}）</div>`;
    if (ui.deckMode) h += deckGrid(g, ui.deckMode);
    if (s.draft) h += draftPanel(g, s.draft);
    h += `<div class="panel"><h3>仲間（${g.helpers.length}/${Y.helperSlots(g)}）</h3>${ownedHelpers(g, !!ui.replaceFor)}</div>`;
    h += `<div class="panel"><h3>商店（どうぐ ${g.items.length}/${Y.itemSlots(g)}）</h3>${s.shop.map((it, i) => { const d = Y.ITEM_BY_ID[it.id]; return `<div class="helper"><div style="flex:1"><b>${d.name}</b> <span class="small">${d.text}</span></div><button ${it.sold || g.cg < d.price || g.items.length >= Y.itemSlots(g) ? 'disabled' : ''} data-act="buy" data-i="${i}">${it.sold ? '売切' : d.price + 'CG'}</button></div>`; }).join('')}
      ${g.items.length ? `<div class="small">持ち物: ${g.items.map((id) => Y.ITEM_BY_ID[id].name).join('、')}</div>` : ''}</div>`;
    h += `<div class="panel"><h3>工房（改造 ${s.mods}/${Y.CFG.supplyModLimit}・除去 ${s.removes}/${Y.CFG.supplyRemoveLimit}）</h3>`;
    if (s.train) h += `<div class="hint">「${Y.TRAIN_NAMES[s.train.type]}」を施す札を山札から引いた3枚から選ぶ</div><div>${s.train.cands.map((u) => cardHTML(g.deck.find((c) => c.u === u), { cls: 'static', act: 'trainpick' })).join('')}</div>`;
    else if (s.scout) h += `<div class="hint">デッキに複製を加える札を選ぶ（提示された3枚から）</div><div>${s.scout.map((u) => cardHTML(g.deck.find((c) => c.u === u), { cls: 'static', act: 'scoutpick' })).join('')}</div>`;
    else {
      h += `<div class="small">訓練（${P.train}CG）：</div><div class="row gap wrap">${Object.keys(Y.TRAIN_NAMES).map((t) => `<button class="chip sub" data-act="train" data-t="${t}" ${Y.canMod(g, 'train') ? '' : 'disabled'} title="${esc(Y.TRAIN_TEXT[t])}">${Y.TRAIN_NAMES[t]}</button>`).join('')}</div>
      <div class="tiny">${Object.keys(Y.TRAIN_NAMES).map((t) => `${Y.TRAIN_NAMES[t]}: ${Y.TRAIN_TEXT[t]}`).join(' ／ ')}</div>
      <div class="row gap wrap" style="margin-top:6px"><button data-act="scout" ${Y.canMod(g, 'scout') ? '' : 'disabled'}>スカウト（${P.scout}CG）</button><button data-act="removemode" ${Y.canMod(g, 'remove') ? '' : 'disabled'}>おわかれ（${P.remove}CG）</button><button data-act="deckview">デッキを見る</button></div>`;
    }
    h += `</div>`;
    if (g.loots.length) h += `<div class="panel"><h3>装備中の戦利品</h3>${g.loots.map((l, i) => { const f = Y.lootInfo(l); return `<div class="helper"><div style="flex:1"><b>${esc(f.name)}</b><div class="small">${esc(f.text)}</div></div><button data-act="sellloot" data-i="${i}">売却 +${P.sellLoot}</button></div>`; }).join('')}</div>`;
    h += `<button class="pri wide" data-act="nextbattle">つぎの戦闘へ</button>`;
    return h;
  }

  /* ---------- 戦利品 ---------- */
  function loot() {
    const g = G(), full = g.loots.length >= Y.CFG.lootSlots;
    let h = `<h2>戦利品をえらぶ</h2><div class="small">強敵のおたから。装備枠 ${g.loots.length}/${Y.CFG.lootSlots}（ラン終了で消えます）。</div>`;
    h += g.lootChoice.map((l, i) => { const f = Y.lootInfo(l); return `<div class="panel"><b class="gold">${esc(f.name)}</b><div class="small">${esc(f.text)}</div><div class="row gap" style="margin-top:6px">${full ? g.loots.map((x, j) => `<button class="chip sub" data-act="lootrep" data-i="${i}" data-j="${j}">「${esc(Y.lootInfo(x).name)}」と入れ替え</button>`).join('') : `<button class="pri" data-act="lootequip" data-i="${i}">装備する</button>`}<button data-act="lootsell" data-i="${i}">売却 +${Y.CFG.price.sellLoot}CG</button></div></div>`; }).join('');
    return h;
  }

  /* ---------- ラン結果 ---------- */
  function applyResult(g) {
    if (g.applied) return;
    const before = { n: Y.clone(S.P.numLv), r: Y.clone(S.P.roleLv), b: S.P.boons.slice() };
    Y.applyRunToPersist(S.P, g);
    g.applied = true; g.gain = [];
    for (const k in S.P.roleLv) if (S.P.roleLv[k] > before.r[k]) g.gain.push(`${Y.ROLES[k].name} Lv${before.r[k]}→${S.P.roleLv[k]}`);
    for (const k in S.P.numLv) if (S.P.numLv[k] > before.n[k]) g.gain.push(`数字${NL(+k)} Lv${before.n[k]}→${S.P.numLv[k]}`);
    for (const b of S.P.boons) if (!before.b.includes(b)) g.gain.push(`加護「${Y.BOON_BY_ID[b].name}」解放`);
    persist();
  }
  function result() {
    const g = G(); applyResult(g);
    return `<h2>${g.won ? 'キャラバンは夜明けを迎えた！' : 'キャラバンは夜に沈んだ…'}</h2>
    <div class="panel">到達：第${g.stage + 1}戦 ／ 最大ダメージ ${g.stats.maxDmg} ／ 助っ人 ${g.helpers.map((id) => esc(Y.HELPER_BY_ID[id].name)).join('、') || 'なし'}</div>
    <div class="panel"><h3>恒常成長</h3>${g.gain.length ? g.gain.map((t) => `<div class="green">▲ ${esc(t)}</div>`).join('') : '<div class="small">レベルアップはありませんでした（経験値は蓄積されています）</div>'}</div>
    <button class="pri wide" data-act="finish">タイトルへ</button>`;
  }

  /* ---------- 図鑑 ---------- */
  function lvRows(lv, ex, f, names) {
    return Object.keys(lv).map((k) => { const need = f(lv[k]); return `<div class="small row between"><span>${names(k)} Lv${lv[k]}</span><span class="tiny">${lv[k] >= Y.CFG.lvCap ? 'MAX' : ex[k] + '/' + need}</span></div><div class="lvbar"><i style="width:${lv[k] >= Y.CFG.lvCap ? 100 : ex[k] / need * 100}%"></i></div>`; }).join('');
  }
  function codex() {
    const tabs = [['helper', '助っ人'], ['include', '内包表'], ['growth', '成長'], ['items', '戦利品・どうぐ']];
    let h = `<div class="row between"><h2>図鑑</h2><button data-act="go" data-s="title">もどる</button></div><div class="row gap">${tabs.map(([k, n]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${n}</button>`).join('')}</div>`;
    if (ui.tab === 'helper') {
      h += Y.HELPERS.map((x) => {
        const un = Y.helperUnlocked(S.P, x);
        if (un) return helperCard(x);
        const sib = Y.HELPERS.find((y) => y.set === x.set && y.star === x.star - 1);
        const cond = x.star === 4 ? `「${sib.name}」を2回仲間にする（${S.P.picks[sib.id] || 0}/2）` : `「${sib.name}」を2回仲間にし、クリアする`;
        return `<div class="helper locked">${art('char_' + String(x.chara).padStart(2, '0'), '???', '', '？')}<div><b>？？？</b> <span class="star">${stars(x.star)}</span><div class="small">解放：${esc(cond)}</div></div></div>`;
      }).join('');
    } else if (ui.tab === 'include') {
      const tags = ['pair', 'twopair', 'triple', 'quad', 'straight', 'flush', 'fh'];
      h += `<div class="panel"><div class="small">基礎値に使うのは成立した最上位の役1つだけ。下表の「○」のタグが成立し、そのタグを条件にもつ助っ人が全員発動します。</div><table><tr><th>役</th><th>基礎/倍率</th>${tags.map((t) => `<th>${Y.TAG_NAMES[t]}</th>`).join('')}</tr>${Y.ROLE_ORDER.slice(1).map((r) => `<tr><td>${Y.ROLES[r].name}${Y.ROLES[r].ex ? '*' : ''}</td><td>${Y.ROLES[r].base}/×${Y.ROLES[r].mult}</td>${tags.map((t) => `<td>${Y.ROLES[r].tags.includes(t) ? '○' : ''}</td>`).join('')}</tr>`).join('')}</table><div class="tiny">*EX役（ワイルド・スカウト・圧縮が必要）。「フルハウス系」は役名がフルハウス／フラッシュハウスのとき。</div></div>`;
    } else if (ui.tab === 'growth') {
      h += `<div class="panel"><h3>数字Lv（+1/Lv・上限20）</h3>${lvRows(S.P.numLv, S.P.numExp, Y.CFG.expNum, (k) => '数字' + NL(+k))}</div><div class="panel"><h3>役Lv（威力+2%/Lv・上限20）</h3>${lvRows(S.P.roleLv, S.P.roleExp, Y.CFG.expRole, (k) => Y.ROLES[k].name)}</div>`;
    } else {
      h += `<div class="panel"><h3>戦利品（基礎8×接辞6）</h3>${Y.LOOT_BASES.map((b) => `<div class="small">${b.noun}：${b.text(b.v)}</div>`).join('')}<hr>${Y.LOOT_AFFIXES.map((a) => `<div class="small">${a.pre}〜：${a.cond}（効果×${a.m}）</div>`).join('')}</div><div class="panel"><h3>どうぐ</h3>${Y.ITEMS.map((i) => `<div class="small"><b>${i.name}</b>（${i.price}CG）${i.text}</div>`).join('')}</div>`;
    }
    return h;
  }

  /* ---------- 設定 ---------- */
  function settings() {
    return `<div class="row between"><h2>設定・セーブ</h2><button data-act="go" data-s="title">もどる</button></div>
    <div class="panel"><h3>セーブコード</h3><div class="small">端末の保存領域は消える可能性があります（ブラウザの設定、iOS Safari の自動削除など）。永続性は保証できないため、定期的にコードを控えておいてください。</div>
    <button class="wide" data-act="export" style="margin-top:6px">コードを書き出す</button><textarea id="codeOut" readonly placeholder="ここにコードが出ます"></textarea><button class="wide" data-act="copy">コピー</button></div>
    <div class="panel"><h3>読み込み</h3><textarea id="codeIn" placeholder="YC1.…"></textarea><button class="wide" data-act="import">コードを読み込む（現在のデータは上書き）</button><div class="small ${ui.importMsg.startsWith('OK') ? 'green' : 'red'}">${esc(ui.importMsg)}</div></div>
    <div class="panel"><h3>データ削除</h3><button class="danger wide" data-act="wipe">すべて削除</button></div>
    <div class="tiny">保存キー: ${SV.KEY} ／ バージョン ${SV.VERSION}</div>`;
  }

  /* ---------- 操作 ---------- */
  const H = {
    go(d) { ui.screen = d.s; ui.importMsg = ''; render(); },
    tab(d) { ui.tab = d.t; render(); },
    diff(d) { ui.diff = d.d; render(); },
    newrun() { ui.screen = 'boon'; ui.startRemove = []; render(); },
    pickboon(d) { ui.boon = d.b; ui.startRemove = []; render(); },
    togglestart(d, el) {
      const u = +el.dataset.u, B = Y.BOON_BY_ID[ui.boon], i = ui.startRemove.indexOf(u);
      if (i >= 0) ui.startRemove.splice(i, 1); else if (ui.startRemove.length < B.startRemove) ui.startRemove.push(u);
      render();
    },
    startrun() {
      const seed = ((Date.now() ^ Math.floor(Math.random() * 1e9)) | 0);
      S.G = Y.newRun(seed, ui.diff, ui.boon, S.P, { startRemove: ui.startRemove });
      ui.screen = null; ui.sel = []; ui.last = null; ui.replaceFor = null; commit();
    },
    continue() { ui.screen = null; ui.sel = []; render(); },
    sort(d) { ui.sort = d.k; render(); },
    card(d, el) {
      const u = +el.dataset.u, g = G(), b = g.battle;
      if (ui.pendingPrism != null) {
        if (Y.useItem(g, ui.pendingPrism, u)) { ui.pendingPrism = null; commit(); }
        return;
      }
      const i = ui.sel.indexOf(u);
      if (i >= 0) ui.sel.splice(i, 1); else if (ui.sel.length < 5) ui.sel.push(u);
      render();
    },
    chip(d) { ui.sel = d.u.split(',').map(Number); render(); },
    item(d) {
      const g = G(), id = g.items[+d.i];
      if (id === 'prism') { ui.pendingPrism = +d.i; render(); return; }
      Y.useItem(g, +d.i); commit();
    },
    discard() {
      const g = G(), b = g.battle, cards = ui.sel.map((u) => b.hand.find((c) => c.u === u));
      const go = () => { if (Y.doDiscard(g, ui.sel.slice())) { ui.sel = []; ui.last = null; commit(); } };
      const ev = cards.length >= 2 ? Y.evalHand(cards) : null;
      if (ev && ev.role !== 'high' && ev.idx.length >= 2) confirmDlg(`役（${Y.ROLES[ev.role].name}）が成立している札を捨てようとしています。捨てますか？`, go, 'すてる');
      else go();
    },
    attack() {
      const g = G(), b = g.battle, cards = ui.sel.map((u) => b.hand.find((c) => c.u === u));
      const res = Y.bestPlay(g, cards);
      const go = () => { const r = Y.doAttack(g, ui.sel.slice()); ui.last = r; ui.sel = []; commit(); };
      if (res.dmg < b.enemyHp && b.hp <= 1 && !b.shield) confirmDlg('この攻撃では倒しきれず、耐久が0になって敗北します。本当に攻撃しますか？', go, '攻撃する');
      else go();
    },
    after() { ui.last = null; ui.sel = []; Y.afterBattle(G()); commit(); },
    pick(d) {
      const g = G();
      if (g.helpers.length >= Y.helperSlots(g)) { ui.replaceFor = d.id; render(); return; }
      Y.draftPick(g, d.id); ui.replaceFor = null; commit();
    },
    replace(d) { if (ui.replaceFor) { Y.draftPick(G(), ui.replaceFor, d.id); ui.replaceFor = null; commit(); } },
    reroll() { Y.draftReroll(G()); ui.replaceFor = null; commit(); },
    skipdraft() { Y.draftPick(G(), null); ui.replaceFor = null; commit(); },
    buy(d) { Y.buyItem(G(), +d.i); commit(); },
    train(d) { Y.trainStart(G(), d.t); commit(); },
    trainpick(d, el) { Y.trainApply(G(), +el.dataset.u); commit(); },
    scout() { Y.scoutStart(G()); commit(); },
    scoutpick(d, el) { Y.scoutApply(G(), +el.dataset.u); commit(); },
    removemode() { ui.deckMode = 'remove'; render(); },
    deckview() { ui.deckMode = 'view'; render(); },
    deckclose() { ui.deckMode = null; render(); },
    rm(d, el) { if (Y.removeCard(G(), +el.dataset.u)) { if (!Y.canMod(G(), 'remove')) ui.deckMode = null; commit(); } else toast('除去できません'); },
    sellloot(d) { Y.sellEquipped(G(), +d.i); commit(); },
    nextbattle() {
      const g = G();
      const go = () => { Y.nextBattle(g); ui.sel = []; ui.last = null; ui.deckMode = null; ui.replaceFor = null; commit(); };
      if (g.sup.draft) confirmDlg('仲間えらびがまだ残っています。見送って進みますか？', () => { g.sup.draft = null; go(); }, '見送って進む');
      else go();
    },
    lootequip(d) { Y.lootChoose(G(), +d.i, 'equip'); commit(); },
    lootrep(d) { Y.lootChoose(G(), +d.i, 'equip', +d.j); commit(); },
    lootsell(d) { Y.lootChoose(G(), +d.i, 'sell'); commit(); },
    finish() { S.G = null; ui.screen = 'title'; commit(); },
    export() { const t = document.getElementById('codeOut'); t.value = SV.encode(S); t.select(); },
    copy() {
      const t = document.getElementById('codeOut'); if (!t.value) t.value = SV.encode(S);
      t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => toast('コピーしました'), () => { document.execCommand && document.execCommand('copy'); });
    },
    import() {
      try {
        const st = SV.decode(document.getElementById('codeIn').value);
        S = st; ui.importMsg = 'OK: 読み込みました'; persist();
      } catch (e) { ui.importMsg = 'エラー: ' + e.message; }
      render();
    },
    wipe() { confirmDlg('セーブデータをすべて削除します。元に戻せません。', () => { S = SV.fresh(Y.newPersist()); ui.screen = 'title'; commit(); }, '削除する'); },
  };
  // 手札のドラフト: 戦闘以外の「pick」ボタンが見送り中の置換ヒント用
  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const fn = H[t.dataset.act];
    if (fn) fn(t.dataset, t);
  });
  window.addEventListener('resize', () => { if (screen() === 'battle') render(); });

  const r = SV.load(localStorage, Y.newPersist);
  S = r.state; ui.saveErr = r.error;
  if (!S.G) ui.screen = 'title';
  render();
  window.__YC_DEBUG = { get S() { return S; }, ui };
})();
