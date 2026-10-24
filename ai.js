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
    const r = proNew(i) ? proSellPick(i) : RK.find((x) => p.st[x] > 0);
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
  const v2 = proV2(i), cc = v2 && PH.liq ? proLiquid(i) : c;   // 高階 AI：不留現金，缺錢時賣掉（已被自己拉抬過的）股票來付
  if (t.type === 'land' && own === undefined && (cc >= t.price + 3000 || proKeyLand(i, t))) return buyLand();
  if (t.type === 'land' && own !== undefined && own !== i && c >= MAP.BUYOUT_MULT * t.price + 15000 && (lv[t.id] || 0) <= MAP.BUYOUT_MAX_LV) return buyout();
  if (!upFull()) {
    const stockFirst = v2 && t.type === 'stock' && proPlan(i).length > 0;   // 在股市格有股票可做時，先買賣（買賣後本次就不能升級）
    const pool = t.type === 'start' || (t.type === 'stock' && noTrade() && !stockFirst) || onOwnS() ? lands(i) : t.type === 'land' && own === i && justBought !== t.id ? [t] : [];
    const ok = pool.filter((x) => (lv[x.id] || 0) < 5 && x.id !== justBought && !upIds.includes(x.id) && cc >= upOf(x) + (v2 ? proResv(i) : 5000));
    if (ok.length) return upgradeAt(v2 ? proUpPick(i, ok) : pick1(ok).id);
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
  if (proNew(turn)) return proTrade();
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
    else if (t.type === 'stock') gain += proNew(i) ? Math.min(STOCK_EDGE >= 30000 ? 30000 : 3500, 400 + STOCK_EDGE) : (p.cash > 15000 ? 1200 : 400);
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
  const p = P[turn]; STOCK_EDGE = proEdge(turn);
  const w = [1, 2, 3, 4, 5, 6].map((d) => Math.max(...proPaths(p.pos, p.prev, true, d).map((pa) => proWeight(turn, pa))));
  let r = Math.random() * w.reduce((x, y) => x + y, 0);
  for (let d = 0; d < 6; d++) { r -= w[d]; if (r <= 0) return d + 1; }
  return 6;
}
// 遇到岔路時，高階 AI 選剩餘步數走完後比較好的方向（85%），否則隨機
function proChoose(i) {
  if (Math.random() < 0.15) return choices[Math.random() * choices.length | 0];
  const p = P[i]; STOCK_EDGE = proEdge(i);
  let best = choices[0], bw = -1;
  for (const to of choices) {
    const w = Math.max(...proPaths(to, p.pos, false, left - 1).map((rest) => proWeight(i, [to, ...rest])));
    if (w > bw) { bw = w; best = to; }
  }
  return best;
}

