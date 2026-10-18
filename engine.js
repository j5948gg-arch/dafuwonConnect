let NAMES=[],ME=-1;const LVC=['#8e44ad','#2e86de','#27ae60','#f1c40f','#f08a00','#e0262d']; // E→S：紫、藍、綠、黃、橙、紅
let extraOn=false,pendingTrade=false,resumeMove=false;
const monoOwner=r=>{const ls=T.filter(t=>t.type==='land'&&t.region===r),o=owner[ls[0].id];return o!==undefined&&ls.every(t=>owner[t.id]===o)?o:-1;};
const nameOf=i=>NAMES[i]?'｜'+NAMES[i]:'';

const C=['#e74c3c','#3498db','#2ecc71','#e6a800'];
const SX=108,SY=94,W=100,H=80,PAD=10,VW=PAD*2+W+6*SX,VH=PAD*2+H+6*SY;
const cx=t=>PAD+W/2+(t.x+3)*SX, cy=t=>PAD+H/2+(3-t.y)*SY;
const T=MAP.TILES, RK=Object.keys(MAP.REGIONS), RN=r=>MAP.REGIONS[r].name, IM=MAP.IMPACT, $=s=>document.querySelector(s);
const START_CASH=40000, MAXH=99, money=n=>n.toLocaleString('en-US');
let P,owner,lv,inv,chg,winner,base,tollMod,landMod,traded,ask,alloc,sf,deck,upUsed,flipUsed,justBought,lastCard,stock,turn,phase,left,dice,first,choices,busy,logs,need,qty,np=2,force='0';

function reset(){
  P=Array.from({length:np},()=>({pos:0,prev:null,cash:START_CASH,alive:true,gems:{},level:1,st:Object.fromEntries(RK.map(r=>[r,0]))}));
  owner={};lv={};inv={};winner=-1;chg=Object.fromEntries(RK.map(r=>[r,0]));stock=Object.fromEntries(RK.map(r=>[r,150+(Math.random()*151|0)]));
  qty=Object.fromEntries(RK.map(r=>[r,1]));sf={...stock};base={...stock};tollMod={};landMod={};traded={};ask=null;alloc=null;upUsed=flipUsed=false;justBought=-1;lastCard='';newDeck();
  turn=0;phase='roll';left=0;dice=0;first=true;choices=null;busy=false;need=null;extraOn=false;pendingTrade=false;resumeMove=false;
  logs=['遊戲開始，每人現金 '+money(START_CASH)+'。'];render();
}
const nm=id=>id==null?'—':T[id].name;
const log=s=>{logs.unshift(s);if(logs.length>40)logs.pop();};
const lands=i=>T.filter(t=>owner[t.id]===i);
const stockVal=i=>RK.reduce((s,r)=>s+P[i].st[r]*stock[r],0);
const landVal=t=>t.price+(inv[t.id]||0);
const assets=i=>P[i].cash+stockVal(i)+lands(i).reduce((s,t)=>s+landVal(t),0);
const tollOf=t=>Math.max(10,Math.round(MAP.tollOf(t,lv[t.id]||0,stock[t.region])*(tollMod[t.region]||1)*(landMod[t.id]||1)*(monoOwner(t.region)>=0?2:1)/10)*10);
const upOf=t=>MAP.upCost(t,lv[t.id]||0,stock[t.region]);
const hasStock=i=>RK.some(r=>P[i].st[r]>0);

/* ---------- 移動 ---------- */
function roll(){
  if(phase!=='roll'||busy)return;
  dice=force==='0'?1+(Math.random()*6|0):+force;
  left=dice;phase='move';first=true;
  log(`玩家${turn+1} 擲出 ${dice}`);
  step();
}
function step(){
  const p=P[turn];
  if(left===0)return land();
  const o=MAP.options(p.pos,p.prev,first);
  if(o.length>1){choices=o;render();return;}
  go(o[0]);
}
function go(to){
  const p=P[turn],tt=T[to];
  choices=null;p.prev=p.pos;p.pos=to;left--;first=false;
  if(tt.type==='gem'&&!p.gems[tt.gem]){p.gems[tt.gem]=1;log(`玩家${turn+1} 獲得${MAP.GEMS[tt.gem].name}`);}
  if(tt.type==='start'&&passStart(turn))return;
  if(pendingTrade){pendingTrade=false;extraOn=true;traded={};resumeMove=true;render();return;}
  busy=true;render();
  setTimeout(()=>{busy=false;step();},260);
}
function pick(to){if(choices&&choices.includes(to))go(to);}

