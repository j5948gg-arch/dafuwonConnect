// 伺服器專用，不會傳給瀏覽器。與 engine.js 在同一個環境內執行。
const MODAL_FN = { offer: ['offerAccept', 'offerDecline', 'offerCancel'], ask: ['askPick', 'askSkip'], alloc: ['allocOk'], need: ['sellStock', 'sellEnough', 'sellLand', 'confirmNeed', 'cancelNeed'] };
const ALL_MODAL_FN = [].concat(...Object.values(MODAL_FN));

// 玩家送來的動作先在這裡驗證，再呼叫引擎函式
function safeAct(fn, a, ex) {
  if (phase === 'over' || !Array.isArray(a)) return;
  const int = (v) => Number.isInteger(v), reg = (r) => RK.includes(r);
  const m = offer ? 'offer' : ask ? 'ask' : alloc ? 'alloc' : need ? 'need' : '';
  if (m ? !MODAL_FN[m].includes(fn) : ALL_MODAL_FN.includes(fn)) return;
  const who = ex && ex.who;   // 由伺服器填入的座位編號（不是玩家自己送的）
  if (fn === 'offerAccept' || fn === 'offerDecline') { if (!offer || who !== offer.to) return; }
  else if (fn === 'offerCancel') { if (!offer || who !== offer.from) return; }
  else if (who !== turn) return;
  switch (fn) {
    case 'roll': return roll();
    case 'pick': return int(a[0]) && pick(a[0]);
    case 'buyLand': return buyLand();
    case 'buyout': return buyout();
    case 'upgradeAt': return int(a[0]) && T[a[0]] && upgradeAt(a[0]);
    case 'endTurn': return phase === 'act' && endTurn();
    case 'flipAt': return int(a[0]) && a[0] >= 0 && a[0] < 49 && flipAt(a[0]);
    case 'askPick': return int(a[0]) && ask.opts[a[0]] && askPick(a[0]);
    case 'askSkip': return ask.skip && askSkip();
    case 'allocOk':
      if (!ex || !ex.vals) return;
      RK.forEach((r) => (alloc.vals[r] = Math.max(0, Math.min(MAXH, Math.floor(+ex.vals[r] || 0)))));
      return allocOk();
    case 'trade':
      if (!reg(a[0]) || (a[1] !== 1 && a[1] !== -1)) return;
      qty[a[0]] = Math.max(1, Math.min(MAXT, Math.floor(+(ex && ex.q) || 1)));
      return trade(a[0], a[1]);
    case 'sellStock': return reg(a[0]) && int(a[1]) && a[1] > 0 && sellStock(a[0], a[1]);
    case 'sellEnough': return reg(a[0]) && sellEnough(a[0]);
    case 'sellLand': return int(a[0]) && sellLand(a[0]);
    case 'confirmNeed': return P[need.who].cash >= need.amount && confirmNeed();
    case 'closeExtra': return closeExtra();
    case 'offerMake': return a.length === 4 && a.every(int) && offerMake(a[0], a[1], a[2], a[3]);
    case 'offerAccept': return offerAccept();
    case 'offerDecline': return offerDecline();
    case 'offerCancel': return offerCancel();
    case 'cancelNeed': return !need.forced && cancelNeed();
  }
}

// AI（也用來代打離線太久的玩家）：每次呼叫只做一個動作
function aiStep() {
  if (phase === 'over' || busy) return;
  if (offer) return offer.from === turn ? offerCancel() : undefined; // 代打中的玩家有交易還沒結案：取消
  const i = turn, p = P[i], t = T[p.pos], pick1 = (a) => a[Math.random() * a.length | 0];
  if (alloc) return allocOk();
  if (ask) return askPick(Math.random() * ask.opts.length | 0);
  if (need) {
    if (p.cash >= need.amount) return confirmNeed();
    const r = RK.find((x) => p.st[x] > 0);
    if (r) return sellEnough(r);
    const ls = lands(i).sort((x, y) => landVal(x) - landVal(y));
    if (ls.length) return sellLand(ls[0].id);
    return need.forced ? confirmNeed() : cancelNeed();
  }
  if (extraOn) return aiTrade() || closeExtra();
  if (phase === 'roll') return roll();
  if (choices) return pick(PRO[i] ? proChoose(i) : pick1(choices));
  if (phase !== 'act') return;
  const c = p.cash, own = t.type === 'land' ? owner[t.id] : undefined;
  if (t.type === 'land' && own === undefined && c >= t.price + 3000) return buyLand();
  if (t.type === 'land' && own !== undefined && own !== i && c >= MAP.BUYOUT_MULT * t.price + 15000 && (lv[t.id] || 0) <= MAP.BUYOUT_MAX_LV) return buyout();
  if (!upFull()) {
    const pool = t.type === 'start' || (t.type === 'stock' && noTrade()) || onOwnS() ? lands(i) : t.type === 'land' && own === i && justBought !== t.id ? [t] : [];
    const ok = pool.filter((x) => (lv[x.id] || 0) < 5 && x.id !== justBought && !upIds.includes(x.id) && c >= upOf(x) + 5000);
    if (ok.length) return upgradeAt(pick1(ok).id);
  }
  if (t.type === 'gem' && !flipUsed) {
    const free = deck.map((d, k) => (d.by < 0 ? k : -1)).filter((k) => k >= 0);
    if (free.length) return flipAt(pick1(free));
  }
  if (t.type === 'stock' && !upUsed && aiTrade()) return;
  return endTurn();
}

