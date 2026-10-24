// 瀏覽器端：畫面沿用 engine.js 的 render()，狀態由伺服器推送，動作送回伺服器執行。
let ws, ROOM = null, SEATS = [], HOST = 0, STARTED = false, DRAW = null;
const token = localStorage.wm_token || (localStorage.wm_token = Math.random().toString(36).slice(2) + Date.now().toString(36));
const tx = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ token, ...o }));
const rpc = (fn, ...args) => tx({ t: 'act', fn, args });
qty = Object.fromEntries(RK.map((r) => [r, 1]));

roll = () => rpc('roll'); pick = (to) => rpc('pick', to); buyLand = () => rpc('buyLand'); buyout = () => rpc('buyout');
upgradeAt = (id) => rpc('upgradeAt', id); endTurn = () => rpc('endTurn'); flipAt = (k) => rpc('flipAt', k);
askPick = (k) => rpc('askPick', k); askSkip = () => rpc('askSkip');
allocOk = () => tx({ t: 'act', fn: 'allocOk', args: [], vals: alloc.vals });
trade = (r, s) => tx({ t: 'act', fn: 'trade', args: [r, s], q: qty[r] });
offerMake = (to, want, give, cash) => rpc('offerMake', to, want, give, cash); offerAccept = () => rpc('offerAccept');
offerDecline = () => rpc('offerDecline'); offerCancel = () => rpc('offerCancel');
sellStock = (r, n) => rpc('sellStock', r, n); sellEnough = (r) => rpc('sellEnough', r); sellLand = (id) => rpc('sellLand', id);
closeExtra = () => rpc('closeExtra');
confirmNeed = () => rpc('confirmNeed'); cancelNeed = () => rpc('cancelNeed');