/* ---------- 停留效果 ---------- */
function land(){
  const p=P[turn],t=T[p.pos];
  log(`玩家${turn+1} 停在 ${t.name}（來自 ${nm(p.prev)}）`);
  phase='act';
  if(t.type==='land'&&owner[t.id]!==undefined&&owner[t.id]!==turn){
    if(p.shield>0){p.shield--;log('護身符生效，免付過路費');}
    else if(pay(turn,owner[t.id],tollOf(t),'過路費',()=>bump(t.region,IM.toll))===false)return;
  }
  render();
}
function pay(from,to,amt,desc,after){
  const p=P[from],done=()=>{p.cash-=amt;if(to>=0)P[to].cash+=amt;log(`玩家${from+1} ${to>=0?'付給 玩家'+(to+1)+' ':'支付'}${desc} ${money(amt)}`);if(after)after();};
  if(p.cash>=amt){done();return true;}
  if(assets(from)<amt){bankrupt(from,to);return false;}
  need={amount:amt,desc:`支付${desc}`,forced:true,done,who:from};
  return true;
}
function bankrupt(i,to){
  const p=P[i];if(to>=0)P[to].cash+=p.cash;p.cash=0;p.alive=false;
  RK.forEach(r=>p.st[r]=0);lands(i).forEach(t=>{delete owner[t.id];delete lv[t.id];delete inv[t.id];delete landMod[t.id];});p.gems={};
  log(`玩家${i+1} 資產不足，破產出局`);
  if(P.filter(q=>q.alive).length<2){phase='over';winner=P.findIndex(q=>q.alive);log(`玩家${winner+1} 獲勝！`);render();}
  else endTurn();
}
function endTurn(){
  if(phase==='over'||need||ask||alloc||extraOn)return;
  const old=turn;do{turn=(turn+1)%np;}while(!P[turn].alive);
  upUsed=false;flipUsed=false;justBought=-1;traded={};extraOn=false;
  if(deck.every(d=>d.by>=0)){newDeck();log('49 張牌已翻完，重新洗牌');}
  phase='roll';first=true;render();
}

/* ---------- 起點、勝利、股價 ---------- */
function passStart(i){
  const p=P[i];
  if(MAP.GEM_KEYS.every(k=>p.gems[k])){
    const b=MAP.gemBonus(p.level);p.cash+=b;p.level++;p.gems={};pendingTrade=true;
    log(`玩家${i+1} 集滿四顆寶石！獎金 ${money(b)}，升為 Lv.${p.level}，並獲得一次額外股市買賣機會`);
  }
  if(assets(i)>=MAP.WIN_ASSETS){phase='over';winner=i;choices=null;left=0;log(`玩家${i+1} 總資產 ${money(assets(i))}，經過起點，獲得勝利！`);render();return true;}
  return false;
}
function bump(r,pct){
  const o=stock[r];sf[r]=Math.max(50,Math.min(800,sf[r]*(1+pct)));stock[r]=Math.round(sf[r]);
  if(stock[r]!==o)chg[r]=stock[r]-o;
}
function upgradeAt(id){
  const t=T[id],l=lv[id]||0;
  if(phase!=='act'||need||upUsed||owner[id]!==turn||l>=5||justBought===id)return;
  const c=upOf(t);
  spend(c,`升級 ${t.name} 為 ${MAP.LEVELS[l+1]} 級`,()=>{P[turn].cash-=c;inv[id]=(inv[id]||0)+c;lv[id]=l+1;upUsed=true;bump(t.region,IM.upgrade);log(`玩家${turn+1} 升級 ${t.name}：${MAP.LEVELS[l]}→${MAP.LEVELS[l+1]}（${money(c)}）`);});
}
function buyout(){
  const p=P[turn],t=T[p.pos],o=owner[t.id];
  if(phase!=='act'||need||t.type!=='land'||o===undefined||o===turn)return;
  const c=MAP.BUYOUT_MULT*t.price;
  spend(c,`強制併購 ${t.name}`,()=>{p.cash-=c;P[o].cash+=c;owner[t.id]=turn;justBought=t.id;bump(t.region,IM.buyout);log(`玩家${turn+1} 強制併購 ${t.name}，付給玩家${o+1} ${money(c)}`);});
}