// 股市交易：每區最多一次，有餘裕就買；回傳 true 表示這次動作了
function aiTrade() {
  const p = P[turn], c = p.cash;
  for (const r of RK) {
    if (traded[r]) continue;
    const q = Math.min(MAXH - p.st[r], MAXT, Math.floor((c - 8000) * 0.3 / stock[r]));
    if (q >= 1) { qty[r] = q; trade(r, 1); return true; }
    traded[r] = true;
  }
  return false;
}

// 被提出交易的是 AI（或暫離的玩家）時，由伺服器呼叫：對方出價夠高才接受
function aiRespond() {
  if (!offer) return;
  const o = offer, w = T[o.want], g = o.give >= 0 ? T[o.give] : null;
  let get = o.cash + (g ? landVal(g) : 0), lose = landVal(w);
  if (g && T.every((t) => t.type !== 'land' || t.region !== g.region || t.id === g.id || owner[t.id] === o.to)) get *= 1.5; // 補齊整區獨佔（股價、過路費 +20%、四塊地升級）
  if (monoOwner(w.region) === o.to) lose *= 2;                                                                          // 會拆掉自己的整區獨佔
  return get >= lose * 1.15 ? offerAccept() : offerDecline();
}

// ---------- 高階 AI：悄悄影響骰子點數（伺服器專用，不會出現在任何畫面或紀錄） ----------
let PRO = [];            // 哪些座位是高階 AI（開局時由伺服器填入）
let PRO_CTRL = 0.5, PRO_K = 12000;    // PRO_CTRL：約一半的擲骰會被修正，其餘仍是純隨機；PRO_K 越大，閃避貴地的力道越弱（實測：1 個高階 AI 對 3 個一般 AI 約 77% 勝率）
function proPaths(pos, prev, first, steps) {
  if (steps === 0) return [[]];
  const out = [];
  for (const to of MAP.options(pos, prev, first)) for (const rest of proPaths(to, pos, false, steps - 1)) out.push([to, ...rest]);
  return out;
}
// 這條路徑對玩家 i 的「好壞」：越高越想走。貴的對手地盤被壓低但不為零，所以仍有機率踩到。
function proWeight(i, path) {
  const p = P[i], gems = { ...p.gems };
  let gain = 0, cost = 0;
  path.forEach((id, k) => {
    const t = T[id];
    if (t.type === 'gem' && !gems[t.gem]) { gems[t.gem] = 1; gain += 3000; }
    if (t.type === 'start') {
      if (assets(i) >= MAP.WIN_ASSETS) gain += 1e6;                                  // 經過或停在起點就能獲勝
      if (MAP.GEM_KEYS.every((g) => gems[g])) gain += 8000;
    }
    if (k !== path.length - 1) return;
    if (t.type === 'start') gain += 1500;
    else if (t.type === 'stock') gain += p.cash > 15000 ? 1200 : 400;
    else if (t.type === 'gem') gain += 600;
    else if (t.type === 'land') {
      const o = owner[t.id];
      if (o === undefined) gain += p.cash >= t.price + 3000 ? 0.8 * t.price : 0;
      else if (o === i) gain += (lv[t.id] || 0) < 5 && p.cash >= upOf(t) + 5000 ? 3000 : 800;
      else if (!(p.shield > 0)) cost += tollOf(t);
    }
  });
  return (1 + gain / 4000) / (1 + cost / PRO_K);
}
function diceHook() {
  if (!PRO[turn] || Math.random() > PRO_CTRL) return 0;
  const p = P[turn];
  const w = [1, 2, 3, 4, 5, 6].map((d) => Math.max(...proPaths(p.pos, p.prev, true, d).map((pa) => proWeight(turn, pa))));
  let r = Math.random() * w.reduce((x, y) => x + y, 0);
  for (let d = 0; d < 6; d++) { r -= w[d]; if (r <= 0) return d + 1; }
  return 6;
}
// 遇到岔路時，高階 AI 選剩餘步數走完後比較好的方向（85%），否則隨機
function proChoose(i) {
  if (Math.random() < 0.15) return choices[Math.random() * choices.length | 0];
  const p = P[i];
  let best = choices[0], bw = -1;
  for (const to of choices) {
    const w = Math.max(...proPaths(to, p.pos, false, left - 1).map((rest) => proWeight(i, [to, ...rest])));
    if (w > bw) { bw = w; best = to; }
  }
  return best;
}
