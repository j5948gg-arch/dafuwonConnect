const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const { WebSocketServer } = require('ws');
const rd = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = ['map.js', 'engine.js', 'ai.js'].map(rd);
const PAGES = { '/': ['index.html', 'text/html'], '/map.js': ['map.js', 'text/javascript'], '/engine.js': ['engine.js', 'text/javascript'], '/online.js': ['online.js', 'text/javascript'] };
const SNAP = 'JSON.stringify({P,owner,lv,inv,chg,winner,base,tollMod,landMod,traded,ask,alloc,sf,deck,upUsed,flipUsed,justBought,lastCard,stock,turn,phase,left,dice,first,choices,busy,logs,need})';
const NONE = JSON.stringify({ t: 'none' });
const rooms = {}, byToken = {};
process.on('uncaughtException', (e) => console.error(e));

// 每個房間一個獨立的遊戲引擎（與瀏覽器共用 map.js / engine.js）
function newEngine() {
  const safeTimeout = (f, ms) => setTimeout(() => { try { f(); } catch (e) { console.error(e); } }, ms);
  const ctx = vm.createContext({ setTimeout: safeTimeout, document: { querySelector: () => ({}) } });
  vm.runInContext('var window=this;', ctx);
  SRC.forEach((s) => vm.runInContext(s, ctx));
  vm.runInContext('render=function(){};', ctx);
  return ctx;
}
const ev = (r, code) => vm.runInContext(code, r.ctx);

function send(ws, o) { if (ws && ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
function broadcast(r) {
  const seats = r.seats.map((s) => ({ name: s.name, ai: s.ai, online: s.ai || !!s.ws }));
  r.seats.forEach((s, i) => send(s.ws, { t: 'state', code: r.code, started: r.started, seats, host: r.seats.indexOf(r.host), you: i, s: r.snap }));
}
function sync(r, force) {
  const raw = ev(r, SNAP);
  if (raw === r.raw && !force) return;
  r.raw = raw;
  const s = JSON.parse(raw);
  s.deck = s.deck.map((d) => (d.by < 0 ? { c: -1, by: -1 } : d)); // 未翻開的牌不外洩
  r.snap = s;
  broadcast(r);
}
function addAI(r) {
  let k = 1; while (r.seats.some((s) => s.name === 'AI-' + k)) k++;
  r.seats.push({ name: 'AI-' + k, ai: true, token: null, ws: null, off: 0 });
}
function drop(ws) {
  const r = ws.room, s = ws.me; if (!r) return;
  ws.room = ws.me = null;
  if (!r.started && s !== r.host) { r.seats.splice(r.seats.indexOf(s), 1); delete byToken[s.token]; }
  else { s.ws = null; s.off = Date.now(); }
  broadcast(r);
}
function leave(ws) {
  const r = ws.room, s = ws.me; if (!r) return;
  if (!r.started && s === r.host) {
    for (const x of r.seats) if (x.ws) { x.ws.room = x.ws.me = null; send(x.ws, NONE); }
    r.seats.forEach((x) => delete byToken[x.token]); delete rooms[r.code]; return;
  }
  delete byToken[s.token]; drop(ws); send(ws, NONE);
}

function handle(ws, m) {
  const err = (msg) => send(ws, { t: 'err', msg });
  const tok = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
  if (!tok) return;
  if (m.t === 'hello') {
    const r = rooms[byToken[tok]], s = r && r.seats.find((x) => x.token === tok);
    if (!s) return send(ws, NONE);
    if (s.ws && s.ws !== ws) { s.ws.room = s.ws.me = null; }
    s.ws = ws; s.off = 0; ws.room = r; ws.me = s;
    return r.started ? sync(r, true) : broadcast(r);
  }
  if (m.t === 'create' || m.t === 'join') {
    if (ws.room) return;
    const name = String(m.name || '').trim().slice(0, 10);
    if (!name) return err('請輸入 ID');
    let r;
    if (m.t === 'create') {
      let code; do { code = String(1000 + (Math.random() * 9000 | 0)); } while (rooms[code]);
      r = rooms[code] = { code, seats: [], started: false, lastAI: 0, raw: '', snap: null, ctx: null, empty: 0 };
    } else {
      r = rooms[String(m.code || '').trim()];
      if (!r) return err('找不到房間');
      if (r.started) return err('遊戲已經開始');
      if (r.seats.length >= 4) return err('房間已滿');
      if (r.seats.some((s) => s.name === name)) return err('這個 ID 已有人使用，請換一個');
    }
    const s = { name, ai: false, token: tok, ws, off: 0 };
    if (m.t === 'create') r.host = s;
    r.seats.push(s); byToken[tok] = r.code; ws.room = r; ws.me = s;
    return broadcast(r);
  }
  const r = ws.room, me = ws.me; if (!r) return;
  const host = me === r.host;
  switch (m.t) {
    case 'ai': if (host && !r.started && r.seats.length < 4) addAI(r); break;
    case 'fillai': if (host && !r.started) while (r.seats.length < 4) addAI(r); break;
    case 'rmai': if (host && !r.started) { for (let i = r.seats.length - 1; i >= 0; i--) if (r.seats[i].ai) { r.seats.splice(i, 1); break; } } break;
    case 'start':
      if (!host || r.started) return;
      if (r.seats.length < 4) return err('需要滿 4 人才能開始（可用 AI 補滿）');
      r.seats.sort(() => Math.random() - 0.5); // 隨機決定順序
      r.ctx = newEngine(); ev(r, 'np=4;reset();');
      r.started = true; r.lastAI = Date.now();
      return sync(r, true);
    case 'rematch':
      if (host && r.started && ev(r, 'phase') === 'over') { r.started = false; r.ctx = null; r.snap = null; r.raw = ''; }
      break;
    case 'leave': return leave(ws);
    case 'act':
      if (!r.started || r.seats[+ev(r, 'turn')] !== me || typeof m.fn !== 'string') return;
      r.ctx.__j = JSON.stringify([m.fn, m.args, { vals: m.vals, q: m.q }]);
      try { ev(r, 'safeAct(...JSON.parse(__j))'); } catch (e) { console.error(e); }
      return sync(r);
  }
  broadcast(r);
}

const srv = http.createServer((q, s) => {
  const p = PAGES[q.url.split('?')[0]];
  if (!p) { s.writeHead(404); return s.end('not found'); }
  s.writeHead(200, { 'Content-Type': p[1] + ';charset=utf-8' }); s.end(rd(p[0]));
});
const wss = new WebSocketServer({ server: srv });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } try { handle(ws, m); } catch (e) { console.error(e); } });
  ws.on('close', () => drop(ws));
});
setInterval(() => wss.clients.forEach((c) => c.ping()), 25000);

// 每 150ms：AI 出手、同步狀態、清理空房間
setInterval(() => {
  const now = Date.now();
  for (const r of Object.values(rooms)) {
    const online = r.seats.some((s) => s.ws);
    r.empty = online ? 0 : r.empty || now;
    if (r.empty && now - r.empty > 3600000) { r.seats.forEach((s) => delete byToken[s.token]); delete rooms[r.code]; continue; }
    if (!r.started) continue;
    try {
      if (now - r.lastAI > 800) {
        r.lastAI = now;
        const s = r.seats[+ev(r, 'turn')];
        if (s && (s.ai || (!s.ws && now - s.off > 20000))) ev(r, 'aiStep()'); // 離線超過 20 秒由 AI 代打
      }
      sync(r);
    } catch (e) { console.error(e); }
  }
}, 150);

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log('世界大富翁連線版：http://localhost:' + PORT));