/* ---------- 選項視窗 ---------- */
function askBox(title,opts,skip){
  if(!opts.length){log('沒有可選的項目');return;}
  ask={title,opts,skip};render();
}
function askPick(k){const o=ask.opts[k];ask=null;o.fn();render();}
function askSkip(){ask=null;log('放棄使用');render();}
function askModal(){
  return `<div class="md"><div class="box"><b>${ask.title}</b><div style="margin-top:6px">`+
    ask.opts.map((o,k)=>`<button onclick="askPick(${k})">${o.label}</button>`).join('')+(ask.skip?'<button onclick="askSkip()">放棄</button>':'')+`</div></div></div>`;
}
const pickR=(title,cb,rs,skip)=>askBox(title,(rs||RK).map(r=>({label:`${RK.indexOf(r)+1}區 ${RN(r)}（股價 ${stock[r]}）`,fn:()=>cb(r)})),skip);
const pickTile=(title,ts,cb,skip)=>askBox(title,ts.map(t=>({label:t.name+(t.type==='land'?`（${RN(t.region)}）`:''),fn:()=>cb(t.id)})),skip);
const pickP=(title,ids,cb)=>askBox(title,ids.map(j=>({label:`玩家${j+1}（${nm(P[j].pos)}，現金 ${money(P[j].cash)}）`,fn:()=>cb(j)})));
function allocStart(i){
  const total=RK.reduce((s,r)=>s+P[i].st[r],0);
  if(!total){log('沒有股票可分配');return;}
  alloc={i,total,vals:{...P[i].st}};render();
}
const allocSum=()=>RK.reduce((s,r)=>s+alloc.vals[r],0);
const allocTxt=()=>`已分配 ${allocSum()} / ${alloc.total}（${allocSum()===alloc.total?'可確定':'需剛好等於總數'}）`;
function allocModal(){
  return `<div class="md"><div class="box"><b>重新分配股票</b><p>共 ${alloc.total} 張，每區最多 ${MAXH}。</p>`+
    RK.map((r,k)=>`<div>${k+1}區 ${RN(r)} <input type="number" min="0" max="99" value="${alloc.vals[r]}" oninput="allocSet('${r}',this.value)"></div>`).join('')+
    `<p id="al_rem">${allocTxt()}</p><button class="big" id="al_ok" onclick="allocOk()" ${allocSum()===alloc.total?'':'disabled'}>確定</button></div></div>`;
}
function allocSet(r,v){alloc.vals[r]=Math.max(0,Math.min(MAXH,Math.floor(+v||0)));$('#al_rem').innerHTML=allocTxt();$('#al_ok').disabled=allocSum()!==alloc.total;}
function allocOk(){if(allocSum()!==alloc.total)return;RK.forEach(r=>P[alloc.i].st[r]=alloc.vals[r]);log(`玩家${alloc.i+1} 重新分配股票：`+RK.map(r=>RN(r)+alloc.vals[r]).join(' '));alloc=null;render();}

/* ---------- 牌效果用的工具 ---------- */
const gain=(i,n)=>{P[i].cash+=n;};
const alive=()=>P.map((_,j)=>j).filter(j=>P[j].alive);
const others=i=>alive().filter(j=>j!==i);
const rnd=a=>a[Math.random()*a.length|0];
const addSt=(i,r,n)=>{const g=Math.min(n,MAXH-P[i].st[r]);P[i].st[r]+=g;log(`玩家${i+1} 獲得${RN(r)}股票 ${g} 張`);};
const setPrice=(r,v)=>{const o=stock[r];sf[r]=Math.max(50,Math.min(800,v));stock[r]=Math.round(sf[r]);if(stock[r]!==o)chg[r]=stock[r]-o;log(`${RN(r)}股價 ${o}→${stock[r]}`);};
const tm=(r,f)=>{tollMod[r]=Math.max(.25,Math.min(4,(tollMod[r]||1)*f));log(`${RN(r)}過路費倍率 ${tollMod[r].toFixed(2)}`);};
const dropLand=id=>{delete owner[id];delete lv[id];delete inv[id];delete landMod[id];};
const teleportPrev=id=>{const tri=MAP.TRIS.find(g=>g.includes(id));return tri?MAP.ADJ[id].find(n=>!tri.includes(n)):MAP.ADJ[id][0];};
function advance(n){log(`前進 ${n} 格`);phase='move';left=n;first=false;step();}
function arrive(i){
  const p=P[i],tt=T[p.pos];
  if(tt.type==='gem'&&!p.gems[tt.gem]){p.gems[tt.gem]=1;log(`玩家${i+1} 獲得${MAP.GEMS[tt.gem].name}`);}
  if(tt.type==='start'&&passStart(i))return;
  if(pendingTrade){pendingTrade=false;extraOn=true;traded={};resumeMove=true;phase='move';left=0;render();return;}
  land();
}
function teleport(i,id){P[i].pos=id;P[i].prev=teleportPrev(id);log(`玩家${i+1} 傳送到 ${nm(id)}`);arrive(i);}
function randGem(i,missingOnly){
  const ks=MAP.GEM_KEYS.filter(k=>!missingOnly||!P[i].gems[k]);if(!ks.length){log('寶石已集滿');return;}
  const k=rnd(ks);
  if(P[i].gems[k])log(`已持有${MAP.GEMS[k].name}，沒有效果`);else{P[i].gems[k]=1;log(`玩家${i+1} 獲得${MAP.GEMS[k].name}`);}
}