function applyState(s) {
  ({ P, owner, lv, inv, chg, winner, base, tollMod, landMod, traded, ask, alloc, sf, deck, upUsed, upIds, flipUsed, justBought, lastCard, stock, extraOn, turn, phase, left, dice, rollSeq, first, choices, busy, logs, need, mfx, mfxSeq, offer, offerN, hist } = s);
}
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => tx({ t: 'hello' });
  ws.onclose = () => { const e = $('#st'); if (e) e.textContent = '連線中斷，重新連線中…'; setTimeout(connect, 1500); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'err') return alert(m.msg);
    if (m.t === 'notice') return toast(m.msg);
    if (m.t === 'none') { ROOM = null; STARTED = false; DRAW = null; return view(); }
    DRAW = m.draw || null;
    ROOM = m.code; SEATS = m.seats; HOST = m.host; ME = m.you; STARTED = m.started;
    NAMES = m.seats.map((s) => s.name); AWAY = m.seats.map((s) => !!s.away); PIC = m.seats.map((s) => s.pic);
    C = m.seats.map((s) => MAP.PALETTE[s.color].c);
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
    return `<div class="seat">${s ? `<span class="sw2" style="background:${MAP.PALETTE[s.color].c}"></span><img src="/img/p${s.pic}.png?v=${MAP.PIC_VER}" alt="">` : ''}<span>${i + 1}. ${s ? `${i === HOST ? '👑 ' : ''}<b>${esc(s.name)}</b>${s.ai && !/^AI/.test(s.name) ? '（AI）' : ''}${i === ME ? '（你）' : ''}${s.online ? '' : '（離線）'}` : '<span style="opacity:.5">空位</span>'}</span></div>`;
  }).join('');
  const picker = `<div class="box"><b>選擇你的棋子</b>（不可與其他玩家重複）<div class="pk">${MAP.PIC_NAMES.map((n, k) => {
    const by = SEATS.findIndex((s) => s.pic === k), mine = by === ME, taken = by >= 0 && !mine;
    return `<button class="pkb${mine ? ' sel' : ''}" ${taken ? 'disabled' : ''} title="${n}${taken ? '（' + esc(SEATS[by].name) + ' 使用中）' : ''}" onclick="tx({t:'pic',i:${k}})"><img src="/img/p${k}.png?v=${MAP.PIC_VER}" alt="${n}"></button>`;
  }).join('')}</div></div>`;
  const cpick = `<div class="box"><b>選擇你的代表色</b>（不可與其他玩家重複）<div class="cp">${MAP.PALETTE.map((p, k) => {
    const by = SEATS.findIndex((s) => s.color === k), mine = by === ME, taken = by >= 0 && !mine;
    return `<button class="cb${mine ? ' sel' : ''}" ${taken ? 'disabled' : ''} style="background:${p.c};color:${ink(p.c)}" title="${p.n}${taken ? '（' + esc(SEATS[by].name) + ' 使用中）' : ''}" onclick="tx({t:'color',i:${k}})">${mine ? '✓' : p.n}</button>`;
  }).join('')}</div><div style="font-size:12px;margin-top:4px">進遊戲後行動順序仍是隨機排序，代表色不變。</div></div>`;
  const full = SEATS.length === 4, isHost = ME === HOST;
  const ctl = isHost
    ? `<button onclick="tx({t:'ai'})" ${full ? 'disabled' : ''}>加入 1 個 AI</button><button onclick="tx({t:'aipro'})" ${full ? 'disabled' : ''}>加入高階 AI</button><button onclick="tx({t:'fillai'})" ${full ? 'disabled' : ''}>補滿 AI</button><button onclick="tx({t:'rmai'})">移除 AI</button><br>
       <button class="big" onclick="tx({t:'start'})" ${full ? '' : 'disabled'}>開始遊戲</button>${full ? '' : '<div style="font-size:12px">需滿 4 人才能開始，不足的位置可用 AI 補滿</div>'}`
    : '<div class="hint">等待房主開始遊戲…</div>';
  return `<div class="box">房號<div class="code">${ROOM}</div><div style="font-size:12px">把房號給朋友，他們輸入 ID 與房號即可加入</div></div>${rows}${cpick}${picker}<div class="box">${ctl}</div><button onclick="tx({t:'leave'})">離開房間</button>`;
}
function mk(t) {
  const name = $('#nm').value.trim(); if (!name) return alert('請輸入 ID');
  localStorage.wm_name = name;
  tx({ t, name, code: t === 'join' ? $('#cd').value : undefined });
}
function toast(msg) {
  let e = $('#toast'); if (!e) { e = document.createElement('div'); e.id = 'toast'; document.body.appendChild(e); }
  e.textContent = msg; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => (e.style.display = 'none'), 4500);
}
const doForce = () => confirm('確定要強制關閉遊戲，讓所有人回到組隊房間嗎？') && tx({ t: 'forceclose' });
const doDraw = () => confirm('要發起平局投票嗎？所有真人玩家過半數（含剛好一半）同意即平局，並回到組隊房間。') && tx({ t: 'drawstart' });
const doLeave = () => confirm('要暫時離開嗎？離開期間由 AI 代為操作，你隨時可以回來按「接手操作」繼續玩。') && tx({ t: 'leave' });
const away = () => !!(SEATS[ME] && SEATS[ME].away);
function topButtons() {
  if (away()) return '<button class="big" onclick="tx({t:\'resume\'})">關閉 AI，接手操作</button>' + (ME === HOST ? '<button class="danger" onclick="doForce()">強制關閉</button>' : '');
  return (ME === HOST ? '<button class="danger" onclick="doForce()">強制關閉</button>' : '') +
    (phase !== 'over' ? `<button onclick="doDraw()" ${DRAW ? 'disabled' : ''}>發起平局</button>` : '') +
    '<button onclick="doLeave()">離開</button>';
}
function voteHtml() {
  const d = DRAW; if (!d) return '';
  const head = `<b>${esc(d.by)} 發起了平局投票</b><p>需要 ${d.need} 位真人同意（共 ${d.humans} 位真人）。已同意 ${d.yes.length}、已反對 ${d.no.length}，${d.left} 秒後逾時取消。</p>`;
  const body = d.mine ? `<p class="hint">你已投「${d.mine === 'yes' ? '同意' : '不同意'}」，等待其他玩家…</p>`
    : SEATS[ME] && !SEATS[ME].ai && !SEATS[ME].away ? '<button class="big" onclick="tx({t:\'drawvote\',yes:true})">同意平局</button><button onclick="tx({t:\'drawvote\',yes:false})">不同意</button>' : '';
  return `<div class="md" style="z-index:8"><div class="box">${head}${body}</div></div>`;
}
function view() {
  const inGame = STARTED && typeof P !== 'undefined' && P;
  $('#lobby').style.display = inGame ? 'none' : 'block';
  $('#game').style.display = inGame ? 'block' : 'none';
  if (!inGame) { clearTokens(); $('#vt').innerHTML = ''; $('#lobby').innerHTML = lobbyHtml(); return; }
  $('#tb').innerHTML = topButtons(); $('#vt').innerHTML = voteHtml();
  const mine = turn === ME && !away();
  const inOffer = offer && (ME === offer.to || ME === offer.from) && !away();   // 交易進行中：只有交易雙方能在彈窗上操作
  document.querySelectorAll('.wrap').forEach((e) => e.classList.toggle('wait', offer ? true : !mine));
  document.querySelectorAll('#md').forEach((e) => e.classList.toggle('wait', offer ? !inOffer : !mine));
  $('#st').innerHTML = `房號 ${ROOM}｜你是 <b style="color:${C[ME]}">${pn(ME)}</b>｜` +
    (phase === 'over' ? '遊戲結束 ' + (ME === HOST ? '<button onclick="tx({t:\'rematch\'})">回到大廳再來一局</button>' : '')
      : away() ? '<b class="hint">你已暫時離開，AI 正在代打。準備好了就按右邊的「關閉 AI，接手操作」</b>'
      : mine ? '<b class="hint">輪到你了</b>' : `等待 <b style="color:${C[turn]}">${pnA(turn)}</b> 操作…`);
  render();
}
connect();
