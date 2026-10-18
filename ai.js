// 伺服器專用，不會傳給瀏覽器。與 engine.js 在同一個環境內執行。
const MODAL_FN = { ask: ['askPick', 'askSkip'], alloc: ['allocOk'], need: ['sellStock', 'sellEnough', 'sellLand', 'confirmNeed', 'cancelNeed'] };
const ALL_MODAL_FN = [].concat(...Object.values(MODAL_FN));

// 玩家送來的動作先在這裡驗證，再呼叫引擎函式
function safeAct(fn, a, ex) {
  if (phase === 'over' || !Array.isArray(a)) return;
  const int = (v) => Number.isInteger(v), reg = (r) => RK.includes(r);
  const m = ask ? 'ask' : alloc ? 'alloc' : need ? 'need' : '';
  if (m ? !MODAL_FN[m].includes(fn) : ALL_MODAL_FN.includes(fn)) return;
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
      qty[a[0]] = Math.max(1, Math.min(MAXH, Math.floor(+(ex && ex.q) || 1)));
      return trade(a[0], a[1]);
    case 'sellStock': return reg(a[0]) && int(a[1]) && a[1] > 0 && sellStock(a[0], a[1]);
    case 'sellEnough': return reg(a[0]) && sellEnough(a[0]);
    case 'sellLand': return int(a[0]) && sellLand(a[0]);
    case 'confirmNeed': return P[need.who].cash >= need.amount && confirmNeed();
    case 'useExtra': return useExtra();
    case 'closeExtra': return closeExtra();
    case 'cancelNeed': return !need.forced && cancelNeed();
  }
}

// AI（也用來代打離線太久的玩家）：每次呼叫只做一個動作
function aiStep() {
  if (phase === 'over' || busy) return;
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
  if (phase === 'roll') return roll();
  if (choices) return pick(pick1(choices));
  if (phase !== 'act') return;
  const c = p.cash, own = t.type === 'land' ? owner[t.id] : undefined;
  if (t.type === 'land' && own === undefined && c >= t.price + 3000) return buyLand();
  if (t.type === 'land' && own !== undefined && own !== i && c >= MAP.BUYOUT_MULT * t.price + 15000) return buyout();
  if (!upUsed) {
    const pool = t.type === 'start' ? lands(i) : t.type === 'land' && own === i && justBought !== t.id ? [t] : [];
    const ok = pool.filter((x) => (lv[x.id] || 0) < 5 && c >= upOf(x) + 5000);
    if (ok.length) return upgradeAt(pick1(ok).id);
  }
  if (t.type === 'gem' && !flipUsed) {
    const free = deck.map((d, k) => (d.by < 0 ? k : -1)).filter((k) => k >= 0);
    if (free.length) return flipAt(pick1(free));
  }
  if (t.type === 'stock' || extraOn) {
    for (const r of RK) {
      if (traded[r]) continue;
      const q = Math.min(MAXH - p.st[r], Math.floor((c - 8000) * 0.3 / stock[r]));
      if (q >= 1) { qty[r] = q; return trade(r, 1); }
      traded[r] = true;
    }
    if (extraOn) return closeExtra();
  }
  if (p.extra > 0 && !extraOn && c >= 10000) return useExtra();
  return endTurn();
}