/* ---------- 49 張牌 ---------- */
function buildCards(){
  const c=[],add=(name,fn)=>c.push({name,fn});
  add('前進一格',()=>advance(1));
  add('給所有人300元',i=>{const os=others(i);if(!os.length)return log('沒有其他玩家');pay(i,-1,300*os.length,'分給所有人的現金',()=>os.forEach(o=>{P[o].cash+=300;}));});
  add('從所有人獲得300元',i=>others(i).forEach(o=>{const m=Math.min(300,P[o].cash);P[o].cash-=m;P[i].cash+=m;}));
  add('指定傳送至任一土地格',i=>pickTile('傳送到哪塊土地？',T.filter(t=>t.type==='land'),id=>teleport(i,id)));
  add('返回起點',i=>teleport(i,0));
  RK.forEach((r,k)=>add(`獲得${k+1}區股票10張`,i=>addSt(i,r,10)));
  add('隨機獲得某區股票10張',i=>addSt(i,rnd(RK),10));
  add('隨機獲得某區股票5張',i=>addSt(i,rnd(RK),5));
  add('所有人來到此寶石格',i=>{others(i).forEach(o=>{P[o].pos=P[i].pos;P[o].prev=teleportPrev(P[i].pos);});log('所有人來到此寶石格');});
  add('能以五倍原土地價格販賣任一持有土地',i=>pickTile('以原始地價 5 倍賣出哪塊地？',lands(i),id=>{const v=5*T[id].price;bump(T[id].region,-IM.sellLand);dropLand(id);P[i].cash+=v;log(`玩家${i+1} 以 5 倍價賣出 ${nm(id)}（${money(v)}）`);},true));
  add('指定一區域股票上升10%',()=>pickR('哪一區股價上升 10%？',r=>bump(r,.1)));
  add('指定一區域股票下降10%',()=>pickR('哪一區股價下降 10%？',r=>bump(r,-.1)));
  add('選擇一區域平分總股票數量',i=>pickR('選一區域，所有玩家平分該區股票',r=>{
    const al=alive(),tot=al.reduce((s,j)=>s+P[j].st[r],0),each=Math.floor(tot/al.length),rem=tot-each*al.length;
    al.forEach(j=>{P[j].st[r]=Math.min(MAXH,each);});P[i].st[r]=Math.min(MAXH,each+rem);log(`${RN(r)}股票 ${tot} 張平分，每人 ${each} 張（餘 ${rem} 張給翻牌者）`);}));
  add('所有人回到起點',i=>{others(i).forEach(o=>{P[o].pos=0;P[o].prev=MAP.ADJ[0][0];});log('所有人回到起點');teleport(i,0);});
  add('指定一區域股價與最高區域股價相同',()=>pickR('哪一區股價調成與最高區相同？',r=>setPrice(r,Math.max(...RK.map(x=>stock[x])))));
  add('向一人收取500元',i=>pickP('向哪位玩家收取 500 元？',others(i),j=>{const m=Math.min(500,P[j].cash);P[j].cash-=m;P[i].cash+=m;log(`玩家${i+1} 向玩家${j+1} 收取 ${m}`);}));
  add('指定一區域股價翻倍',()=>pickR('哪一區股價翻倍？',r=>bump(r,1)));
  add('獲得所有區域股票5張',i=>RK.forEach(r=>addSt(i,r,5)));
  add('隨機獲得一顆寶石',i=>randGem(i,false));
  add('某區過路費提升30%',()=>pickR('哪一區過路費提升 30%？',r=>tm(r,1.3)));
  add('某區過路費下降10%',()=>pickR('哪一區過路費下降 10%？',r=>tm(r,.9)));
  add('指定傳送至任一持有土地格',i=>pickTile('傳送到你的哪塊土地？',lands(i),id=>teleport(i,id)));
  add('獲得擲骰點數*1100元',i=>{const d=1+(Math.random()*6|0);gain(i,1100*d);log(`擲出 ${d}，獲得 ${1100*d} 元`);});
  add('隨機一區域股票上升20%',()=>bump(rnd(RK),.2));
  add('隨機一區域股票下降10%',()=>bump(rnd(RK),-.1));
  add('前進六格',()=>advance(6));
  add('隨機一地區土地全部升一級',i=>{
    const rs=[...new Set(lands(i).map(t=>t.region))];if(!rs.length)return log('沒有土地');
    const r=rnd(rs);lands(i).filter(t=>t.region===r&&(lv[t.id]||0)<5).forEach(t=>{lv[t.id]=(lv[t.id]||0)+1;});log(`${RN(r)}的土地全部升一級`);});
  add('傳送至任一寶石格',i=>pickTile('傳送到哪個寶石格？',T.filter(t=>t.type==='gem'),id=>teleport(i,id)));
  add('指定獲得某區股票10張',i=>pickR('獲得哪一區股票 10 張？',r=>addSt(i,r,10)));
  add('指定獲得某區股票20張',i=>pickR('獲得哪一區股票 20 張？',r=>addSt(i,r,20)));
  add('能以兩倍價拋售某一地區持有股票',i=>pickR('以 2 倍價拋售哪一區的股票？',r=>{const n=P[i].st[r],v=2*stock[r]*n;P[i].st[r]=0;P[i].cash+=v;bump(r,-IM.perShare*n);log(`玩家${i+1} 以 2 倍價拋售${RN(r)} ${n} 張（${money(v)}）`);},RK.filter(r=>P[i].st[r]>0),true));
  add('指定一區域過路費減半',()=>pickR('哪一區過路費減半？',r=>tm(r,.5)));
  add('隨機一區域過路費減半',()=>tm(rnd(RK),.5));
  add('指定一區域過路費翻倍',()=>pickR('哪一區過路費翻倍？',r=>tm(r,2)));
  add('隨機一區域過路費翻倍',()=>tm(rnd(RK),2));
  add('指定任一持有土地過路費翻倍',i=>pickTile('哪塊地過路費翻倍？',lands(i),id=>{landMod[id]=Math.min(8,(landMod[id]||1)*2);log(`${nm(id)}過路費倍率 ${landMod[id]}`);}));
  add('股價全數減半',()=>RK.forEach(r=>bump(r,-.5)));
  add('指定一區域股價回歸原始值',()=>pickR('哪一區股價回到原始值？',r=>setPrice(r,base[r])));
  add('獲得一顆未持有的寶石',i=>randGem(i,true));
  add('隨機一區域過路費下降20%',()=>tm(rnd(RK),.8));
  add('所有人現金增加10%',()=>alive().forEach(j=>{P[j].cash+=Math.round(P[j].cash*.1);}));
  add('傳送至任一玩家格',i=>pickP('傳送到哪位玩家的格子？',others(i),j=>teleport(i,P[j].pos)));
  add('計算所持有股票數量後隨意分配',i=>allocStart(i));
  add('與指定玩家交換位置',i=>pickP('與哪位玩家交換位置？',others(i),j=>{
    const a=[P[i].pos,P[i].prev];P[i].pos=P[j].pos;P[i].prev=P[j].prev;P[j].pos=a[0];P[j].prev=a[1];log(`玩家${i+1} 與玩家${j+1} 交換位置`);arrive(i);}));
  add('額外獲得一次股市買賣機會',()=>openTrade());
  return c;
}
function newDeck(){
  const a=[...Array(49).keys()];
  for(let i=48;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}
  deck=a.map(c=>({c,by:-1}));
}
function flipAt(s){
  const p=P[turn];
  if(phase!=='act'||need||ask||alloc||flipUsed||T[p.pos].type!=='gem'||deck[s].by>=0)return;
  const i=turn,cd=CARDS[deck[s].c];
  deck[s].by=i;flipUsed=true;
  lastCard=`#${s+1} 玩家${i+1} 翻到：${cd.name}`;log(lastCard);
  const row=Math.floor(s/7)*7;let a=s,b=s;
  while(a>row&&deck[a-1].by===i)a--;
  while(b<row+6&&deck[b+1].by===i)b++;
  const n=b-a+1;
  if(n>=2){P[i].cash+=100*n;log(`橫向連線 ${n} 張（#${a+1}~#${b+1}），獎金 ${100*n}`);}
  cd.fn(i);
  render();
}
function cardBox(){
  const p=P[turn],can=phase==='act'&&!need&&!ask&&!alloc&&!flipUsed&&T[p.pos].type==='gem';
  return `<div class="box" style="margin-top:8px"><b>翻牌區</b>（${can?'<span class="hint">請點選一個數字翻牌</span>':'停在寶石格可自選一張牌翻開；橫向連線每張 +100'}）<div class="cg">`+
    deck.map((d,k)=>d.by<0?`<div class="cd${can?' can':''}" ${can?`onclick="flipAt(${k})"`:''}>${k+1}</div>`:`<div class="cd on" style="background:${C[d.by]}" title="${CARDS[d.c].name}">${k+1}<small>P${d.by+1}</small></div>`).join('')+
    `</div>${lastCard?`<div style="margin-top:4px">${lastCard}</div>`:''}</div>`;
}

