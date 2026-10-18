// 瀏覽器端：畫面沿用 engine.js 的 render()，狀態由伺服器推送，動作送回伺服器執行。
let ws, ROOM = null, SEATS = [], HOST = 0, STARTED = false;
const token = localStorage.wm_token || (localStorage.wm_token = Math.random().toString(36).slice(2) + Date.now().toString(36));
const tx = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ token, ...o }));
const rpc = (fn, ...args) => tx({ t: 'act', fn, args });
qty = Object.fromEntries(RK.map((r) => [r, 1]));

roll = () => rpc('roll'); pick = (to) => rpc('pick', to); buyLand = () => rpc('buyLand'); buyout = () => rpc('buyout');
upgradeAt = (id) => rpc('upgradeAt', id); endTurn = () => rpc('endTurn'); flipAt = (k) => rpc('flipAt', k);
askPick = (k) => rpc('askPick', k); askSkip = () => rpc('askSkip');
allocOk = () => tx({ t: 'act', fn: 'allocOk', args: [], vals: alloc.vals });
trade = (r, s) => tx({ t: 'act', fn: 'trade', args: [r, s], q: qty[r] });
sellStock = (r, n) => rpc('sellStock', r, n); sellEnough = (r) => rpc('sellEnough', r); sellLand = (id) => rpc('sellLand', id);
useExtra = () => rpc('useExtra'); closeExtra = () => rpc('closeExtra');
confirmNeed = () => rpc('confirmNeed'); cancelNeed = () => rpc('cancelNeed');

function applyState(s) {
  ({ P, owner, lv, inv, chg, winner, base, tollMod, landMod, traded, ask, alloc, sf, deck, upUsed, flipUsed, justBought, lastCard, stock, extraOn, turn, phase, left, dice, first, choices, busy, logs, need } = s);
}
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => tx({ t: 'hello' });
  ws.onclose = () => { const e = $('#st'); if (e) e.textContent = '連線中斷，重新連線中…'; setTimeout(connect, 1500); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'err') return alert(m.msg);
    if (m.t === 'none') { ROOM = null; STARTED = false; return view(); }
    ROOM = m.code; SEATS = m.seats; HOST = m.host; ME = m.you; STARTED = m.started;
    NAMES = m.seats.map((s) => s.name);
    if (m.s) applyState(m.s);
    view();
  };
}
function lobbyHtml() {
  if (!ROOM) {
    return `<div class="box"><b>輸入你的 ID</b><br><input type="text" id="nm" maxlength="10" placeholder="ID（最多 10 字）" value="${localStorage.wm_name || ''}">
      <div style="margin-top:8px"><button class="big" onclick="mk('create')">開房間</button></div>
      <hr><input type="text" id="cd" maxlength="4" size="6" placeholder="房號"> <button onclick="mk('join')">加入房間</button></div>`;
  }
  const rows = [0, 1, 2, 3].map((i) => {
    const s = SEATS[i];
    return `<div class="seat">${i + 1}. ${s ? `${i === HOST ? '👑 ' : ''}<b>${s.name}</b>${s.ai ? '（AI）' : ''}${i === ME ? '（你）' : ''}${s.online ? '' : '（離線）'}` : '<span style="opacity:.5">空位</span>'}</div>`;
  }).join('');
  const full = SEATS.length === 4, isHost = ME === HOST;
  const ctl = isHost
    ? `<button onclick="tx({t:'ai'})" ${full ? 'disabled' : ''}>加入 1 個 AI</button><button onclick="tx({t:'fillai'})" ${full ? 'disabled' : ''}>補滿 AI</button><button onclick="tx({t:'rmai'})">移除 AI</button><br>
       <button class="big" onclick="tx({t:'start'})" ${full ? '' : 'disabled'}>開始遊戲</button>${full ? '' : '<div style="font-size:12px">需滿 4 人才能開始，不足的位置可用 AI 補滿</div>'}`
    : '<div class="hint">等待房主開始遊戲…</div>';
  return `<div class="box">房號<div class="code">${ROOM}</div><div style="font-size:12px">把房號給朋友，他們輸入 ID 與房號即可加入</div></div>${rows}<div class="box">${ctl}</div><button onclick="tx({t:'leave'})">離開房間</button>`;
}
function mk(t) {
  const name = $('#nm').value.trim(); if (!name) return alert('請輸入 ID');
  localStorage.wm_name = name;
  tx({ t, name, code: t === 'join' ? $('#cd').value : undefined });
}
function view() {
  const inGame = STARTED && typeof P !== 'undefined' && P;
  $('#lobby').style.display = inGame ? 'none' : 'block';
  $('#game').style.display = inGame ? 'block' : 'none';
  if (!inGame) { $('#lobby').innerHTML = lobbyHtml(); return; }
  const mine = turn === ME;
  document.querySelectorAll('.wrap,#md').forEach((e) => e.classList.toggle('wait', !mine));
  $('#st').innerHTML = `房號 ${ROOM}｜你是 <b style="color:${C[ME]}">玩家${ME + 1}</b>｜` +
    (phase === 'over' ? '遊戲結束 ' + (ME === HOST ? '<button onclick="tx({t:\'rematch\'})">回到大廳再來一局</button>' : '') + '<button onclick="tx({t:\'leave\'})">離開</button>'
      : mine ? '<b class="hint">輪到你了</b>' : `等待 玩家${turn + 1}${nameOf(turn)} 操作…`);
  render();
}
connect();