// ---------- 高階 AI：股票策略 ----------
// 價格怎麼動：買地 +2%、升級 +1.5%、有人付過路費 +2%、每買賣 1 股 ±0.05%、集滿四塊地獨佔 +20%。
// 過路費與升級費都跟股價成正比，所以股價是「放大器」：
//   1. 持股在 AI 自己有地、而且活絡的區域：被踩過路費、升級都會推高股價，持股跟著賺。
//   2. 某區差一塊就被人獨佔（獨佔當下 +20%）：先卡位買進。
//   3. 每次買賣都會把股價推動 ±(0.05%×股數)，所有持股人一起賺或賠 → 比較「我的持股」與「對手的持股」：
//      對手（尤其領先者）持股比我多的區域，我不拉抬（反而幫對手賺）、反而賣出壓低股價，打擊他的總資產。
//   4. 保留足夠的現金應付對手的高額過路費；現金不夠時先賣掉最不划算的股票，不會被逼著賣地。
const PRO_STOCK_OFF = [];                 // 測試用：PRO_STOCK_OFF[座位] = true → 該高階 AI 沿用舊的簡單買股邏輯
const proNew = (i) => PRO[i] && !PRO_STOCK_OFF[i];
let STOCK_EDGE = 0;
// 策略參數（用模擬對戰調過；對舊版高階 AI 互打約 55:45）：key=關鍵土地（1=集滿獨佔、2=連擋下對手獨佔也買）、urg=領先者逼近門檻時壓股價的放大倍數、finish=自己差一點就達標時用買股拉抬衝刺、bias=大盤長期上漲的基本預期（遊戲裡股價平均會漲）、rev=股價相對初始價的回歸力道、hold=持股差距的權重、min=最低行動門檻、
// frac=每次投入「超出保留現金」的比例、act/own=活絡度與地盤對預期漲幅的權重、res=[保留現金下限, 上限, 對手過路費倍數]、mono=差一塊獨佔時的機率[自己, 別人]
const PRO_P = { key: 1, keyKeep: 8000, urg: 4, focus: 0, homeMin: 40, finish: 1, bias: 0.04, rev: 0, hold: 0.5, min: 0.03, frac: 0.3, act: 0.035, own: 0.06, res: [15000, 15000, 0], mono: [0.45, 0.25], harm: 1 };
function proDrift(i, r) {                 // 這一區股價未來一圈的預期漲幅（粗估）
  let mine = 0, theirs = 0, n = 0, free = 0; const cnt = {};
  T.forEach((t) => {
    if (t.type !== 'land' || t.region !== r) return;
    const o = owner[t.id];
    if (o === undefined) { free++; return; }
    n++; cnt[o] = (cnt[o] || 0) + 1;
    if (o === i) mine += tollOf(t); else theirs += tollOf(t);
  });
  const own = (mine + 1) / (mine + theirs + 2), rel = stock[r] / base[r];
  let d = PRO_P.bias + PRO_P.act * n / 4                               // 這區越多人買地、被踩，股價越容易漲
        + (n ? PRO_P.own * (own - 0.5) : 0)               // 我的地越多，越是我在推這區
        + Math.max(-0.12, Math.min(0.08, PRO_P.rev * (1.6 - rel)));   // 相對初始價太貴就轉保守、便宜就偏多
  for (const o in cnt) if (cnt[o] === 3 && free === 1) d += 0.2 * PRO_P.mono[+o === i ? 0 : 1]; // 差一塊就獨佔（+20%）
  return d;
}
function proReserve(i) {                  // 要保留的現金：對手最貴的兩塊地的過路費
  const tolls = T.filter((t) => t.type === 'land' && owner[t.id] !== undefined && owner[t.id] !== i).map(tollOf).sort((x, y) => y - x);
  return Math.max(PRO_P.res[0], Math.min(PRO_P.res[1], PRO_P.res[2] * ((tolls[0] || 0) + (tolls[1] || 0))));
}
function proPlanV1(i) {                   // 上一版：這回合在股市格可以做的買賣，依預期獲利排序
  const p = P[i], opp = P.map((_, j) => j).filter((j) => j !== i && P[j].alive), reserve = proReserve(i), out = [];
  const lead = opp.slice().sort((x, y) => assets(y) - assets(x))[0];
  // 領先者越接近獲勝門檻，越不能讓他的股票繼續漲：壓低股價的力道隨他的進度放大
  const u = lead === undefined ? 1 : 1 + PRO_P.urg * Math.max(0, (assets(lead) / MAP.WIN_ASSETS - 0.6) / 0.4);
  const home = RK.reduce((b, r) => (p.st[r] > (p.st[b] || 0) ? r : b), RK[0]);   // 我持股最多的區域（主力區）
  const A = assets(i);
  for (const r of RK) {
    if (traded[r]) continue;
    const my = p.st[r], pr = stock[r], drift = proDrift(i, r);
    const oppHold = opp.reduce((s, j) => s + P[j].st[r] * (j === lead ? u : 0.4), 0);
    const isHome = r === home && my >= PRO_P.homeMin;
    const qb = Math.min(MAXT, MAXH - my, Math.floor((p.cash - reserve) * (isHome && PRO_P.focus ? 1 : PRO_P.frac) / pr));
    if (qb >= 1) {
      let s = drift + PRO_P.hold * IM.perShare * (my + qb / 2 - oppHold) + (isHome ? PRO_P.focus : 0);
      // 衝刺：這筆買進把股價推高後，持股增值足以讓總資產跨過獲勝門檻 → 優先做
      const lift = (my + qb) * pr * IM.perShare * qb;
      const win = PRO_P.finish && A < MAP.WIN_ASSETS && A + lift >= MAP.WIN_ASSETS;
      if (win) s += 1;
      out.push({ r, side: 1, q: qb, score: s, edge: qb * pr * s, win });
    }
    if (my > 0) {
      const short = p.cash < reserve, qs = short ? Math.min(MAXT, my, Math.max(1, Math.ceil((reserve - p.cash) / pr))) : Math.min(MAXT, my);
      const s = -drift + PRO_P.hold * PRO_P.harm * IM.perShare * (oppHold - (my - qs / 2)) + (short ? 0.05 : 0);
      out.push({ r, side: -1, q: qs, score: s, edge: qs * pr * s });
    }
  }
  return out.filter((x) => x.score >= PRO_P.min).sort((x, y) => y.edge - x.edge);
}
const proPlan = (i) => (proV2(i) ? proPlanV2(i) : proPlanV1(i));
const proEdge = (i) => { const pl = proPlan(i); return pl.some((x) => x.win || x.big) ? 30000 : pl.slice(0, 2).reduce((s, x) => s + x.edge, 0); };
function proTrade() {                     // 一次一筆（和 aiTrade 一樣），回傳 true 表示這次動作了
  const best = proPlan(turn)[0];
  if (!best) return false;
  qty[best.r] = best.q; trade(best.r, best.side);
  traded[best.r] = true;                  // 即使因故沒成交也不再重試，避免卡住
  return true;
}
function proSellPick(i) { return proV2(i) ? proSellPickV2(i) : proSellPickV1(i); }
function proSellPickV1(i) {               // 現金不足被迫賣股：挑賣掉最划算的那一區
  const p = P[i], opp = P.map((_, j) => j).filter((j) => j !== i && P[j].alive);
  let best, bs = -1e9;
  for (const r of RK) {
    if (p.st[r] <= 0) continue;
    const oppHold = opp.reduce((s, j) => s + P[j].st[r], 0) / Math.max(1, opp.length);
    const s = -proDrift(i, r) + 0.5 * IM.perShare * (oppHold - p.st[r]);
    if (s > bs) { bs = s; best = r; }
  }
  return best;
}