const chgTxt=r=>chg[r]?` <small style="color:${chg[r]>0?'#e04b4b':'#2aa86a'}">${chg[r]>0?'▲':'▼'}${Math.abs(chg[r])}</small>`:'';
function costTxt(r){
  const p=P[turn],q=Math.max(1,Math.min(MAXH,qty[r]|0)),c=q*stock[r];
  return `預購 ${q} 股：<b>${money(c)}</b>`+(p.cash>=c?`（買後餘 ${money(p.cash-c)}）`:`<span style="color:#e04b4b">（現金差 ${money(c-p.cash)}）</span>`)+`｜賣出可得 ${money(Math.min(q,p.st[r])*stock[r])}`;
}
function setQty(r,v){qty[r]=Math.max(1,Math.min(MAXH,+v||1));$('#c_'+r).innerHTML=costTxt(r);}

/* ---------- 買賣 ---------- */
function spend(amount,desc,done){
  if(P[turn].cash>=amount){done();render();return;}
  if(assets(turn)<amount){log(`資產不足，無法${desc}`);render();return;}
  need={amount,desc,done,forced:false,who:turn};render();
}
function buyLand(){
  const t=T[P[turn].pos];
  if(phase!=='act'||need||t.type!=='land'||owner[t.id]!==undefined)return;
  spend(t.price,`買下 ${t.name}`,()=>{P[turn].cash-=t.price;owner[t.id]=turn;justBought=t.id;bump(t.region,IM.buyLand);log(`玩家${turn+1} 買下 ${t.name}（${money(t.price)}）`);});
}
function openTrade(){extraOn=true;traded={};resumeMove=false;log(`玩家${turn+1} 獲得一次股市買賣機會`);}
function closeExtra(){if(!extraOn)return;extraOn=false;if(resumeMove){resumeMove=false;step();return;}render();}
function trade(r,sign){
  const p=P[turn];
  if(!(phase==='act'||(phase==='move'&&extraOn))||need||!(T[p.pos].type==='stock'||extraOn))return;
  if(traded[r]){log(`${RN(r)} 本次已交易，暫時關閉`);return render();}
  let q=Math.max(1,Math.min(MAXH,qty[r]|0));
  if(sign>0){
    q=Math.min(q,MAXH-p.st[r]);
    if(q<1){log(`${RN(r)} 持股已達上限 ${MAXH}`);return render();}
    const cost=q*stock[r];
    spend(cost,`買入${RN(r)} ${q} 股`,()=>{traded[r]=true;p.cash-=cost;p.st[r]+=q;bump(r,IM.perShare*q);log(`玩家${turn+1} 買入${RN(r)} ${q} 股（${money(cost)}）`);});
  }else{
    q=Math.min(q,p.st[r]);if(q<1)return;
    traded[r]=true;p.st[r]-=q;p.cash+=q*stock[r];log(`玩家${turn+1} 賣出${RN(r)} ${q} 股（${money(q*stock[r])}）`);bump(r,-IM.perShare*q);render();
  }
}
function chk(){
  if(need&&need.forced&&P[need.who].cash>=need.amount){const d=need.done;need=null;d();}
  render();
}
function sellStock(r,n){
  const p=P[turn];n=Math.min(n,p.st[r]);if(n<1)return;
  p.st[r]-=n;p.cash+=n*stock[r];log(`玩家${turn+1} 賣出${RN(r)} ${n} 股（${money(n*stock[r])}）`);bump(r,-IM.perShare*n);chk();
}
function sellEnough(r){sellStock(r,Math.ceil((need.amount-P[turn].cash)/stock[r]));}
function sellLand(id){
  if(hasStock(turn)||owner[id]!==turn)return;
  const v=landVal(T[id]);bump(T[id].region,-IM.sellLand);delete owner[id];delete lv[id];delete inv[id];delete landMod[id];P[turn].cash+=v;log(`玩家${turn+1} 賣掉 ${nm(id)}（${money(v)}）`);chk();
}
function confirmNeed(){const d=need.done;need=null;d();render();}
function cancelNeed(){need=null;render();}

