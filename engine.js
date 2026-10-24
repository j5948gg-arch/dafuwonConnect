let NAMES=[],PIC=[],ME=-1;
const picUrl=i=>`/img/p${PIC[i]!==undefined?PIC[i]:i}.png?v=${MAP.PIC_VER}`;const LVC=['#8e44ad','#2e86de','#27ae60','#f1c40f','#f08a00','#e0262d']; // E→S：紫、藍、綠、黃、橙、紅
let extraOn=false,pendingTrade=false,resumeMove=false;
let mfx=[],mfxSeq=0,MFX_SEEN=null; // 玩家間金錢異動（動畫用）：{id,i,a}
let mono={},monoLvDone={};   // 各區目前的獨佔者、是否已發過升級獎勵
let offer=null,offerN=0,tradeUI=null,hist=[];   // 玩家間交易、每回合總資產紀錄
const histNow=()=>P.map((_,i)=>assets(i));
const mfxAdd=(i,a)=>{if(!a)return;mfx.push({id:++mfxSeq,i,a});if(mfx.length>8)mfx.shift();};
const monoOwner=r=>{const ls=T.filter(t=>t.type==='land'&&t.region===r),o=owner[ls[0].id];return o!==undefined&&ls.every(t=>owner[t.id]===o)?o:-1;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let AWAY=[];
const pn=i=>NAMES[i]?esc(NAMES[i]):'玩家'+(i+1);          // 玩家 ID（沒有 ID 時退回編號）
const pnA=i=>pn(i)+(AWAY[i]?'（AI代打）':'');

let C=MAP.PALETTE.map(p=>p.c);   // 各玩家代表色（連線時由房間內的選色覆蓋）
const ink=()=>'#fff'; // 代表色色塊上的文字一律白色
const SX=108,SY=94,W=100,H=80,PAD=10,VW=PAD*2+W+6*SX,VH=PAD*2+H+6*SY;
const cx=t=>PAD+W/2+(t.x+3)*SX, cy=t=>PAD+H/2+(3-t.y)*SY;
const T=MAP.TILES, RK=Object.keys(MAP.REGIONS), RN=r=>MAP.REGIONS[r].name, IM=MAP.IMPACT, $=s=>document.querySelector(s);
const START_CASH=40000, MAXH=999, MAXT=99, money=n=>n.toLocaleString('en-US');
let P,owner,lv,inv,chg,winner,base,tollMod,landMod,traded,ask,alloc,sf,deck,upUsed,upIds,flipUsed,justBought,lastCard,stock,turn,phase,left,dice,rollSeq=0,first,choices,busy,logs,need,qty,np=2,force='0';

function reset(){
  P=Array.from({length:np},()=>({pos:0,prev:null,cash:START_CASH,alive:true,gems:{},level:1,st:Object.fromEntries(RK.map(r=>[r,0]))}));
  owner={};lv={};inv={};mono={};monoLvDone={};winner=-1;chg=Object.fromEntries(RK.map(r=>[r,0]));stock=Object.fromEntries(RK.map(r=>[r,150+(Math.random()*151|0)]));
  qty=Object.fromEntries(RK.map(r=>[r,1]));sf={...stock};base={...stock};tollMod={};landMod={};traded={};ask=null;alloc=null;upUsed=0;upIds=[];flipUsed=false;justBought=-1;lastCard='';newDeck();
  turn=0;phase='roll';left=0;dice=0;rollSeq=0;first=true;choices=null;busy=false;need=null;extraOn=false;pendingTrade=false;resumeMove=false;mfx=[];mfxSeq=0;
  logs=['遊戲開始，每人現金 '+money(START_CASH)+'。'];hist=[histNow()];offer=null;offerN=0;tradeUI=null;render();
}
const nm=id=>id==null?'—':T[id].name;
const log=s=>{logs.unshift(s);if(logs.length>40)logs.pop();};
const lands=i=>T.filter(t=>owner[t.id]===i);
const stockVal=i=>RK.reduce((s,r)=>s+P[i].st[r]*stock[r],0);
const landVal=t=>t.price+(inv[t.id]||0);
const assets=i=>P[i].cash+stockVal(i)+lands(i).reduce((s,t)=>s+landVal(t),0);
const tollOf=t=>Math.max(10,Math.round(MAP.tollOf(t,lv[t.id]||0,stock[t.region])*(tollMod[t.region]||1)*(landMod[t.id]||1)*(monoOwner(t.region)>=0?1.2:1)/10)*10);
const upOf=t=>MAP.upCost(t,lv[t.id]||0,stock[t.region]);
const hasStock=i=>RK.some(r=>P[i].st[r]>0);

/* ---------- 移動 ---------- */
function roll(){
  if(phase!=='roll'||busy)return;
  dice=force==='0'?((typeof diceHook==='function'&&diceHook())||1+(Math.random()*6|0)):+force;
  left=dice;phase='move';first=true;rollSeq++;
  log(`${pn(turn)} 擲出 ${dice}`);
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
  if(tt.type==='gem'&&!p.gems[tt.gem]){p.gems[tt.gem]=1;log(`${pn(turn)} 獲得${MAP.GEMS[tt.gem].name}`);}
  if(tt.type==='start'&&passStart(turn))return;
  if(pendingTrade){pendingTrade=false;extraOn=true;traded={};resumeMove=true;render();return;}
  busy=true;render();
  setTimeout(()=>{busy=false;step();},260);
}
function pick(to){if(choices&&choices.includes(to))go(to);}

/* ---------- 停留效果 ---------- */
function land(){
  const p=P[turn],t=T[p.pos];
  log(`${pn(turn)} 停在 ${t.name}（來自 ${nm(p.prev)}）`);
  phase='act';
  if(t.type==='land'&&owner[t.id]!==undefined&&owner[t.id]!==turn){
    if(p.shield>0){p.shield--;log('護身符生效，免付過路費');}
    else if(pay(turn,owner[t.id],tollOf(t),'過路費',()=>bump(t.region,IM.toll))===false)return;
  }
  render();
}
function pay(from,to,amt,desc,after){
  const p=P[from],done=()=>{p.cash-=amt;if(to>=0){P[to].cash+=amt;mfxAdd(from,-amt);mfxAdd(to,amt);}log(`${pn(from)} ${to>=0?'付給 '+pn(to)+' ':'支付'}${desc} ${money(amt)}`);if(after)after();};
  if(p.cash>=amt){done();return true;}
  if(assets(from)<amt){bankrupt(from,to);return false;}
  need={amount:amt,desc:`支付${desc}`,forced:true,done,who:from};
  return true;
}
function bankrupt(i,to){
  const p=P[i];if(to>=0){P[to].cash+=p.cash;mfxAdd(i,-p.cash);mfxAdd(to,p.cash);}p.cash=0;p.alive=false;
  RK.forEach(r=>p.st[r]=0);lands(i).forEach(t=>{delete owner[t.id];delete lv[t.id];delete inv[t.id];delete landMod[t.id];});monoSync();p.gems={};
  log(`${pn(i)} 資產不足，破產出局`);
  if(P.filter(q=>q.alive).length<2){phase='over';winner=P.findIndex(q=>q.alive);hist.push(histNow());log(`${pn(winner)} 獲勝！`);render();}
  else endTurn();
}
function endTurn(){
  if(phase==='over'||need||ask||alloc||extraOn||offer)return;
  const old=turn;do{turn=(turn+1)%np;}while(!P[turn].alive);
  upUsed=0;upIds=[];flipUsed=false;justBought=-1;traded={};extraOn=false;offerN=0;
  if(turn<=old)hist.push(histNow());   // 繞完一圈（每位玩家都行動過）：記錄各人總資產
  if(deck.every(d=>d.by>=0)){newDeck();log('49 張牌已翻完，重新洗牌');}
  phase='roll';first=true;render();
}

/* ---------- 起點、勝利、股價 ---------- */
function passStart(i){
  const p=P[i];
  // 1) 先以目前資產判斷是否達成勝利條件
  if(assets(i)>=MAP.WIN_ASSETS){phase='over';winner=i;choices=null;left=0;hist.push(histNow());log(`${pn(i)} 總資產 ${money(assets(i))}，經過起點，獲得勝利！`);render();return true;}
  // 2) 未達成才發放寶石等級獎勵（獎勵不影響本次判定）
  if(MAP.GEM_KEYS.every(k=>p.gems[k])){
    const b=MAP.gemBonus(p.level);p.cash+=b;p.level++;p.gems={};pendingTrade=true;
    log(`${pn(i)} 集滿四顆寶石！獎金 ${money(b)}，升為 Lv.${p.level}，並獲得一次額外股市買賣機會`);
  }
  return false;
}
function bump(r,pct){
  const o=stock[r];sf[r]=Math.max(50,sf[r]*(1+pct));stock[r]=Math.round(sf[r]);
  if(stock[r]!==o)chg[r]=stock[r]-o;
}
const noTrade=()=>!Object.keys(traded).length;
const onOwnS=()=>{const q=T[P[turn].pos];return q.type==='land'&&owner[q.id]===turn&&(lv[q.id]||0)>=5;};
const upCap=()=>onOwnS()?2:1;           // 停在自己的 S 級地：本回合可升級兩塊不同的地
const upFull=()=>upUsed>=upCap();
const canUpHere=id=>{const q=T[P[turn].pos];return q.type==='start'||onOwnS()||(q.type==='land'&&q.id===id)||(q.type==='stock'&&noTrade());};
function upgradeAt(id){
  const t=T[id],l=lv[id]||0;
  if(phase!=='act'||need||upFull()||upIds.includes(id)||owner[id]!==turn||l>=5||justBought===id||!canUpHere(id))return;
  const c=upOf(t);
  spend(c,`升級 ${t.name} 為 ${MAP.LEVELS[l+1]} 級`,()=>{P[turn].cash-=c;inv[id]=(inv[id]||0)+c;lv[id]=l+1;upUsed++;upIds.push(id);bump(t.region,IM.upgrade);log(`${pn(turn)} 升級 ${t.name}：${MAP.LEVELS[l]}→${MAP.LEVELS[l+1]}（${money(c)}）`);});
}
function buyout(){
  const p=P[turn],t=T[p.pos],o=owner[t.id];
  if(phase!=='act'||need||t.type!=='land'||o===undefined||o===turn||(lv[t.id]||0)>MAP.BUYOUT_MAX_LV)return;
  const c=MAP.BUYOUT_MULT*t.price;
  spend(c,`強制併購 ${t.name}`,()=>{p.cash-=c;P[o].cash+=c;mfxAdd(turn,-c);mfxAdd(o,c);owner[t.id]=turn;justBought=t.id;bump(t.region,IM.buyout);log(`${pn(turn)} 強制併購 ${t.name}，付給${pn(o)} ${money(c)}`);monoSync();});
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
const pickP=(title,ids,cb)=>askBox(title,ids.map(j=>({label:`${pn(j)}（${nm(P[j].pos)}，現金 ${money(P[j].cash)}）`,fn:()=>cb(j)})));
function allocStart(i){
  const total=RK.reduce((s,r)=>s+P[i].st[r],0);
  if(!total){log('沒有股票可分配');return;}
  alloc={i,total,vals:{...P[i].st}};render();
}
const allocSum=()=>RK.reduce((s,r)=>s+alloc.vals[r],0);
const allocTxt=()=>`已分配 ${allocSum()} / ${alloc.total}（${allocSum()===alloc.total?'可確定':'需剛好等於總數'}）`;
function allocModal(){
  return `<div class="md"><div class="box"><b>重新分配股票</b><p>共 ${alloc.total} 張，每區最多 ${MAXH}。</p>`+
    RK.map((r,k)=>`<div>${k+1}區 ${RN(r)} <input type="number" min="0" max="${MAXH}" value="${alloc.vals[r]}" oninput="allocSet('${r}',this.value)"></div>`).join('')+
    `<p id="al_rem">${allocTxt()}</p><button class="big" id="al_ok" onclick="allocOk()" ${allocSum()===alloc.total?'':'disabled'}>確定</button></div></div>`;
}
function allocSet(r,v){alloc.vals[r]=Math.max(0,Math.min(MAXH,Math.floor(+v||0)));$('#al_rem').innerHTML=allocTxt();$('#al_ok').disabled=allocSum()!==alloc.total;}
function allocOk(){if(allocSum()!==alloc.total)return;RK.forEach(r=>P[alloc.i].st[r]=alloc.vals[r]);log(`${pn(alloc.i)} 重新分配股票：`+RK.map(r=>RN(r)+alloc.vals[r]).join(' '));alloc=null;render();}

/* ---------- 牌效果用的工具 ---------- */
const gain=(i,n)=>{P[i].cash+=n;};
const alive=()=>P.map((_,j)=>j).filter(j=>P[j].alive);
const others=i=>alive().filter(j=>j!==i);
const rnd=a=>a[Math.random()*a.length|0];
const addSt=(i,r,n)=>{const g=Math.min(n,MAXH-P[i].st[r]);P[i].st[r]+=g;log(`${pn(i)} 獲得${RN(r)}股票 ${g} 張`);};
const setPrice=(r,v)=>{const o=stock[r];sf[r]=Math.max(50,v);stock[r]=Math.round(sf[r]);if(stock[r]!==o)chg[r]=stock[r]-o;log(`${RN(r)}股價 ${o}→${stock[r]}`);};
const tm=(r,f)=>{tollMod[r]=Math.max(.25,Math.min(4,(tollMod[r]||1)*f));log(`${RN(r)}過路費倍率 ${tollMod[r].toFixed(2)}`);};
const dropLand=id=>{delete owner[id];delete lv[id];delete inv[id];delete landMod[id];monoSync();};
const teleportPrev=id=>{const tri=MAP.TRIS.find(g=>g.includes(id));return tri?MAP.ADJ[id].find(n=>!tri.includes(n)):MAP.ADJ[id][0];};
function advance(n){log(`前進 ${n} 格`);phase='move';left=n;first=false;step();}
function arrive(i){
  const p=P[i],tt=T[p.pos];
  if(tt.type==='gem'&&!p.gems[tt.gem]){p.gems[tt.gem]=1;log(`${pn(i)} 獲得${MAP.GEMS[tt.gem].name}`);}
  if(tt.type==='start'&&passStart(i))return;
  if(pendingTrade){pendingTrade=false;extraOn=true;traded={};resumeMove=true;phase='move';left=0;render();return;}
  land();
}
function teleport(i,id){P[i].pos=id;P[i].prev=teleportPrev(id);log(`${pn(i)} 傳送到 ${nm(id)}`);arrive(i);}
function randGem(i,missingOnly){
  const ks=MAP.GEM_KEYS.filter(k=>!missingOnly||!P[i].gems[k]);if(!ks.length){log('寶石已集滿');return;}
  const k=rnd(ks);
  if(P[i].gems[k])log(`已持有${MAP.GEMS[k].name}，沒有效果`);else{P[i].gems[k]=1;log(`${pn(i)} 獲得${MAP.GEMS[k].name}`);}
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
  add('隨機獲得某區股票20張',i=>addSt(i,rnd(RK),20));
  add('所有人來到此寶石格',i=>{others(i).forEach(o=>{P[o].pos=P[i].pos;P[o].prev=teleportPrev(P[i].pos);});log('所有人來到此寶石格');});
  add('能以五倍原土地價格販賣任一持有土地',i=>pickTile('以原始地價 5 倍賣出哪塊地？',lands(i),id=>{const v=5*T[id].price;bump(T[id].region,-IM.sellLand);dropLand(id);P[i].cash+=v;log(`${pn(i)} 以 5 倍價賣出 ${nm(id)}（${money(v)}）`);},true));
  add('指定一區域股票上升10%',()=>pickR('哪一區股價上升 10%？',r=>bump(r,.1)));
  add('指定一區域股票下降10%',()=>pickR('哪一區股價下降 10%？',r=>bump(r,-.1)));
  add('選擇一區域平分總股票數量',i=>pickR('選一區域，所有玩家平分該區股票',r=>{
    const al=alive(),tot=al.reduce((s,j)=>s+P[j].st[r],0),each=Math.floor(tot/al.length),rem=tot-each*al.length;
    al.forEach(j=>{P[j].st[r]=Math.min(MAXH,each);});P[i].st[r]=Math.min(MAXH,each+rem);log(`${RN(r)}股票 ${tot} 張平分，每人 ${each} 張（餘 ${rem} 張給翻牌者）`);}));
  add('所有人回到起點',i=>{others(i).forEach(o=>{P[o].pos=0;P[o].prev=MAP.ADJ[0][0];});log('所有人回到起點');teleport(i,0);});
  add('指定一區域股價與最高區域股價相同',()=>pickR('哪一區股價調成與最高區相同？',r=>setPrice(r,Math.max(...RK.map(x=>stock[x])))));
  add('向一人收取500元',i=>pickP('向哪位玩家收取 500 元？',others(i),j=>{const m=Math.min(500,P[j].cash);P[j].cash-=m;P[i].cash+=m;log(`${pn(i)} 向${pn(j)} 收取 ${m}`);}));
  add('指定一區域股價翻倍',()=>pickR('哪一區股價翻倍？',r=>bump(r,1)));
  add('獲得所有區域股票5張',i=>RK.forEach(r=>addSt(i,r,5)));
  add('所有人的現金相加後平分給眾人',i=>{
    const al=alive(),tot=al.reduce((s,j)=>s+P[j].cash,0),each=Math.floor(tot/al.length),rem=tot-each*al.length;
    al.forEach(j=>{P[j].cash=each;});P[i].cash+=rem;
    log(`所有人現金合計 ${money(tot)}，平分後每人 ${money(each)}${rem?`（餘 ${rem} 元給翻牌者）`:''}`);});
  add('某區過路費提升30%',()=>pickR('哪一區過路費提升 30%？',r=>tm(r,1.3)));
  add('某區過路費下降10%',()=>pickR('哪一區過路費下降 10%？',r=>tm(r,.9)));
  add('指定傳送至任一持有土地格',i=>pickTile('傳送到你的哪塊土地？',lands(i),id=>teleport(i,id)));
  add('獲得擲骰點數*2200元',i=>{const d=1+(Math.random()*6|0);gain(i,2200*d);log(`擲出 ${d}，獲得 ${2200*d} 元`);});
  add('隨機一區域股票上升20%',()=>bump(rnd(RK),.2));
  add('隨機一區域股票下降10%',()=>bump(rnd(RK),-.1));
  add('持有的E級土地全部升為D級，過路費減半',i=>{
    const ls=lands(i).filter(t=>(lv[t.id]||0)===0);if(!ls.length)return log('沒有E級土地');
    ls.forEach(t=>{lv[t.id]=1;landMod[t.id]=Math.max(.25,(landMod[t.id]||1)*.5);});
    log(`${pn(i)} 的 ${ls.map(t=>t.name).join('、')} 升為 D 級，過路費減半`);});
  add('隨機一地區土地全部升一級',i=>{
    const rs=[...new Set(lands(i).map(t=>t.region))];if(!rs.length)return log('沒有土地');
    const r=rnd(rs);lands(i).filter(t=>t.region===r&&(lv[t.id]||0)<5).forEach(t=>{lv[t.id]=(lv[t.id]||0)+1;});log(`${RN(r)}的土地全部升一級`);});
  add('傳送至任一寶石格',i=>pickTile('傳送到哪個寶石格？',T.filter(t=>t.type==='gem'),id=>teleport(i,id)));
  add('指定獲得某區股票10張',i=>pickR('獲得哪一區股票 10 張？',r=>addSt(i,r,10)));
  add('指定獲得某區股票20張',i=>pickR('獲得哪一區股票 20 張？',r=>addSt(i,r,20)));
  add('能以兩倍價拋售某一地區持有股票',i=>pickR('以 2 倍價拋售哪一區的股票？',r=>{const n=P[i].st[r],v=2*stock[r]*n;P[i].st[r]=0;P[i].cash+=v;bump(r,-IM.perShare*n);log(`${pn(i)} 以 2 倍價拋售${RN(r)} ${n} 張（${money(v)}）`);},RK.filter(r=>P[i].st[r]>0),true));
  add('指定一區域過路費減半',()=>pickR('哪一區過路費減半？',r=>tm(r,.5)));
  add('隨機一區域過路費減半',()=>tm(rnd(RK),.5));
  add('指定一區域過路費翻倍',()=>pickR('哪一區過路費翻倍？',r=>tm(r,2)));
  add('隨機一區域過路費翻倍',()=>tm(rnd(RK),2));
  add('指定任一持有土地過路費翻倍',i=>pickTile('哪塊地過路費翻倍？',lands(i),id=>{landMod[id]=Math.min(8,(landMod[id]||1)*2);log(`${nm(id)}過路費倍率 ${landMod[id]}`);}));
  add('股價全數減半',()=>RK.forEach(r=>bump(r,-.5)));
  add('指定一區域股價回歸原始值',()=>pickR('哪一區股價回到原始值？',r=>setPrice(r,base[r])));
  add('獲得四顆寶石',i=>{MAP.GEM_KEYS.forEach(k=>{P[i].gems[k]=1;});log(`${pn(i)} 獲得四顆寶石（${MAP.GEM_KEYS.map(k=>MAP.GEMS[k].name).join('、')}）`);});
  add('隨機一區域過路費下降20%',()=>tm(rnd(RK),.8));
  add('所有人現金增加10%',()=>alive().forEach(j=>{P[j].cash+=Math.round(P[j].cash*.1);}));
  add('傳送至任一玩家格',i=>pickP('傳送到哪位玩家的格子？',others(i),j=>teleport(i,P[j].pos)));
  add('計算所持有股票數量後隨意分配',i=>allocStart(i));
  add('與指定玩家交換位置',i=>pickP('與哪位玩家交換位置？',others(i),j=>{
    const a=[P[i].pos,P[i].prev];P[i].pos=P[j].pos;P[i].prev=P[j].prev;P[j].pos=a[0];P[j].prev=a[1];log(`${pn(i)} 與${pn(j)} 交換位置`);arrive(i);}));
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
  lastCard=`#${s+1} ${pn(i)} 翻到：${cd.name}`;log(lastCard);
  const row=Math.floor(s/7)*7;let a=s,b=s;
  while(a>row&&deck[a-1].by===i)a--;
  while(b<row+6&&deck[b+1].by===i)b++;
  const n=b-a+1;
  if(n>=2){P[i].cash+=100*n;log(`橫向連線 ${n} 張（#${a+1}~#${b+1}），獎金 ${100*n}`);}
  cd.fn(i);
  render();
}
let CARD_OPEN=false;   // 翻牌區平常收起；玩家自己按「查看翻牌區」才展開（只影響自己的畫面）
const toggleCards=()=>{CARD_OPEN=!CARD_OPEN;render();};
function cardBox(){
  const p=P[turn],can=phase==='act'&&!need&&!ask&&!alloc&&!flipUsed&&T[p.pos].type==='gem';
  if(!can&&!CARD_OPEN)return `<div style="margin-top:8px"><button onclick="toggleCards()">查看翻牌區</button></div>`; // 只有需要翻牌時才自動顯示
  return `<div class="box" style="margin-top:8px"><b>翻牌區</b>${can?'':' <button onclick="toggleCards()" style="margin:0 0 0 6px;padding:2px 10px">收起</button>'}（${can?'<span class="hint">請點選一個數字翻牌</span>':'停在寶石格可自選一張牌翻開；橫向連線每張 +100'}）<div class="cg">`+
    deck.map((d,k)=>d.by<0?`<div class="cd${can?' can':''}" ${can?`onclick="flipAt(${k})"`:''}>${k+1}</div>`:`<div class="cd on" style="background:${C[d.by]};color:${ink(C[d.by])}" title="${CARDS[d.c].name}">${k+1}<small>P${d.by+1}</small></div>`).join('')+
    `</div>${lastCard?`<div style="margin-top:4px">${lastCard}</div>`:''}</div>`;
}

const chgTxt=r=>chg[r]?` <small style="color:${chg[r]>0?'#e04b4b':'#2aa86a'}">${chg[r]>0?'▲':'▼'}${Math.abs(chg[r])}</small>`:'';
function costTxt(r){
  const p=P[turn],q=Math.max(1,Math.min(MAXT,qty[r]|0)),c=q*stock[r];
  return `預購 ${q} 股：<b>${money(c)}</b>`+(p.cash>=c?`（買後餘 ${money(p.cash-c)}）`:`<span style="color:#e04b4b">（現金差 ${money(c-p.cash)}）</span>`)+`｜賣出可得 ${money(Math.min(q,p.st[r])*stock[r])}`;
}
function setQty(r,v){qty[r]=Math.max(1,Math.min(MAXT,+v||1));$('#c_'+r).innerHTML=costTxt(r);}

function maxBuy(r){const p=P[turn];qty[r]=Math.max(1,Math.min(MAXT,MAXH-p.st[r],Math.floor(p.cash/stock[r])));render();} // 目前現金買得起的最大張數（單次仍以 MAXT 為上限）

/* ---------- 金錢異動動畫：被扣款紅字 -N、收款綠字 +N，浮在玩家資訊框旁 ---------- */
let MFX_Q={};   // 玩家編號 → {t:下一筆最早開始時間, n:正在顯示/排隊的筆數}
function mfxPlay(){
  if(MFX_SEEN===null||mfxSeq<MFX_SEEN){MFX_SEEN=mfxSeq;return;}
  const boxes=document.querySelectorAll('#sd .pl'),now=Date.now();
  mfx.filter(e=>e.id>MFX_SEEN).forEach(e=>{
    const b=boxes[e.i];if(!b)return;
    const q=MFX_Q[e.i]||(MFX_Q[e.i]={t:0,n:0}),delay=Math.max(0,q.t-now),slot=Math.min(q.n,3);
    q.t=now+delay+650;q.n++;   // 同一人的下一筆晚 0.65 秒再出現，且往下錯開一格
    const r=b.getBoundingClientRect(),d=document.createElement('div');
    d.className='mfx '+(e.a<0?'neg':'pos');d.textContent=(e.a<0?'-':'+')+money(Math.abs(e.a));
    d.style.left=Math.max(4,Math.min(innerWidth-130,r.right-140))+'px';
    d.style.top=Math.max(4,Math.min(innerHeight-40,r.top+Math.min(30,r.height/3)+slot*30))+'px';
    d.style.animationDelay=delay+'ms';
    document.body.appendChild(d);setTimeout(()=>{d.remove();q.n--;},delay+1700);
  });
  MFX_SEEN=mfxSeq;
}

/* ---------- 玩家間交易：輪到的玩家向另一位玩家提出「地＋現金」換對方一塊地 ---------- */
const landTxt=id=>`${MAP.LEVELS[lv[id]||0]}級${T[id].name}`;
const landDet=id=>`<b style="color:${LVC[lv[id]||0]}">${MAP.LEVELS[lv[id]||0]}</b> ${T[id].name}（地價 ${money(T[id].price)}，過路費 ${money(tollOf(T[id]))}）`;
const offerTxt=o=>`${o.give>=0?landTxt(o.give):''}${o.give>=0&&o.cash>0?' ＋ ':''}${o.cash>0?money(o.cash):''} 換 ${landTxt(o.want)}`;
const canOffer=()=>!offer&&!need&&!ask&&!alloc&&!extraOn&&(phase==='roll'||phase==='act')&&offerN<3;   // 每回合最多提出 3 次，同時只能有一筆
function offerMake(to,want,give,cash){
  const p=P[turn],int=Number.isInteger;
  if(!canOffer()||!int(to)||!P[to]||to===turn||!P[to].alive)return;
  if(!int(want)||!T[want]||T[want].type!=='land'||owner[want]!==to)return;
  if(give!==-1&&(!int(give)||!T[give]||owner[give]!==turn))return;
  if(!int(cash)||cash<0||cash>p.cash||(give===-1&&cash<1))return;
  offer={from:turn,to,want,give,cash};offerN++;
  log(`${pn(turn)} 向 ${pn(to)} 提出交易：${offerTxt(offer)}`);render();
}
function offerAccept(){
  if(!offer)return;
  const o=offer,a=P[o.from],b=P[o.to];offer=null;
  if(!(a.alive&&b.alive&&owner[o.want]===o.to&&(o.give<0||owner[o.give]===o.from)&&a.cash>=o.cash)){log('交易條件已改變，交易失效');return render();}
  owner[o.want]=o.from;if(o.give>=0)owner[o.give]=o.to;
  a.cash-=o.cash;b.cash+=o.cash;
  if(o.cash>0){mfxAdd(o.from,-o.cash);mfxAdd(o.to,o.cash);}
  log(`${pn(o.to)} 接受交易：${pn(o.from)} ${offerTxt(o)}`);monoSync();render();
}
function offerDecline(){if(!offer)return;log(`${pn(offer.to)} 拒絕了 ${pn(offer.from)} 的交易`);offer=null;render();}
function offerCancel(){if(!offer)return;log(`${pn(offer.from)} 取消了交易`);offer=null;render();}
// 以下是發起交易的介面（只在瀏覽器端使用）
const tradeValid=()=>!!tradeUI&&tradeUI.want>=0&&(tradeUI.give>=0||tradeUI.cash>0);
const tradeSum=()=>tradeValid()?`<b>${pn(turn)}</b> 提出：${offerTxt({give:tradeUI.give,cash:tradeUI.cash,want:tradeUI.want})}`:'請選擇想要的土地，並加上自己的一塊地或現金';
function tradeOpen(to){if(ME!==turn||!canOffer())return;tradeUI={to,want:-1,give:-1,cash:0};render();}
function tradeSet(k,v){tradeUI[k]=v;render();}
function tradeCash(v){tradeUI.cash=Math.max(0,Math.min(P[turn].cash,Math.floor(+v||0)));$('#tc_ok').disabled=!tradeValid();$('#tc_sum').innerHTML=tradeSum();}
function tradeClose(){tradeUI=null;render();}
function tradeSend(){if(!tradeValid())return;const u=tradeUI;tradeUI=null;offerMake(u.to,u.want,u.give,u.cash);}
const tradeBtn=i=>ME===turn&&i!==turn&&P[i].alive&&lands(i).length&&canOffer()?`<br><button onclick="tradeOpen(${i})">發出交易</button>`:'';
function composeModal(){
  const u=tradeUI,row=(ids,key,none)=>(none?`<label><input type="radio" name="tr_${key}" ${u[key]<0?'checked':''} onclick="tradeSet('${key}',-1)"> 不加土地</label><br>`:'')+ids.map(t=>`<label><input type="radio" name="tr_${key}" ${u[key]===t.id?'checked':''} onclick="tradeSet('${key}',${t.id})"> ${landDet(t.id)}</label><br>`).join('')||'（沒有土地）<br>';
  return `<div class="md" style="z-index:8"><div class="box"><b>向 <span style="color:${C[u.to]}">${pn(u.to)}</span> 發出交易</b>
    <p><b>想要對方的土地（選一塊）</b><br>${row(lands(u.to),'want',false)}</p>
    <p><b>我的條件</b>（自己的一塊地、現金，或兩者）<br>${row(lands(turn),'give',true)}現金 <input type="number" min="0" max="${P[turn].cash}" value="${u.cash}" oninput="tradeCash(this.value)">（現有 ${money(P[turn].cash)}）</p>
    <div id="tc_sum" style="margin:6px 0">${tradeSum()}</div>
    <button class="big" id="tc_ok" onclick="tradeSend()" ${tradeValid()?'':'disabled'}>送出交易</button><button onclick="tradeClose()">取消</button></div></div>`;
}
function offerModal(){
  const o=offer,toMe=ME===o.to,fromMe=ME===o.from;
  const body=`<p><b style="color:${C[o.from]}">${pn(o.from)}</b> 提出：</p><p>給出：${o.give>=0?landDet(o.give):''}${o.give>=0&&o.cash>0?'<br>＋ ':''}${o.cash>0?'現金 <b>'+money(o.cash)+'</b>':''}<br>換取：${landDet(o.want)}</p>`;
  const btn=toMe?`<button class="big" onclick="offerAccept()">接受</button><button onclick="offerDecline()">拒絕</button>`:`<div class="hint">等待 ${pn(o.to)} 回應…</div>`+(fromMe?`<button onclick="offerCancel()">取消交易</button>`:'');
  return `<div class="md" style="z-index:8"><div class="box"><b>玩家間交易</b>${body}${btn}</div></div>`;
}

/* ---------- 結束後的總資產折線圖 ---------- */
function histChart(){
  const n=hist.length;if(n<2)return '';
  const W=360,Ht=210,L=46,R=12,Tp=12,B=26,mx=Math.max(1,...hist.flat()),top=Math.max(10000,Math.ceil(mx*1.08/10000)*10000);
  const X=k=>L+(W-L-R)*k/(n-1),Y=v=>Tp+(Ht-Tp-B)*(1-v/top),sh=v=>v>=1000?Math.round(v/1000)+'k':v;
  let g='';
  for(let k=0;k<=4;k++){const v=top*k/4;g+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-5}" y="${Y(v)+4}" font-size="10" text-anchor="end" fill="var(--fg)">${sh(v)}</text>`;}
  if(MAP.WIN_ASSETS<=top)g+=`<line x1="${L}" x2="${W-R}" y1="${Y(MAP.WIN_ASSETS)}" y2="${Y(MAP.WIN_ASSETS)}" stroke="#d9a900" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W-R}" y="${Y(MAP.WIN_ASSETS)-3}" font-size="9" text-anchor="end" fill="#d9a900">勝利 ${sh(MAP.WIN_ASSETS)}</text>`;
  const step=Math.ceil((n-1)/8);
  for(let k=0;k<n;k++)if(k%step===0||k===n-1)g+=`<text x="${X(k)}" y="${Ht-8}" font-size="10" text-anchor="middle" fill="var(--fg)">${k===n-1?'終':k}</text>`;
  const lines=P.map((_,i)=>`<polyline points="${hist.map((h,k)=>X(k).toFixed(1)+','+Y(h[i]).toFixed(1)).join(' ')}" fill="none" stroke="${C[i]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(n-1)}" cy="${Y(hist[n-1][i])}" r="3.5" fill="${C[i]}"/>`).join('');
  const lg=P.map((_,i)=>`<span style="margin-right:10px;white-space:nowrap"><span class="sw" style="background:${C[i]}"></span> ${pn(i)} ${money(hist[n-1][i])}</span>`).join('');
  return `<div class="box"><b>各回合總資產</b>（四人各行動一次為一回合；0＝開局，終＝結束時）<svg viewBox="0 0 ${W} ${Ht}" style="width:100%;height:auto">${g}${lines}</svg><div style="font-size:12px">${lg}</div></div>`;
}

/* ---------- 區域獨佔：集滿某區四塊土地的那一刻 ---------- */
// 該區股價 +20%；四塊地各升一級（每區只升這一次，S 級不變）；獨佔期間該區過路費 +20%（算在 tollOf）。
// 失去獨佔（例如交易換出一塊）：股價回復（÷1.2）、過路費加成消失，已升的等級保留。
function monoSync(){
  RK.forEach(r=>{
    const o=monoOwner(r),prev=mono[r]===undefined?-1:mono[r];
    if(o===prev)return;
    mono[r]=o;
    if(prev>=0){bump(r,1/1.2-1);log(`${RN(r)} 失去獨佔，股價與過路費加成消失`);}
    if(o>=0){
      bump(r,0.2);let up=false;
      if(!monoLvDone[r]){monoLvDone[r]=true;T.filter(t=>t.type==='land'&&t.region===r).forEach(t=>{if((lv[t.id]||0)<5){lv[t.id]=(lv[t.id]||0)+1;up=true;}});}
      log(`${pn(o)} 集滿${RN(r)}四塊土地，獨佔！${RN(r)}股價 +20%、過路費 +20%${up?'、四塊地各升一級':''}`);
    }
  });
}

/* ---------- 買賣 ---------- */
function spend(amount,desc,done){
  if(P[turn].cash>=amount){done();render();return;}
  if(assets(turn)<amount){log(`資產不足，無法${desc}`);render();return;}
  need={amount,desc,done,forced:false,who:turn};render();
}
function buyLand(){
  const t=T[P[turn].pos];
  if(phase!=='act'||need||t.type!=='land'||owner[t.id]!==undefined)return;
  spend(t.price,`買下 ${t.name}`,()=>{P[turn].cash-=t.price;owner[t.id]=turn;justBought=t.id;bump(t.region,IM.buyLand);log(`${pn(turn)} 買下 ${t.name}（${money(t.price)}）`);monoSync();});
}
function openTrade(){extraOn=true;traded={};resumeMove=false;log(`${pn(turn)} 獲得一次股市買賣機會`);}
function closeExtra(){if(!extraOn)return;extraOn=false;if(resumeMove){resumeMove=false;step();return;}render();}
function trade(r,sign){
  const p=P[turn];
  if(!(phase==='act'||(phase==='move'&&extraOn))||need||!((T[p.pos].type==='stock'&&!upUsed)||extraOn))return;
  if(traded[r]){log(`${RN(r)} 本次已交易，暫時關閉`);return render();}
  let q=Math.max(1,Math.min(MAXT,qty[r]|0));
  if(sign>0){
    q=Math.min(q,MAXH-p.st[r]);
    if(q<1){log(`${RN(r)} 持股已達上限 ${MAXH}`);return render();}
    const cost=q*stock[r];
    spend(cost,`買入${RN(r)} ${q} 股`,()=>{traded[r]=true;p.cash-=cost;p.st[r]+=q;bump(r,IM.perShare*q);log(`${pn(turn)} 買入${RN(r)} ${q} 股（${money(cost)}）`);});
  }else{
    q=Math.min(q,p.st[r]);if(q<1)return;
    traded[r]=true;p.st[r]-=q;p.cash+=q*stock[r];log(`${pn(turn)} 賣出${RN(r)} ${q} 股（${money(q*stock[r])}）`);bump(r,-IM.perShare*q);render();
  }
}
function chk(){
  if(need&&need.forced&&P[need.who].cash>=need.amount){const d=need.done;need=null;d();}
  render();
}
function sellStock(r,n){
  const p=P[turn];n=Math.min(n,p.st[r]);if(n<1)return;
  p.st[r]-=n;p.cash+=n*stock[r];log(`${pn(turn)} 賣出${RN(r)} ${n} 股（${money(n*stock[r])}）`);bump(r,-IM.perShare*n);chk();
}
function sellEnough(r){sellStock(r,Math.ceil((need.amount-P[turn].cash)/stock[r]));}
function sellLand(id){
  if(hasStock(turn)||owner[id]!==turn)return;
  const v=landVal(T[id]);bump(T[id].region,-IM.sellLand);delete owner[id];delete lv[id];delete inv[id];delete landMod[id];P[turn].cash+=v;log(`${pn(turn)} 賣掉 ${nm(id)}（${money(v)}）`);monoSync();chk();
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
  const o=owner[t.id],flag=o===undefined?'':`<circle cx="${x+W-11}" cy="${y+11}" r="8" fill="${C[o]}" stroke="#fff" stroke-width="1.5"/><text x="${x+W-11}" y="${y+15}" font-size="10" font-weight="700" fill="${ink(C[o])}" text-anchor="middle">${o+1}</text>`;
  const cur=here.includes(turn);
  return `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="9" fill="${fill}" stroke="${cur?C[turn]:'#8a8a82'}" stroke-width="${cur?4:1.5}"/>
   <text x="${cx(t)}" y="${y+31}" font-size="${t.name.length>4?12:15}" font-weight="700" fill="${tc}" text-anchor="middle">${icon} ${t.name}</text>
   <text x="${cx(t)}" y="${y+43}" font-size="11" fill="${tc}" text-anchor="middle" opacity=".85">${sub}</text>
   <text x="${cx(t)}" y="${y+60}" font-size="17" font-weight="800" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${sub2}</text>${badge}${flag}`;
}

/* ---------- 擲骰動畫（約 1.5 秒；所有玩家都看得到） ---------- */
const DICE_FACES=['⚀','⚁','⚂','⚃','⚄','⚅'];let ROLL_SEEN=null,ROLL_UNTIL=0,ROLL_T=0;
function rollFx(){
  if(ROLL_T)return;
  ROLL_T=setInterval(()=>{
    const left=ROLL_UNTIL-Date.now(),e=$('#dz');
    if(left<=0){clearInterval(ROLL_T);ROLL_T=0;render();return;}
    if(e)e.textContent=DICE_FACES[left<300?Math.max(0,(dice||1)-1):Math.random()*6|0]; // 最後 0.3 秒停在真正的點數
  },80);
}
/* ---------- 小地圖（只標示玩家位置，不含文字） ---------- */
function miniSvg(){
  const tiles=T.map(t=>{
    const x=cx(t)-W/2,y=cy(t)-H/2,X=cx(t),Y=cy(t);
    if(t.type==='gem')return `<polygon points="${X},${Y-42} ${X+46},${Y} ${X},${Y+42} ${X-46},${Y}" fill="${MAP.GEMS[t.gem].color}" stroke="#222" stroke-width="6" stroke-linejoin="round"/>`;
    const f=t.type==='land'?(owner[t.id]!==undefined?C[owner[t.id]]:'#c9c9c4'):t.type==='stock'?'#d4dae2':'#fff';
    return `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="9" fill="${f}" ${t.type==='land'?'':'stroke="#aaa" stroke-width="3"'}/>`;
  }).join('');
  const off=[[-20,-15],[20,-15],[-20,15],[20,15]];
  const dots=P.map((p,i)=>{
    if(!p.alive)return '';
    const k=P.filter((q,j)=>q.alive&&q.pos===p.pos&&j<i).length,t=T[p.pos],x=cx(t)+off[k%4][0],y=cy(t)+off[k%4][1],me=i===turn&&phase!=='over';
    return (me?`<circle class="pulse" cx="${x}" cy="${y}" r="29" fill="none" stroke="${C[i]}" stroke-width="6"/>`:'')+`<circle cx="${x}" cy="${y}" r="${me?20:17}" fill="${C[i]}" stroke="#fff" stroke-width="5"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${VW} ${VH}" style="max-height:140px">${tiles}${dots}</svg>`;
}

/* ---------- 棋子（獨立圖層：保留元素才能做移動動畫） ---------- */
const SVGNS='http://www.w3.org/2000/svg',TK=40,SM=.5; // 圖片基準 40px（輪到的玩家）；其他玩家縮小為 SM 倍
function tokTarget(){
  const out={};
  P.forEach((p,i)=>{
    if(!p.alive)return;
    const t=T[p.pos],x=cx(t)-W/2,y=cy(t)-H/2,me=i===turn&&phase!=='over';
    if(me)out[i]={x:cx(t)+27,y:y+H-TK/2-1,me};                       // 輪到的玩家：放大，在格子右下
    else{
      const k=P.filter((q,j)=>q.alive&&q.pos===p.pos&&j<i&&!(j===turn&&phase!=='over')).length;
      out[i]={x:x+4+TK*SM/2+k*16,y:y+H-4-TK*SM/2,me};                // 其他玩家：縮小，由左下角往右排
    }
  });
  return out;
}
function updateTokens(){
  const g=$('#gk');if(!g)return;
  const tg=tokTarget();
  [...g.children].forEach(el=>{if(!tg[el.getAttribute('data-i')])el.remove();});
  Object.keys(tg).forEach(i=>{
    const a=tg[i];let el=g.querySelector(`[data-i="${i}"]`);
    const tf=`translate(${a.x}px,${a.y}px)`;
    if(!el){
      el=document.createElementNS(SVGNS,'g');el.setAttribute('class','tok');el.setAttribute('data-i',i);
      el.style.transform=tf;el._x=a.x;el._y=a.y;
      el.innerHTML=`<g class="tk${a.me?' me':''}"><ellipse cx="0" cy="${TK*.42}" rx="${TK*.38}" ry="${TK*.12}" fill="${C[i]}" stroke="#fff" stroke-width="1.5"/><image href="${picUrl(i)}" x="${-TK/2}" y="${-TK/2}" width="${TK}" height="${TK}"/></g>`;
      g.appendChild(el);
    }else{
      if(el._x!==a.x||el._y!==a.y){
        const d=Math.hypot(a.x-el._x,a.y-el._y);
        el.style.transitionDuration=(d>SX*1.6?.55:.24)+'s'; // 單步移動 0.24 秒；傳送/長距離 0.55 秒
        el.style.transform=tf;el._x=a.x;el._y=a.y;
      }
      el.firstChild.classList.toggle('me',!!a.me);
    }
  });
}
function clearTokens(){const g=$('#gk');if(g)g.innerHTML='';}

function modal(){
  if(!need)return '';
  const p=P[need.who],short=need.amount-p.cash;
  let body='';
  if(p.cash>=need.amount)body=`<p>現金已足夠。</p><button class="big" onclick="confirmNeed()">確認${need.desc}</button>`;
  else if(hasStock(need.who))body=`<p>是否賣出股票？（尚有股票時不能賣地）</p><table>`+RK.filter(r=>p.st[r]>0).map(r=>
    `<tr><td>${RN(r)}</td><td>${p.st[r]} 股 × ${stock[r]}</td><td><button onclick="sellStock('${r}',1)">賣1</button><button onclick="sellEnough('${r}')">賣到夠</button><button onclick="sellStock('${r}',${p.st[r]})">全賣</button></td></tr>`).join('')+`</table>`;
  else body=`<p>已無股票可賣，可賣出土地（地價＋升級投入）：</p>`+lands(need.who).map(t=>`<button onclick="sellLand(${t.id})">賣 ${t.name} +${money(landVal(t))}</button>`).join('');
  const cancel=need.forced?'':`<button onclick="cancelNeed()">取消</button>`;
  return `<div class="md"><div class="box"><b>現金不足</b><p>${need.desc}需要 ${money(need.amount)}，現金 ${money(p.cash)}，還差 <b>${money(Math.max(0,short))}</b>。</p>${body}<div>${cancel}</div></div></div>`;
}
function render(){
  const p=P[turn],t=T[p.pos];
  if(tradeUI&&(ME!==turn||!canOffer()))tradeUI=null;
  let lines='';
  MAP.ADJ.forEach((ns,a)=>ns.forEach(b=>{if(a<b)lines+=`<line x1="${cx(T[a])}" y1="${cy(T[a])}" x2="${cx(T[b])}" y2="${cy(T[b])}" stroke="var(--line)" stroke-width="5" stroke-linecap="round"/>`;}));
  let arrows='';
  if(choices)arrows=choices.map(to=>arrow(p.pos,to,true)).join('');
  else if(phase==='roll'){const o=MAP.options(p.pos,p.prev,true);if(o.length>1)arrows=o.map(to=>arrow(p.pos,to,false)).join('');}
  if(!$('#bd svg'))$('#bd').innerHTML=`<svg viewBox="0 0 ${VW} ${VH}"><g id="gl"></g><g id="gk"></g><g id="ga"></g></svg><div id="cb"></div>`;
  $('#gl').innerHTML=lines+T.map(tileSvg).join('');$('#ga').innerHTML=arrows;$('#cb').innerHTML=cardBox();updateTokens();

  const trading=(phase==='act'||(phase==='move'&&extraOn))&&!need&&((t.type==='stock'&&!upUsed)||extraOn);
  let act='';
  if(phase==='over'){
    const ord=[winner,...P.map((_,i)=>i).filter(i=>i!==winner).sort((a,b)=>assets(b)-assets(a))];
    act='<b>遊戲結束</b><br>'+ord.map((i,k)=>`${k+1}. <b style="color:${C[i]}">${pn(i)}</b> ${money(assets(i))}${k===0?' 🏆':''}`).join('<br>');
  }
  else if(choices)act=`<div class="hint">請點選箭頭決定方向（剩 ${left} 步）</div>`;
  else if(phase==='move')act=extraOn?`<div class="hint">先進行股票交易（還剩 ${left} 步）</div><button class="big" onclick="closeExtra()">結束股市交易，繼續前進</button>`:`<div>移動中…剩 ${left} 步</div>`;
  else if(phase==='roll')act=`<button class="big" onclick="roll()" ${busy?'disabled':''}>擲骰</button>`;
  else{
    const own=t.type==='land'?owner[t.id]:undefined,LV=MAP.LEVELS;
    if(t.type==='land'&&own===undefined)act+=`<button class="big" onclick="buyLand()">買地 ${money(t.price)}</button>`;
    else if(t.type==='land'&&own===turn){
      const l=lv[t.id]||0;
      act+=l>=5?(()=>{const ls=lands(turn).filter(x=>(lv[x.id]||0)<5&&x.id!==justBought&&!upIds.includes(x.id));return upFull()?'<div>S 級地：本回合已升級兩塊地</div>':ls.length?`<div class="hint">自己的 S 級地：可選擇兩塊持有的地各升級一級（還可升級 ${upCap()-upUsed} 塊）</div>`+ls.map(x=>`<button onclick="upgradeAt(${x.id})">${x.name} ${LV[lv[x.id]||0]}→${LV[(lv[x.id]||0)+1]} ${money(upOf(x))}</button>`).join(''):'<div>已是最高級 S（商業區），沒有其他可升級的土地</div>';})():justBought===t.id?'<div>剛買下，下次再踩到才能升級</div>':upFull()?'<div>本回合已升級過</div>':`<button class="big" onclick="upgradeAt(${t.id})">升級 ${LV[l]}→${LV[l+1]}（${MAP.LEVEL_NAMES[l+1]}）${money(upOf(t))}</button>`;
    }else if(t.type==='land')act+=(lv[t.id]||0)>MAP.BUYOUT_MAX_LV?`<div>此地為 ${LV[lv[t.id]||0]} 級，只有 E 級土地可被強制併購</div>`:`<button class="big" onclick="buyout()">強制併購 ${money(MAP.BUYOUT_MULT*t.price)}</button><div style="font-size:12px">原價×${MAP.BUYOUT_MULT}，付給${pn(own)}（僅限 E 級）</div>`;
    if(t.type==='gem')act+=flipUsed?'<div>本回合已翻牌</div>':'<div class="hint">請在地圖下方的翻牌區點選一個數字</div>';
    if(t.type==='start'){
      const ls=lands(turn).filter(x=>(lv[x.id]||0)<5);
      act+=upFull()?'<div>本回合已升級過</div>':ls.length?'<div>起點：可升級一塊地</div>'+ls.map(x=>`<button onclick="upgradeAt(${x.id})">${x.name} ${LV[lv[x.id]||0]}→${LV[(lv[x.id]||0)+1]} ${money(upOf(x))}</button>`).join(''):'<div>沒有可升級的土地</div>';
    }
    if(t.type==='stock'){
      const ls=lands(turn).filter(x=>(lv[x.id]||0)<5&&x.id!==justBought);
      act+=upUsed?'<div>本回合已升級過（本次不能買賣股票）</div>':!noTrade()?'<div>已買賣股票，本次不能升級土地</div>':ls.length?'<div class="hint">不買賣股票時，可改為升級一處土地（升級後本次不能買賣股票）</div>'+ls.map(x=>`<button onclick="upgradeAt(${x.id})">${x.name} ${LV[lv[x.id]||0]}→${LV[(lv[x.id]||0)+1]} ${money(upOf(x))}</button>`).join(''):'';
    }
    if(trading)act+='<div class="hint">可於下方交易股票</div>';
    if(extraOn)act+='<button onclick="closeExtra()">結束股市交易</button>';
    act+=`<button onclick="endTurn()">結束回合</button>`;
  }
  if(ROLL_SEEN===null||rollSeq<ROLL_SEEN)ROLL_SEEN=rollSeq;
  else if(rollSeq>ROLL_SEEN){ROLL_SEEN=rollSeq;ROLL_UNTIL=Date.now()+1500;rollFx();}
  const rl=ROLL_UNTIL-Date.now(),dz=rl>0?`<span class="dz" id="dz" style="animation-delay:-${((1500-rl)/1000).toFixed(2)}s">${DICE_FACES[Math.random()*6|0]}</span>`:'';
  const head=`<div class="box">輪到：<b style="color:${C[turn]}">${pnA(turn)}</b>　<span class="dice">🎲 ${dice||'-'}</span>${dz}<br>${act}</div>`;
  const gemTxt=q=>MAP.GEM_KEYS.map(k=>`<span style="color:${q.gems[k]?MAP.GEMS[k].color:'#999'};font-weight:${q.gems[k]?700:400}">◆${MAP.GEMS[k].name}</span>`).join(' ')+(q.shield?` 🛡×${q.shield}`:'');
  const pls=P.map((q,i)=>{const A=assets(i),hi=A>=MAP.WIN_ASSETS;return `<div class="box pl${i===turn?' on':''}" style="border-left-color:${C[i]};${q.alive?'':'opacity:.45'}"><img class="pp" src="${picUrl(i)}" alt="${MAP.PIC_NAMES[PIC[i]]||''}"><b>${pnA(i)}</b>${i===ME?'（你）':''}${q.alive?'':'（出局）'}　Lv.${q.level}｜${nm(q.pos)}｜來向：${nm(q.prev)}<br>現金 ${money(q.cash)}｜總資產 ${hi?`<span style="background:#333;color:#ffd21f;font-weight:700;padding:0 5px;border-radius:4px">${money(A)}</span>`:money(A)}<br>${gemTxt(q)}<br>地：${lands(i).map(x=>x.name+'(<b style="color:'+LVC[lv[x.id]||0]+'">'+MAP.LEVELS[lv[x.id]||0]+'</b>)').join('、')||'無'}${hi&&phase!=='over'&&i===turn?'<br><b style="color:#d9a900">已達 '+money(MAP.WIN_ASSETS)+'，經過或停留起點即獲勝</b>':''}${tradeBtn(i)}</div>`}).join('');
  const stk=`<div class="box"><b>股市</b>（每區每人持股上限 ${MAXH} 股，單次買賣上限 ${MAXT} 股；股價隨買賣、升級、過路費波動）<table><tr><th>區域</th><th>股價</th><th>費×</th>${P.map((_,i)=>`<th style="color:${C[i]}">P${i+1}</th>`).join('')}</tr>`+
    RK.map(r=>`<tr><td><span class="sw" style="background:${MAP.REGIONS[r].color};border:1px solid #888"></span>${RK.indexOf(r)+1}區 ${RN(r)}</td><td><b>${stock[r]}</b>${chgTxt(r)}</td><td>${((tollMod[r]||1)*(monoOwner(r)>=0?1.2:1)).toFixed(2)}</td>${P.map((q,i)=>`<td${trading&&i===turn?' style="background:var(--accent);color:#222;font-weight:700"':''}>${q.st[r]}</td>`).join('')}</tr>`).join('')+`</table>`+
    (trading?'<hr>'+RK.map(r=>traded[r]?`<div>${RN(r)} 🔒 本次已交易，暫時關閉</div>`:`<div>${RN(r)} <span style="background:var(--accent);color:#222;font-weight:700;padding:1px 7px;border-radius:10px">持有 ${P[turn].st[r]}</span> <input type="number" min="1" max="99" value="${qty[r]}" oninput="setQty('${r}',this.value)">
      <button onclick="trade('${r}',1)">買</button><button onclick="trade('${r}',-1)">賣</button><button onclick="qty['${r}']=99;render()">99</button><button onclick="maxBuy('${r}')">最大</button><div style="font-size:12px" id="c_${r}">${costTxt(r)}</div></div>`).join('')+'<div style="font-size:12px">每區每次停留只能交易一次（買或賣擇一）</div>':'')+`</div>`;
  const ctl=`<div class="box">玩家數 <select onchange="np=+this.value;reset()">${[1,2,3,4].map(n=>`<option ${n===np?'selected':''}>${n}</option>`).join('')}</select>
    指定點數（測試） <select onchange="force=this.value">${['0','1','2','3','4','5','6'].map(v=>`<option value="${v}" ${v===force?'selected':''}>${v==='0'?'隨機':v}</option>`).join('')}</select>
    <button onclick="reset()">重來</button></div>`;
  $('#sd').innerHTML=head+(phase==='over'?histChart():'')+pls+stk+`<div class="lrow"><div class="box" id="log">${logs.join('<br>')}</div><div class="box" id="mini">${miniSvg()}</div></div>`;
  mfxPlay();
  $('#md').innerHTML=alloc?allocModal():ask?askModal():need?modal():offer?offerModal():tradeUI?composeModal():'';
}
const CARDS=buildCards();