// 關鍵土地：買下去能集滿整區（獨佔：股價 +20%、過路費 +20%、四塊地各升一級），或能擋下對手差一塊的獨佔。
// 現金不夠也買，不足的部分由 aiStep 的「現金不足」流程賣股票湊（股票就是備用的現金）。
function proKeyLand(i, t) {
  if (!proNew(i) || !PRO_P.key) return false;
  const p = P[i], same = T.filter((x) => x.type === 'land' && x.region === t.region && x.id !== t.id);
  const mine = same.filter((x) => owner[x.id] === i).length;
  const theirs = {}; same.forEach((x) => { if (owner[x.id] !== undefined && owner[x.id] !== i) theirs[owner[x.id]] = (theirs[owner[x.id]] || 0) + 1; });
  const completes = mine === same.length, denies = Object.values(theirs).some((n) => n === same.length);
  if (!completes && !(denies && PRO_P.key > 1)) return false;
  return stockVal(i) + p.cash - t.price >= PRO_P.keyKeep;     // 買完仍要留一點本錢
}

// ======================= 高階 AI v2：依階段切換的股票策略 =======================
// 仿照真人的打法，分三個階段（階段只升不降）：
//  階段 1 開局：看自己哪個區域的土地「最多」，把現金灌進該區股票（每次股市最多 99 股，多次停留慢慢買到上限）。
//        不愛留現金：買股會把股價推高，之後缺錢時賣的是漲價後的股票（類似當沖）。其餘現金看情況才分給別區。
//  階段 2 中期：以「持有數＋等級」綜合最高的區域為主力，大量投入；其他有地的區域適量存放。
//        若該區有「對手的特別高額過路費土地」就不大買（怕自己拉抬股價讓過路費跟著漲、短期內被走到）；
//        除非自己總資產絕對領先、而且該筆過路費付得起。對手在某區的過路費逼近我總資產一半時，反而賣出該區持股壓價。
//  階段 3 後期：我與對手總資產都到十幾萬，一塊最高額的地就可能讓人破產 → 放棄階段 2 的謹慎，
//        全力灌「我最高額土地」所在區域（不夠錢就賣別區股票籌錢），把那塊地的過路費拉過「一招致死線」；
//        過線後，所有「我有地的區域」全部買股，把所有過路費一起拉高。
let PRO_OLD = [];                       // 測試用：PRO_OLD[座位]=true → 該高階 AI 改用上一版（調參版）股票策略
const proV2 = (i) => proNew(i) && !PRO_OLD[i];
const PH = { midA: 60000, lateA: 100000, kill: 200000, resv: [5000, 6000, 2000], riskFrac: 0.12, dom: 1.3, afford: 0.25, riskMult: 0.1, other: 0.25, otherMax: 40, defFrac: 0.5, liq: 1, def: 1, mainFrac: 1 };
const PRO_STAGE = [];
const oppOf = (i) => P.map((_, j) => j).filter((j) => j !== i && P[j].alive);
const proLiquid = (i) => P[i].cash + 0.9 * stockVal(i);
function proStage(i) {
  const A = assets(i), top = Math.max(0, ...oppOf(i).map(assets)); let s = PRO_STAGE[i] || 1;
  if (s < 3 && A >= PH.lateA && top >= PH.lateA && lands(i).length) s = 3;
  else if (s < 2 && A >= PH.midA) s = 2;
  return (PRO_STAGE[i] = s);
}
const proResv = (i) => PH.resv[proStage(i) - 1];
const regLands = (i, r) => lands(i).filter((t) => t.region === r);
// 區域分數：階段 1 只看土地數；之後看「數量＋等級」，整區獨佔再加成
function regScore(i, r, countOnly) {
  const ls = regLands(i, r); if (!ls.length) return 0;
  let sc = ls.reduce((a, t) => a + 1 + (countOnly ? 0 : 0.5 * (lv[t.id] || 0)), 0);
  if (!countOnly && ls.length === T.filter((t) => t.type === 'land' && t.region === r).length) sc += 3;
  return sc;
}
const regKey = (i, r, c) => regScore(i, r, c) + regLands(i, r).reduce((a, t) => a + tollOf(t), 0) / 1e7;   // 同分用過路費合計決勝負
const homeOf = (i, c) => { let b = null, bk = 0; for (const r of RK) { const k = regKey(i, r, c); if (regScore(i, r, c) > 0 && k > bk) { bk = k; b = r; } } return b; };
const oppToll = (i, r) => Math.max(0, ...T.filter((t) => t.type === 'land' && t.region === r && owner[t.id] !== undefined && owner[t.id] !== i).map(tollOf));
function proRisk(i, r) {                  // 買這區股票的力道倍率：1=正常；有對手的特別高額地就大幅縮小
  const tl = oppToll(i, r); if (!tl) return 1;
  const A = assets(i); if (tl <= PH.riskFrac * A) return 1;
  const best = Math.max(0, ...oppOf(i).map(assets));
  return A >= PH.dom * best && tl <= PH.afford * A ? 1 : PH.riskMult;
}
function proPlanV2(i) {
  const p = P[i], st = proStage(i), A = assets(i), opp = oppOf(i), resv = proResv(i), out = [];
  const add = (r, side, q, prio, sc, ex) => { if (q >= 1) out.push({ r, side, q, prio, score: sc, edge: q * stock[r] * sc, ...ex }); };
  const room = (r) => Math.min(MAXT, MAXH - p.st[r]);
  const mine = RK.filter((r) => regScore(i, r) > 0);
  // 賣掉「我沒有地的區域」的持股：這些股票漲了只是在幫對手墊高過路費
  RK.forEach((r) => { if (!traded[r] && p.st[r] > 0 && !mine.includes(r)) add(r, -1, Math.min(MAXT, p.st[r]), st === 3 ? 2 : 4.5, 0.03); });
  if (!mine.length) return out.sort((x, y) => y.prio - x.prio || y.edge - x.edge);
  if (st < 3) {
    const c1 = st === 1, home = homeOf(i, c1);
    RK.forEach((r) => { if (PH.def && !traded[r] && p.st[r] > 0 && oppToll(i, r) >= PH.defFrac * A) add(r, -1, Math.min(MAXT, p.st[r]), 6, 0.1, { def: true }); });   // 防禦：壓低對手殺傷力
    let b = Math.max(0, p.cash - resv);
    mine.slice().sort((x, y) => regKey(i, y, c1) - regKey(i, x, c1)).forEach((r) => {
      if (traded[r] || out.some((o) => o.r === r)) return;
      const main = r === home, frac = main ? PH.mainFrac : c1 && b < 20000 ? 0 : PH.other;
      let q = Math.floor(Math.min(room(r), Math.floor(b * frac / stock[r])) * proRisk(i, r));
      if (!main) q = Math.min(q, PH.otherMax);
      if (q >= 1) { add(r, 1, q, main ? 4 : 3, main ? 0.08 : 0.04); b -= q * stock[r]; }
    });
  } else {
    const L = lands(i).sort((x, y) => tollOf(y) - tollOf(x)), R = L[0].region;
    const K = Math.max(PH.kill, 1.1 * Math.max(0, ...opp.map(assets))), reached = tollOf(L[0]) >= K, big = { big: true };
    const budget = () => Math.max(0, p.cash - resv);
    if (!traded[R]) {
      const q = room(R), afford = Math.floor(budget() / stock[R]);
      if (afford < q) {                   // 錢不夠灌滿：先賣別區股票籌錢（優先賣「我沒有地」的區域，再賣持股市值最高的）
        const src = RK.filter((r) => r !== R && !traded[r] && p.st[r] > 0)
          .sort((x, y) => (mine.includes(x) - mine.includes(y)) || (p.st[y] * stock[y] - p.st[x] * stock[x]))[0];
        if (src && !out.some((o) => o.r === src)) add(src, -1, Math.min(MAXT, p.st[src]), 7, 0.2, big);
        else if (!out.some((o) => o.side === -1 && o.big)) add(R, 1, Math.min(q, afford), 6, 0.3, big);
      } else add(R, 1, q, 6, 0.3, big);
    }
    if (!out.some((o) => o.big && o.side === -1)) {   // 目標區這次處理完了：多出來的錢往其他有地的區域放
      const need = traded[R] || reached ? 0 : stock[R] * MAXT;   // 沒過線前，要留下次灌目標區的本錢
      const regs = mine.filter((r) => r !== R && !traded[r]).sort((x, y) => oppToll(i, y) - oppToll(i, x));
      let b = Math.max(0, budget() - (out.some((o) => o.side === 1) ? 0 : 0) - need);
      const tgt = out.find((o) => o.r === R && o.side === 1); if (tgt) b = Math.max(0, b - tgt.q * stock[R]);
      regs.forEach((r, k) => { const q = Math.min(room(r), Math.floor(b / (regs.length - k) / stock[r])); if (q >= 1) { add(r, 1, q, 3, 0.1, big); b -= q * stock[r]; } });
    }
  }
  return out.sort((x, y) => y.prio - x.prio || y.edge - x.edge);
}
function proSellPickV2(i) {               // 現金不足被迫賣股：賣掉對我最不重要的那一區（後期絕不動目標區）
  const p = P[i], L = lands(i).sort((x, y) => tollOf(y) - tollOf(x)), tgt = proStage(i) === 3 && L.length ? L[0].region : null, home = homeOf(i, false);
  let best, bs = 1e9;
  for (const r of RK) {
    if (p.st[r] <= 0) continue;
    const sc = 3 * regScore(i, r) + (r === tgt ? 1000 : 0) + (r === home ? 8 : 0) - p.st[r] * 1e-4;
    if (sc < bs) { bs = sc; best = r; }
  }
  return best;
}
function proUpPick(i, ok) {               // 升級順序：後期先升「殺手地」，其餘優先主力區、過路費最高的
  const home = homeOf(i, false), L = lands(i).sort((x, y) => tollOf(y) - tollOf(x));
  return ok.slice().sort((x, y) => (proStage(i) === 3 && L[0] ? (y.id === L[0].id) - (x.id === L[0].id) : 0) || ((y.region === home) - (x.region === home)) || tollOf(y) - tollOf(x))[0].id;
}