/* ---------- 繪圖 ---------- */
function arrow(from,to,active){
  const a=T[from],b=T[to],x1=cx(a),y1=cy(a),x2=cx(b),y2=cy(b);
  const mx=(x1+x2)/2,my=(y1+y2)/2,ang=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
  return `<g transform="translate(${mx},${my})" ${active?`class="pulse" style="cursor:pointer" onclick="pick(${to})"`:'opacity=".5"'}>
    <circle r="17" fill="var(--accent)" stroke="#222" stroke-width="1.5"/>
    <polygon points="-8,-9 10,0 -8,9" fill="#222" transform="rotate(${ang})"/></g>`;
}
function tileSvg(t){
  const x=cx(t)-W/2,y=cy(t)-H/2;
  let fill='#e6e6e6',sub='',sub2='',icon='',badge='';
  if(t.type==='land'){fill=MAP.REGIONS[t.region].color;const ow=owner[t.id]!==undefined;sub=ow?RN(t.region):`${RN(t.region)}｜地價 ${money(t.price)}`;sub2=ow?money(tollOf(t)):'';
    badge=(l=>`<rect x="${x+4}" y="${y+4}" width="22" height="19" rx="5" fill="${LVC[l]}" stroke="#fff" stroke-width="1.5"/><text x="${x+15}" y="${y+18}" font-size="14" font-weight="800" fill="${l===3?'#222':'#fff'}" text-anchor="middle">${MAP.LEVELS[l]}</text>`)(lv[t.id]||0);}
  if(t.type==='gem'){fill=MAP.GEMS[t.gem].color;sub=t.region?RN(t.region):'特殊';icon='💎';}
  if(t.type==='stock'){fill='#d4dae2';icon='📈';sub='可交易股票';}
  if(t.type==='start'){fill='#fff';icon='🏁';}
  const tc=(t.type==='gem'&&t.gem!=='topaz')?'#fff':'#222';
  const here=P.map((p,i)=>p.alive&&p.pos===t.id?i:-1).filter(i=>i>=0);
  const tok=here.map((i,k)=>{const X=cx(t)+(k-(here.length-1)/2)*24;return `<circle cx="${X}" cy="${y+H-11}" r="9" fill="${C[i]}" stroke="#fff" stroke-width="2"/>
    <text x="${X}" y="${y+H-7}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${i+1}</text>`}).join('');
  const o=owner[t.id],flag=o===undefined?'':`<circle cx="${x+W-11}" cy="${y+11}" r="8" fill="${C[o]}" stroke="#fff" stroke-width="1.5"/><text x="${x+W-11}" y="${y+15}" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${o+1}</text>`;
  const cur=here.includes(turn);
  return `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="9" fill="${fill}" stroke="${cur?C[turn]:'#8a8a82'}" stroke-width="${cur?4:1.5}"/>
   <text x="${cx(t)}" y="${y+31}" font-size="${t.name.length>4?12:15}" font-weight="700" fill="${tc}" text-anchor="middle">${icon} ${t.name}</text>
   <text x="${cx(t)}" y="${y+43}" font-size="11" fill="${tc}" text-anchor="middle" opacity=".85">${sub}</text>
   <text x="${cx(t)}" y="${y+60}" font-size="17" font-weight="800" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${sub2}</text>${badge}${flag}${tok}`;
}
function modal(){
  if(!need)return '';
  const p=P[need.who],short=need.amount-p.cash;
  let body='';
  if(p.cash>=need.amount)body=`<p>現金已足夠。</p><button class="big" onclick="confirmNeed()">確認${need.desc}</button>`;
  else if(hasStock(need.who))body=`<p>是否賣出股票？（尚有股票時不能賣地）</p><table>`+RK.filter(r=>p.st[r]>0).map(r=>
    `<tr><td>${RN(r)}</td><td>${p.st[r]} 股 × ${stock[r]}</td><td><button onclick="sellStock('${r}',1)">賣1</button><button onclick="sellEnough('${r}')">賣到夠</button><button onclick="sellStock('${r}',99)">全賣</button></td></tr>`).join('')+`</table>`;
  else body=`<p>已無股票可賣，可賣出土地（地價＋升級投入）：</p>`+lands(need.who).map(t=>`<button onclick="sellLand(${t.id})">賣 ${t.name} +${money(landVal(t))}</button>`).join('');
  const cancel=need.forced?'':`<button onclick="cancelNeed()">取消</button>`;
  return `<div class="md"><div class="box"><b>現金不足</b><p>${need.desc}需要 ${money(need.amount)}，現金 ${money(p.cash)}，還差 <b>${money(Math.max(0,short))}</b>。</p>${body}<div>${cancel}</div></div></div>`;
}
function render(){
  const p=P[turn],t=T[p.pos];
  let lines='';
  MAP.ADJ.forEach((ns,a)=>ns.forEach(b=>{if(a<b)lines+=`<line x1="${cx(T[a])}" y1="${cy(T[a])}" x2="${cx(T[b])}" y2="${cy(T[b])}" stroke="var(--line)" stroke-width="5" stroke-linecap="round"/>`;}));
  let arrows='';
  if(choices)arrows=choices.map(to=>arrow(p.pos,to,true)).join('');
  else if(phase==='roll'){const o=MAP.options(p.pos,p.prev,true);if(o.length>1)arrows=o.map(to=>arrow(p.pos,to,false)).join('');}
  $('#bd').innerHTML=`<svg viewBox="0 0 ${VW} ${VH}">${lines}${T.map(tileSvg).join('')}${arrows}</svg>${cardBox()}`;

  const trading=(phase==='act'||(phase==='move'&&extraOn))&&!need&&(t.type==='stock'||extraOn);
  let act='';
  if(phase==='over'){
    const ord=[winner,...P.map((_,i)=>i).filter(i=>i!==winner).sort((a,b)=>assets(b)-assets(a))];
    act='<b>遊戲結束</b><br>'+ord.map((i,k)=>`${k+1}. <b style="color:${C[i]}">玩家${i+1}</b> ${money(assets(i))}${k===0?' 🏆':''}`).join('<br>');
  }
  else if(choices)act=`<div class="hint">請點選箭頭決定方向（剩 ${left} 步）</div>`;
  else if(phase==='move')act=extraOn?`<div class="hint">先進行股票交易（還剩 ${left} 步）</div><button class="big" onclick="closeExtra()">結束股市交易，繼續前進</button>`:`<div>移動中…剩 ${left} 步</div>`;
  else if(phase==='roll')act=`<button class="big" onclick="roll()" ${busy?'disabled':''}>擲骰</button>`;
  else{
    const own=t.type==='land'?owner[t.id]:undefined,LV=MAP.LEVELS;
    if(t.type==='land'&&own===undefined)act+=`<button class="big" onclick="buyLand()">買地 ${money(t.price)}</button>`;
    else if(t.type==='land'&&own===turn){
      const l=lv[t.id]||0;
      act+=l>=5?'<div>已是最高級 S（商業區）</div>':justBought===t.id?'<div>剛買下，下次再踩到才能升級</div>':upUsed?'<div>本回合已升級過</div>':`<button class="big" onclick="upgradeAt(${t.id})">升級 ${LV[l]}→${LV[l+1]}（${MAP.LEVEL_NAMES[l+1]}）${money(upOf(t))}</button>`;
    }else if(t.type==='land')act+=`<button class="big" onclick="buyout()">強制併購 ${money(MAP.BUYOUT_MULT*t.price)}</button><div style="font-size:12px">原價×${MAP.BUYOUT_MULT}，付給玩家${own+1}</div>`;
    if(t.type==='gem')act+=flipUsed?'<div>本回合已翻牌</div>':'<div class="hint">請在地圖下方的翻牌區點選一個數字</div>';
    if(t.type==='start'){
      const ls=lands(turn).filter(x=>(lv[x.id]||0)<5);
      act+=upUsed?'<div>本回合已升級過</div>':ls.length?'<div>起點：可升級一塊地</div>'+ls.map(x=>`<button onclick="upgradeAt(${x.id})">${x.name} ${LV[lv[x.id]||0]}→${LV[(lv[x.id]||0)+1]} ${money(upOf(x))}</button>`).join(''):'<div>沒有可升級的土地</div>';
    }
    if(trading)act+='<div class="hint">可於下方交易股票</div>';
    if(extraOn)act+='<button onclick="closeExtra()">結束股市交易</button>';
    act+=`<button onclick="endTurn()">結束回合</button>`;
  }
  const head=`<div class="box">輪到：<b style="color:${C[turn]}">玩家${turn+1}</b>${nameOf(turn)}　<span class="dice">🎲 ${dice||'-'}</span><br>${act}</div>`;
  const gemTxt=q=>MAP.GEM_KEYS.map(k=>`<span style="color:${q.gems[k]?MAP.GEMS[k].color:'#999'};font-weight:${q.gems[k]?700:400}">◆${MAP.GEMS[k].name}</span>`).join(' ')+(q.shield?` 🛡×${q.shield}`:'');
  const pls=P.map((q,i)=>{const A=assets(i),hi=A>=MAP.WIN_ASSETS;return `<div class="box pl${i===turn?' on':''}" style="border-left-color:${C[i]};${q.alive?'':'opacity:.45'}"><b>玩家${i+1}</b>${nameOf(i)}${i===ME?'（你）':''}${q.alive?'':'（出局）'}　Lv.${q.level}｜${nm(q.pos)}｜來向：${nm(q.prev)}<br>現金 ${money(q.cash)}｜總資產 ${hi?`<span style="background:#333;color:#ffd21f;font-weight:700;padding:0 5px;border-radius:4px">${money(A)}</span>`:money(A)}<br>${gemTxt(q)}<br>地：${lands(i).map(x=>x.name+'(<b style="color:'+LVC[lv[x.id]||0]+'">'+MAP.LEVELS[lv[x.id]||0]+'</b>)').join('、')||'無'}${hi&&phase!=='over'&&i===turn?'<br><b style="color:#d9a900">已達 100000，經過或停留起點即獲勝</b>':''}</div>`}).join('');
  const stk=`<div class="box"><b>股市</b>（每區每人上限 ${MAXH} 股；股價隨買賣、升級、過路費波動）<table><tr><th>區域</th><th>股價</th><th>費×</th>${P.map((_,i)=>`<th style="color:${C[i]}">P${i+1}</th>`).join('')}</tr>`+
    RK.map(r=>`<tr><td><span class="sw" style="background:${MAP.REGIONS[r].color};border:1px solid #888"></span>${RK.indexOf(r)+1}區 ${RN(r)}</td><td><b>${stock[r]}</b>${chgTxt(r)}</td><td>${(tollMod[r]||1).toFixed(2)}</td>${P.map(q=>`<td>${q.st[r]}</td>`).join('')}</tr>`).join('')+`</table>`+
    (trading?'<hr>'+RK.map(r=>traded[r]?`<div>${RN(r)} 🔒 本次已交易，暫時關閉</div>`:`<div>${RN(r)} <input type="number" min="1" max="99" value="${qty[r]}" oninput="setQty('${r}',this.value)">
      <button onclick="trade('${r}',1)">買</button><button onclick="trade('${r}',-1)">賣</button><button onclick="qty['${r}']=99;render()">99</button><div style="font-size:12px" id="c_${r}">${costTxt(r)}</div></div>`).join('')+'<div style="font-size:12px">每區每次停留只能交易一次（買或賣擇一）</div>':'')+`</div>`;
  const ctl=`<div class="box">玩家數 <select onchange="np=+this.value;reset()">${[1,2,3,4].map(n=>`<option ${n===np?'selected':''}>${n}</option>`).join('')}</select>
    指定點數（測試） <select onchange="force=this.value">${['0','1','2','3','4','5','6'].map(v=>`<option value="${v}" ${v===force?'selected':''}>${v==='0'?'隨機':v}</option>`).join('')}</select>
    <button onclick="reset()">重來</button></div>`;
  $('#sd').innerHTML=head+pls+stk+`<div class="box" id="log">${logs.join('<br>')}</div>`;
  $('#md').innerHTML=alloc?allocModal():ask?askModal():modal();
}
const CARDS=buildCards();
