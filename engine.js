let NAMES=[],PIC=[],ME=-1;
const picUrl=i=>`/img/p${PIC[i]!==undefined?PIC[i]:i}.png?v=${MAP.PIC_VER}`;const LVC=['#8e44ad','#2e86de','#27ae60','#f1c40f','#f08a00','#e0262d']; // E→S：紫、藍、綠、黃、橙、紅
let extraOn=false,pendingTrade=false,resumeMove=false;
let mfx=[],mfxSeq=0,MFX_SEEN=null; // 玩家間金錢異動（動畫用）：{id,i,a}
let mono={},monoLvDone={};   // 各區目前的獨佔者、是否已發過升級獎勵
let auc=null,offer=null,offerN=0,tradeUI=null,hist=[],shist=[],cardShow=null,RULES={tw:0,div:0,aid:0,imp:0,kline:0,tax:0,chest:0,skull:0},kl=[],kc=null,pot=0,aidPot=0,chest=-1,skull=-1,roundNo=1,inRound=false;   // cardShow：翻開、等玩家按確認才執行的牌 {s,c,by,n,a,b}
   // 玩家間交易、每回合總資產紀錄
const histNow=()=>P.map((_,i)=>assets(i));
const mfxAdd=(i,a)=>{if(!a)return;mfx.push({id:++mfxSeq,i,a});if(mfx.length>8)mfx.shift();};
const monoOwner=r=>{const ls=T.filter(t=>t.type==='land'&&t.region===r),o=owner[ls[0].id];return o!==undefined&&ls.every(t=>owner[t.id]===o)?o:-1;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let AWAY=[];
const pn=i=>NAMES[i]?esc(NAMES[i]):'玩家'+(i+1);          // 玩家 ID（沒有 ID 時退回編號）
const pnA=i=>pn(i)+(AWAY[i]?'（AI代打）':'');

let C=MAP.PALETTE.map(p=>p.c);   // 各玩家代表色（連線時由房間內的選色覆蓋）
const ink=()=>'#fff'; // 代表色色塊上的文字一律白色
let VW=0,VH=0;   // 棋盤畫面大小：依目前地圖由 relayout() 算出
const SX=108,SY=94,W=100,H=80,PAD=10;
const cx=t=>PAD+W/2+(t.x-MAP.B.x0)*SX, cy=t=>PAD+H/2+(MAP.B.y1-t.y)*SY;   // 座標 → 畫面位置（依地圖範圍置中）
const T=MAP.TILES, RK=Object.keys(MAP.REGIONS), RN=r=>MAP.REGIONS[r].name, IM=MAP.IMPACT, $=s=>document.querySelector(s);
const START_CASH=40000, MAXH=999, money=n=>n.toLocaleString('en-US');
let P,owner,lv,inv,chg,winner,base,tollMod,landMod,traded,ask,alloc,sf,deck,upUsed,upIds,flipUsed,justBought,lastCard,stock,turn,phase,left,dice,rollSeq=0,first,choices,busy,logs,need,qty,np=2,force='0',lotto,lottoUsed=false,landSeq=0,LSEL=[],LSKIP=-1,LSEL_SEQ=-1;   // lotto：樂透狀態；lottoUsed：本回合已買過；landSeq：每次停下 +1（用來判斷是不是新的一次停留）；LSEL／LSKIP／LSEL_SEQ 只存在自己的畫面（選號中的號碼、已按「不買了」）

function reset(){
  applyLocale();
  P=Array.from({length:np},()=>({pos:0,prev:null,cash:START_CASH,alive:true,gems:{},level:1,st:Object.fromEntries(RK.map(r=>[r,0]))}));
  owner={};lv={};inv={};mono={};monoLvDone={};winner=-1;chg=Object.fromEntries(RK.map(r=>[r,0]));stock=Object.fromEntries(RK.map(r=>[r,150+(Math.random()*151|0)]));
  qty=Object.fromEntries(RK.map(r=>[r,1]));sf={...stock};base={...stock};tollMod={};landMod={};traded={};ask=null;alloc=null;cardShow=null;upUsed=0;upIds=[];flipUsed=false;justBought=-1;lastCard='';newDeck();
  turn=0;phase='roll';left=0;dice=0;rollSeq=0;first=true;choices=null;busy=false;need=null;extraOn=false;pendingTrade=false;resumeMove=false;mfx=[];mfxSeq=0;
  logs=['遊戲開始，每人現金 '+money(START_CASH)+'。'];hist=[histNow()];shist=[{...stock}];kl=[];pot=0;aidPot=0;chest=-1;skull=-1;roundNo=1;inRound=false;kOpen();if(RULES.skull)moveSkull();offer=null;offerN=0;tradeUI=null;auc=null;lotto={pot:LOTTO_BASE,period:1,nums:{},last:null};lottoUsed=false;landSeq=0;LSEL=[];LSKIP=-1;render();
}
const nm=id=>id==null?'—':T[id].name;
const log=s=>{logs.unshift(s);if(logs.length>40)logs.pop();};
const lands=i=>T.filter(t=>owner[t.id]===i);
const stockVal=i=>RK.reduce((s,r)=>s+P[i].st[r]*stock[r],0);
const landVal=t=>t.price+(inv[t.id]||0);
const assets=i=>P[i].cash+stockVal(i)+lands(i).reduce((s,t)=>s+landVal(t),0);
const tollOf=t=>Math.max(10,Math.round(MAP.tollOf(t,lv[t.id]||0,stock[t.region])*(tollMod[t.region]||1)*(landMod[t.id]||1)*(monoOwner(t.region)>=0?1.2:1)/10)*10);
const tollMulOf=r=>((tollMod[r]||1)*(monoOwner(r)>=0?1.2:1)).toFixed(2);   // 該區過路費倍率（卡牌調整×獨佔 1.2）
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
  if(left>0)claimChest(turn,true);   // 寶箱：「經過」（還沒走完）領 30%
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
  phase='act';landSeq++;
  claimChest(turn);hitSkull(turn);   // 骷髏：停在骷髏格 → 該區股價下跌後換位置；
  // 特殊規則二：停在寶箱格就領取彩池（走路停下、傳送、交換位置都會經過這裡）
  if(t.type==='land'&&owner[t.id]!==undefined&&owner[t.id]!==turn){
    if(resting(owner[t.id]))log(`💤 ${pn(owner[t.id])} 正在休息，${pn(turn)} 踩到 ${t.name} 免付過路費`);
    else if(p.shield>0){p.shield--;log('護身符生效，免付過路費');}
    else{const amt=tollOf(t),o=owner[t.id];if(pay(turn,o,amt,'過路費',()=>{bump(t.region,IM.toll);if(RULES.div)payDiv(t,o,amt);})===false)return;}
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
  RK.forEach(r=>p.st[r]=0);lands(i).forEach(t=>{delete owner[t.id];delete lv[t.id];delete inv[t.id];delete landMod[t.id];});monoSync();p.gems={};lottoRelease(i);
  log(`${pn(i)} 資產不足，破產出局`);
  if(P.filter(q=>q.alive).length<2){phase='over';winner=P.findIndex(q=>q.alive);hist.push(histNow());log(`${pn(winner)} 獲勝！`);render();}
  else if(!inRound)endTurn();
}
const mustFlip=()=>phase==='act'&&T[P[turn].pos].type==='gem'&&!flipUsed&&deck.some(d=>d.by<0);   // 停在寶石格、還有牌可翻、本回合還沒翻 → 不能結束回合
function endTurn(){
  if(phase==='over'||need||ask||alloc||cardShow||extraOn||offer)return;
  if(P[turn].alive&&mustFlip())return;   // 破產出局時不受限
  const old=turn;let nt=old;do{nt=(nt+1)%np;}while(!P[nt].alive);
  if(nt<=old){   // 繞完一圈（每位玩家都行動過）：結算本輪
    roundEnd();if(phase==='over')return;
    nt=old;do{nt=(nt+1)%np;}while(!P[nt].alive);
  }
  turn=nt;kTouch();
  upUsed=0;upIds=[];flipUsed=false;justBought=-1;traded={};extraOn=false;offerN=0;lottoUsed=false;LSEL=[];
  if(turn<=old)hist.push(histNow());   // 繞完一圈（每位玩家都行動過）：記錄各人總資產
  if(deck.every(d=>d.by>=0)){newDeck();log('49 張牌已翻完，重新洗牌');}
  phase='roll';first=true;shist.push({...stock});render();   // 每位玩家結束回合時記錄一次股價（股市折線圖用）
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
  kTouch();
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
const setPrice=(r,v)=>{const o=stock[r];sf[r]=Math.max(50,v);stock[r]=Math.round(sf[r]);if(stock[r]!==o)chg[r]=stock[r]-o;log(`${RN(r)}股價 ${o}→${stock[r]}`);kTouch();};
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
  add('選擇一塊自己持有的E級土地連升兩級',i=>pickTile('哪一塊自己的 E 級土地連升兩級（E→C）？',lands(i).filter(t=>(lv[t.id]||0)===0),id=>{lv[id]=2;log(`${pn(i)} 的 ${nm(id)} 由 E 級連升兩級為 C 級`);}));
  add('選擇場上一塊被持有的土地下降一級（E級不能選）',i=>askBox('哪一塊被持有的土地下降一級？（E 級不能選）',T.filter(t=>t.type==='land'&&owner[t.id]!==undefined&&(lv[t.id]||0)>=1).map(t=>({label:`${MAP.LEVELS[lv[t.id]||0]}級 ${t.name}（${RN(t.region)}，${pn(owner[t.id])}）`,fn:()=>{const l=lv[t.id]||0;lv[t.id]=l-1;log(`${nm(t.id)}（${pn(owner[t.id])}）由 ${MAP.LEVELS[l]} 級降為 ${MAP.LEVELS[l-1]} 級`);}}))));
  add('指定傳送至任一土地格',i=>pickTile('傳送到哪塊土地？',T.filter(t=>t.type==='land'),id=>teleport(i,id)));
  add('返回起點',i=>teleport(i,0));
  RK.forEach((r,k)=>add(`獲得${k+1}區股票10張`,i=>addSt(i,r,10)));
  add('隨機獲得某區股票10張',i=>addSt(i,rnd(RK),10));
  add('隨機獲得某區股票20張',i=>addSt(i,rnd(RK),20));
  add('所有人來到此寶石格',i=>{others(i).forEach(o=>{P[o].pos=P[i].pos;P[o].prev=teleportPrev(P[i].pos);});log('所有人來到此寶石格');});
  add('所有股價隨機波動±15%，每區單獨計算',()=>RK.forEach(r=>{const p=(Math.random()*30-15)/100;bump(r,p);log(`${RN(r)}股價隨機波動 ${p>=0?'+':''}${(p*100).toFixed(1)}%`);}));
  add('指定一區域股票上升10%',()=>pickR('哪一區股價上升 10%？',r=>bump(r,.1)));
  add('指定一區域股票下降10%',()=>pickR('哪一區股價下降 10%？',r=>bump(r,-.1)));
  add('選擇一區域平分總股票數量',i=>pickR('選一區域，所有玩家平分該區股票',r=>{
    const al=alive(),tot=al.reduce((s,j)=>s+P[j].st[r],0),each=Math.floor(tot/al.length),rem=tot-each*al.length;
    al.forEach(j=>{P[j].st[r]=Math.min(MAXH,each);});P[i].st[r]=Math.min(MAXH,each+rem);log(`${RN(r)}股票 ${tot} 張平分，每人 ${each} 張（餘 ${rem} 張給翻牌者）`);}));
  add('所有人回到起點',i=>{others(i).forEach(o=>{P[o].pos=0;P[o].prev=MAP.ADJ[0][0];});log('所有人回到起點');teleport(i,0);});
  add('指定一區域股價與最高區域股價相同',()=>pickR('哪一區股價調成與最高區相同？',r=>setPrice(r,Math.max(...RK.map(x=>stock[x])))));
  add('玩家等級+1',i=>{P[i].level++;log(`${pn(i)} 升為 Lv.${P[i].level}`);});
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
  if(phase!=='act'||need||ask||alloc||cardShow||flipUsed||T[p.pos].type!=='gem'||deck[s].by>=0)return;
  const i=turn,cd=CARDS[deck[s].c];
  deck[s].by=i;flipUsed=true;
  lastCard=`#${s+1} ${pn(i)} 翻到：${cd.name}`;log(lastCard);
  const row=Math.floor(s/7)*7;let a=s,b=s;
  while(a>row&&deck[a-1].by===i)a--;
  while(b<row+6&&deck[b+1].by===i)b++;
  cardShow={s,c:deck[s].c,by:i,n:b-a+1,a,b};   // 先顯示圖案與效果，等玩家按「確認」才真正執行
  render();
}
function cardOk(){
  if(!cardShow)return;
  const {c,by:i,n,a,b}=cardShow;cardShow=null;
  if(n>=2){P[i].cash+=100*n;log(`橫向連線 ${n} 張（#${a+1}~#${b+1}），獎金 ${100*n}`);}
  CARDS[c].fn(i);
  render();
}

/* ---------- 卡牌圖案：依效果分類畫成圖示，底色依類型（金錢＝金、股票＝藍、過路費／土地＝橘綠、移動＝紫、寶石＝粉） ---------- */
const CKIND=[[/前進一格/,'forward'],[/玩家等級/,'level'],[/所有人的現金相加/,'split'],[/所有人現金增加/,'coin'],[/擲骰點數/,'dice'],
  [/寶石/,'gem'],[/交換位置/,'swap'],[/傳送|返回起點|回到起點/,'portal'],[/平分總股票|隨意分配/,'split'],[/拋售|販賣/,'sell'],[/額外獲得一次股市/,'trade'],
  [/升為|全部升一級|連升兩級|下降一級/,'build'],[/過路費/,'toll'],[/回歸原始值/,'reset'],[/上升|下降|翻倍|減半|相同|波動/,'chart'],[/股票.*張/,'stock']];
const CHUE={forward:'#7b5cd6',portal:'#7b5cd6',swap:'#7b5cd6',level:'#d9a100',coin:'#d9a100',dice:'#d9a100',split:'#d9a100',gem:'#d6457f',sell:'#2f6fdb',trade:'#2f6fdb',chart:'#2f6fdb',reset:'#2f6fdb',stock:'#2f6fdb',toll:'#e0762a',build:'#2e9d4f'};
function cardBadge(n){
  let m;
  if(m=n.match(/\*(\d+)元/))return '×'+m[1];
  if(m=n.match(/(\d+)張/))return '+'+m[1];
  if(m=n.match(/(上升|提升|增加)(\d+)%/))return '+'+m[2]+'%';
  if(m=n.match(/(下降|減少)(\d+)%/))return '−'+m[2]+'%';
  if(/連升兩級/.test(n))return '+2級';if(/下降一級/.test(n))return '−1級';if(/波動/.test(n))return '±15%';if(/玩家等級/.test(n))return 'Lv+1';
  if(/翻倍/.test(n))return '×2';if(/減半/.test(n))return '×½';if(/五倍/.test(n))return '×5';if(/兩倍/.test(n))return '×2';
  if(m=n.match(/(\d+)元/))return m[1];
  if(/相同/.test(n))return '＝最高';
  return '';
}
function cardArt(idx){
  const nm=CARDS[idx].name,k=(CKIND.find(x=>x[0].test(nm))||[0,'coin'])[1],hue=CHUE[k]||'#7b5cd6',bd=cardBadge(nm);
  const W_='#fff',S=w=>`stroke="${W_}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`,fl=`fill="${W_}"`;
  const coin=(x,y,r,t)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd54a" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y+r*.36}" font-size="${r*1.05}" font-weight="800" text-anchor="middle" fill="#a97800">${t||'$'}</text>`;
  const up=/上升|提升|增加|翻倍|相同/.test(nm)&&!/下降|減半/.test(nm);
  const reg=(nm.match(/獲得(\d)區/)||[])[1];
  let g='';
  switch(k){
    case 'forward':g=`<path d="M22 60h60M62 38l24 22-24 22" ${S(7)}/><circle cx="28" cy="84" r="5" ${fl}/><circle cx="46" cy="90" r="5" ${fl}/>`;break;
    case 'level':g=`<path d="M60 24l10 22 24 3-18 16 5 24-21-12-21 12 5-24-18-16 24-3z" ${fl}/><path d="M60 100V82M52 90l8-8 8 8" ${S(5)}/>`;break;
    case 'give':g=coin(42,58,24)+`<path d="M74 44l24 0M74 60h28M74 76h24" ${S(5)}/>`+`<path d="M92 36l10 8-10 8M96 52l8 8-8 8" ${S(4)}/>`;break;
    case 'take':g=coin(78,58,24)+`<path d="M46 44h-24M46 60h-28M46 76h-24" ${S(5)}/><path d="M38 36l10 8-10 8" ${S(4)}/>`;break;
    case 'coin':g=coin(60,58,32)+`<text x="60" y="104" font-size="16" font-weight="800" text-anchor="middle" ${fl}>＋＋</text>`;break;
    case 'dice':g=`<rect x="26" y="26" width="68" height="68" rx="14" ${fl}/>`+[[44,44],[76,44],[60,60],[44,76],[76,76]].map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="6.5" fill="${hue}"/>`).join('');break;
    case 'split':g=`<circle cx="60" cy="60" r="34" ${fl}/><path d="M60 60V26M60 60l30 17M60 60L30 77" stroke="${hue}" stroke-width="5"/>`;break;
    case 'gem':g=`<polygon points="36,42 84,42 100,60 60,100 20,60" ${fl}/><path d="M20 60h80M36 42l24 58 24-58M48 42l12 18 12-18" stroke="${hue}" stroke-width="3.5" fill="none" stroke-linejoin="round"/>`;break;
    case 'swap':g=`<circle cx="30" cy="62" r="13" ${fl}/><circle cx="90" cy="62" r="13" ${fl}/><path d="M36 38q24-20 48 0M76 30l10 8-12 4M84 86q-24 20-48 0M44 94l-10-8 12-4" ${S(5)}/>`;break;
    case 'portal':g=`<ellipse cx="60" cy="60" rx="38" ry="38" ${S(5)}/><ellipse cx="60" cy="60" rx="26" ry="26" ${S(5)} opacity=".8"/><ellipse cx="60" cy="60" rx="14" ry="14" ${S(5)} opacity=".6"/><circle cx="60" cy="60" r="5" ${fl}/>`;break;
    case 'sell':g=`<path d="M24 28h40l32 32-36 36-36-36z" ${fl}/><circle cx="42" cy="46" r="6" fill="${hue}"/><text x="66" y="72" font-size="26" font-weight="800" text-anchor="middle" fill="${hue}">$</text>`;break;
    case 'trade':g=[[28,52,18],[52,40,30],[76,58,16]].map(c=>`<path d="M${c[0]+6} ${c[1]-8}v${c[2]+16}" stroke="#fff" stroke-width="3"/><rect x="${c[0]-2}" y="${c[1]}" width="16" height="${c[2]}" rx="2" ${fl}/>`).join('')+`<path d="M92 40a18 18 0 1 1-6 22M92 28v14h-14" ${S(5)}/>`;break;
    case 'build':g=/下降一級/.test(nm)?`<rect x="22" y="26" width="22" height="72" ${fl}/><rect x="49" y="46" width="22" height="52" ${fl}/><rect x="76" y="64" width="22" height="34" ${fl}/><path d="M24 30l18 18M42 48v-12M42 48h-12" ${S(4)}/>`:`<rect x="22" y="64" width="22" height="34" ${fl}/><rect x="49" y="46" width="22" height="52" ${fl}/><rect x="76" y="26" width="22" height="72" ${fl}/><path d="M24 50l18-18M42 32v12M42 32h-12" ${S(4)}/>`;break;
    case 'toll':g=`<path d="M60 22L22 54h12v40h52V54h12z" ${fl}/><rect x="52" y="66" width="16" height="28" fill="${hue}"/>`+coin(88,40,16);break;
    case 'reset':g=`<path d="M92 56a32 32 0 1 0-8 24M92 36v22H70" ${S(6)}/><path d="M42 70l12-14 10 8 14-18" ${S(5)}/>`;break;
    case 'chart':g=`<path d="M20 90V26M20 90h84" stroke="#fff" stroke-width="4" opacity=".7"/>`+(/波動/.test(nm)?`<path d="M26 60l16-24 16 40 16-40 16 24" ${S(7)}/>`:/相同/.test(nm)?`<path d="M26 56h68" ${S(7)} stroke-dasharray="8 8"/><path d="M26 82l20-14 16 8 30-34" ${S(7)}/>`:up?`<path d="M26 84l22-18 16 10 32-40M78 36h16v16" ${S(7)}/>`:`<path d="M26 36l22 18 16-10 32 40M78 84h16V68" ${S(7)}/>`);break;
    case 'stock':{const cols=reg?[RCOL[RK[reg-1]]]:/所有區域/.test(nm)?RK.map(r=>RCOL[r]):/某區/.test(nm)?['#e53935','#1e88e5','#2e9d4f']:[hue];
      g=`<rect x="22" y="26" width="76" height="68" rx="8" ${fl}/>`+cols.map((c,j)=>`<rect x="22" y="${26+j*(68/cols.length)}" width="76" height="${68/cols.length}" fill="${c}" opacity=".9"/>`).join('')+`<path d="M34 54h52M34 66h40M34 78h46" stroke="#fff" stroke-width="4" opacity=".85" stroke-linecap="round"/><rect x="22" y="26" width="76" height="68" rx="8" fill="none" stroke="#fff" stroke-width="4"/>`;break;}
  }
  const bdg=bd?`<rect x="62" y="84" width="52" height="28" rx="14" fill="#fff" stroke="${hue}" stroke-width="3"/><text x="88" y="104" font-size="${bd.length>4?12:16}" font-weight="800" text-anchor="middle" fill="${hue}">${bd}</text>`:'';
  return `<svg viewBox="0 0 120 120" class="cart"><defs><linearGradient id="cg${idx}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hue}" stop-opacity=".78"/><stop offset="1" stop-color="${hue}"/></linearGradient></defs><rect x="2" y="2" width="116" height="116" rx="18" fill="url(#cg${idx})" stroke="#fff" stroke-opacity=".6" stroke-width="2"/><circle cx="60" cy="60" r="50" fill="#fff" opacity=".1"/>${g}${bdg}</svg>`;
}
function cardModal(){
  const cd=CARDS[cardShow.c],mine=ME<0||ME===cardShow.by,nm=cd.name;
  const hint=/隨機/.test(nm)?'🎲 對象由系統隨機決定':/指定|選擇|任一|某|隨意分配/.test(nm)?'👆 確認後由你選擇目標':'';
  return `<div class="md"><div class="box cardm"><div class="cnum">#${cardShow.s+1}　<b style="color:${C[cardShow.by]}">${pn(cardShow.by)}</b> 翻到</div>${cardArt(cardShow.c)}<div class="ceff">${nm}</div>${hint?`<div class="csub">${hint}</div>`:''}${cardShow.n>=2?`<div class="csub">橫向連線 ${cardShow.n} 張，確認後可得獎金 ${100*cardShow.n}</div>`:''}${mine?'<button class="big" onclick="cardOk()">確認，執行效果</button>':`<div class="csub">等待 ${pn(cardShow.by)} 確認…</div>`}</div></div>`;
}
let CARD_OPEN=false;   // 翻牌區平常收起；玩家自己按「查看翻牌區」才展開（只影響自己的畫面）
const toggleCards=()=>{CARD_OPEN=!CARD_OPEN;render();};
let FLIP_SHOWN=false;   // 翻牌區蓋上地圖時，只自動捲到地圖一次
function cardCells(can){return deck.map((d,k)=>d.by<0?`<div class="cd${can?' can':''}" ${can?`onclick="flipAt(${k})"`:''}>${k+1}</div>`:`<div class="cd on" style="background:${C[d.by]};color:${ink(C[d.by])}" title="${CARDS[d.c].name}">${k+1}<small>P${d.by+1}</small></div>`).join('');}
function cardBox(){
  const p=P[turn],can=phase==='act'&&!need&&!ask&&!alloc&&!cardShow&&!flipUsed&&T[p.pos].type==='gem';
  if(can&&(ME<0||ME===turn))   // 輪到自己翻牌：翻牌區直接蓋在地圖上，不必另外往下捲
    return `<div class="cov"><div class="box"><b>翻牌</b>　<span class="hint">請點選一張牌（翻牌後才能結束回合）</span><div class="cg">${cardCells(true)}</div><div style="margin-top:6px;font-size:12px">橫向連線（同一排）每多一張，獎金多 100</div></div></div>`;
  if(!can&&!CARD_OPEN)return `<div style="margin:8px 6px 0 0;display:inline-block"><button class="nw" onclick="toggleCards()">查看翻牌區</button></div>`;
  return `<div class="box" style="margin-top:8px"><b>翻牌區</b>${can?'':' <button class="nw" onclick="toggleCards()" style="margin:0 0 0 6px;padding:2px 10px">收起</button>'}（${can?'<span class="hint">等待'+pn(turn)+'翻牌</span>':'停在寶石格可自選一張牌翻開；橫向連線每張 +100'}）<div class="cg">${cardCells(false)}</div>${lastCard?`<div style="margin-top:4px">${lastCard}</div>`:''}</div>`;
}


/* ---------- 棋盤大小；股價圖與持有數改放右下角資訊區（#mini，可切換），不再畫在地圖裡 ---------- */
// 依目前地圖算出畫面大小。換地圖時（瀏覽器端）要再呼叫一次。
function relayout(){const B=MAP.B;VW=PAD*2+W+(B.x1-B.x0)*SX;VH=PAD*2+H+(B.y1-B.y0)*SY;}
relayout();
const MINI_H=110;   // ★ 股價／持有數框的內容高度（像素）。要調高低只改這個數字；寬度跟著框的實際寬度，文字與間距會依高度（以 90 為基準）等比例縮放
const miniW=()=>{const el=typeof document!=='undefined'&&document.getElementById&&document.getElementById('mini');return el&&el.clientWidth>200?el.clientWidth-8:480;};
const IP={get stock(){return{x:0,y:0,w:miniW(),h:MINI_H};},get hold(){return{x:0,y:0,w:miniW(),h:MINI_H};}};
let KSEL='idx';const setK=k=>{KSEL=k;render();};
let RSHOW={};   // 折線圖要顯示哪幾區（只影響自己的畫面；預設全顯示）
const rOn=r=>RSHOW[r]!==false;
const toggleR=r=>{if(rOn(r)&&RK.filter(rOn).length<=1)return;RSHOW[r]=!rOn(r);render();};
const allR=()=>{RSHOW={};render();};
const RCOL={africa:'#c98a00',oceania:'#1e88e5',asia:'#e53935',america:'#2e9d4f',europe:'#8e44ad'};
const panelBg=(p,title)=>`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="var(--panel)" stroke="var(--bd)" stroke-width="1.5" opacity=".96"/>${title?`<text x="${p.x+10}" y="${p.y+16}" font-size="13" font-weight="700" fill="var(--fg)">${title}</text>`:''}`;

function chestSvg(){
  if(!RULES.chest||chest<0||pot<=0)return '';
  const t=T[chest],x=cx(t),y=cy(t);
  // 外層 <g> 只負責定位（transform 屬性）；內層 .chest 才套 CSS 浮動動畫，兩者不會互相覆蓋
  const ring=`<rect x="${-W/2-4}" y="${-H/2-4}" width="${W+8}" height="${H+8}" rx="13" fill="none" stroke="#ffd54a" stroke-width="4" stroke-dasharray="9 6" class="chestring"/>`;   // 把寶箱所在的那一格框起來
  return `<g transform="translate(${x},${y})" style="pointer-events:none">${ring}<g class="chest"><circle r="34" fill="#ffd54a" opacity=".28"/><ellipse cx="0" cy="22" rx="26" ry="5" fill="#000" opacity=".25"/><rect x="-24" y="-4" width="48" height="26" rx="4" fill="#8a5a2b" stroke="#4a2f12" stroke-width="2"/><path d="M-24 -4v-8a24 16 0 0 1 48 0v8z" fill="#b07a36" stroke="#4a2f12" stroke-width="2"/><rect x="-24" y="2" width="48" height="5" fill="#ffd54a" opacity=".9"/><rect x="-4" y="-14" width="8" height="30" fill="#ffd54a" opacity=".9"/><circle cx="0" cy="8" r="5" fill="#fff3b0" stroke="#4a2f12" stroke-width="1.5"/><g transform="translate(0,-30)"><rect x="-34" y="-11" width="68" height="20" rx="10" fill="#222" opacity=".88"/><text y="4" font-size="12" font-weight="800" text-anchor="middle" fill="#ffd54a">${money(pot)}</text></g></g></g>`;
}
/* ---------- 股價圖、K 線、持有數（寬 200 的精簡版，放在右下角資訊區） ---------- */
const pnS=(i,n)=>{const s=String(NAMES[i]||'玩家'+(i+1));return esc(s.length>n?s.slice(0,n-1)+'…':s);};   // 擠在小框裡用的短玩家名
function stockChartSvgC(p){
  const f=Math.min(1.5,p.h/90);   // 左邊折線圖、右邊兩欄圖例（可點選顯示／隱藏；第六格是「全部顯示」）；尺寸由 MINI_H 與框寬決定
  const all=(shist||[]).slice(-30).concat([{...stock}]),n=all.length,off=(shist||[]).length-(n-1);
  const R6=(p.h-4)/6,cols=R6>=17?1:2,LW=cols===1?136:114,L=p.x+30*f,Rr=p.x+p.w-cols*LW-14,Tp=p.y+6,Bt=p.y+p.h-16*f,vis=RK.filter(rOn),vals=all.flatMap(x=>vis.map(r=>x[r])),lo0=Math.min(...vals),hi0=Math.max(...vals),pad=Math.max(10,(hi0-lo0)*.1),lo=Math.max(0,Math.floor((lo0-pad)/10)*10),hi=Math.ceil((hi0+pad)/10)*10;
  const X=k=>n<2?L:L+(Rr-L)*k/(n-1),Y=v=>Tp+(Bt-Tp)*(1-(v-lo)/(hi-lo||1));
  let g=panelBg(p,'');
  for(let k=0;k<=2;k++){const v=lo+(hi-lo)*k/2;g+=`<line x1="${L}" x2="${Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-4}" y="${Y(v)+3*f}" font-size="${+(9*f).toFixed(1)}" text-anchor="end" fill="var(--fg)">${Math.round(v)}</text>`;}
  const step=Math.max(1,Math.ceil((n-1)/5));
  for(let k=0;k<n;k++)if(k===n-1||(k%step===0&&n-1-k>=step*.75))g+=`<text x="${X(k)}" y="${Bt+11*f}" font-size="${+(9*f).toFixed(1)}" text-anchor="middle" fill="var(--fg)">${k===n-1?'現':off+k}</text>`;
  g+=vis.map(r=>`<polyline points="${all.map((x,k)=>X(k).toFixed(1)+','+Y(x[r]).toFixed(1)).join(' ')}" fill="none" stroke="${RCOL[r]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(n-1)}" cy="${Y(stock[r])}" r="3" fill="${RCOL[r]}"/>`).join('');
  const prev=n>=2?all[n-2]:stock,rl=cols===1?R6:Math.min(24,(p.h-4)/3),lx=k=>p.x+p.w-cols*LW-4+(cols===1?0:(k&1)*LW),ly=k=>p.y+2+(cols===1?k:k>>1)*rl;
  g+=RK.map((r,k)=>{const d=stock[r]-prev[r],pc=base&&base[r]?Math.round((stock[r]/base[r]-1)*100):0,x=lx(k),y=ly(k),on=rOn(r);
    return `<g class="nw" onclick="toggleR('${r}')" style="cursor:pointer" opacity="${on?1:.4}"><rect x="${x}" y="${y}" width="${LW-4}" height="${rl-3}" rx="4" fill="${on?RCOL[r]:'none'}" fill-opacity=".13" stroke="${RCOL[r]}" stroke-width="1"/><circle cx="${x+8}" cy="${y+(rl-3)/2}" r="3.5" fill="${on?RCOL[r]:'none'}" stroke="${RCOL[r]}" stroke-width="1.5"/><text x="${x+15}" y="${y+(rl-3)/2+3.5*f}" font-size="${+(10*f).toFixed(1)}" fill="var(--fg)">${RN(r)} <tspan font-weight="700">${stock[r]}</tspan>${d?`<tspan fill="${d>0?'#e04b4b':'#2aa86a'}" font-size="${+(8.5*f).toFixed(1)}"> ${d>0?'▲':'▼'}${Math.abs(d)}</tspan>`:''}<tspan font-size="${+(8.5*f).toFixed(1)}" opacity=".7"> ${pc>=0?'+':''}${pc}%</tspan></text></g>`;}).join('');
  g+=`<text class="nw" onclick="allR()" x="${lx(5)+(LW-4)/2}" y="${ly(5)+(rl-3)/2+3.5*f}" font-size="${+(10*f).toFixed(1)}" text-anchor="middle" fill="var(--accent)" style="cursor:pointer">全部顯示</text>`;
  return g;
}
function klineSvgC(p){
  const f=Math.min(1.5,p.h/90);   // 左邊 K 線＋成交量、右邊一欄切換按鈕；尺寸由 MINI_H 與框寬決定
  const si=KSER.indexOf(KSEL),isI=KSEL==='idx',fm=v=>isI?v.toFixed(1):String(Math.round(v));
  const full=(kl||[]).map(r=>r[si]).concat(kc?[kc[si]]:[]),N=20,n=Math.min(N,full.length),off=full.length-n;
  let g=panelBg(p,'');
  const bh=Math.min(18,(p.h-4)/KSER.length-1);
  KSER.forEach((k,j)=>{const x=p.x+p.w-72,y=p.y+2+j*(bh+1),on=k===KSEL;g+=`<g class="nw" onclick="setK('${k}')" style="cursor:pointer"><rect x="${x}" y="${y}" width="66" height="${bh}" rx="${bh/2}" fill="${on?'var(--accent)':'none'}" stroke="${k==='idx'?'var(--fg)':RCOL[k]}" stroke-width="1.1"/><text x="${x+33}" y="${y+bh/2+3.5*f}" font-size="${+(10*f).toFixed(1)}" text-anchor="middle" fill="${on?'#222':'var(--fg)'}" font-weight="${on?700:400}">${k==='idx'?'指數':RN(k)}</text></g>`;});
  if(!n)return g+`<text x="${p.x+(p.w-80)/2}" y="${p.y+p.h/2+5}" text-anchor="middle" font-size="${+(12*f).toFixed(1)}" fill="var(--fg)">尚無資料</text>`;
  const cur=kc?kNow()[si]:null,cs=full.slice(off).map((c,j,a)=>j===a.length-1&&cur!=null?[c[0],Math.max(c[1],cur),Math.min(c[2],cur),cur,c[4]]:c);
  const L=p.x+34*f,Rr=p.x+p.w-82,Tp=p.y+16*f,Bt=p.y+p.h-28*f,Vt=p.y+p.h-26*f,Vb=p.y+p.h-12*f,step=(Rr-L)/N,bw=Math.max(3,step*.58);
  const lo0=Math.min(...cs.map(c=>c[2])),hi0=Math.max(...cs.map(c=>c[1])),pad=Math.max(isI?1:2,(hi0-lo0)*.08),lo=lo0-pad,hi=hi0+pad;
  const Y=v=>Tp+(Bt-Tp)*(1-(v-lo)/(hi-lo||1)),vmax=Math.max(1,...cs.map(c=>c[4])),X=j=>L+step*(j+.5);
  const last=cs[cs.length-1];
  g+=`<text x="${p.x+8}" y="${p.y+11*f}" font-size="${+(9.5*f).toFixed(1)}" fill="var(--fg)">${isI?'加權指數':RN(KSEL)}｜開${fm(last[0])} 高${fm(last[1])} 低${fm(last[2])} 收${fm(last[3])} 量${last[4]}</text>`;
  for(let k=0;k<=2;k++){const v=lo+(hi-lo)*k/2;g+=`<line x1="${L}" x2="${Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-4}" y="${Y(v)+3*f}" font-size="${+(9*f).toFixed(1)}" text-anchor="end" fill="var(--fg)">${fm(v)}</text>`;}
  g+=`<line x1="${L}" x2="${Rr}" y1="${Vb}" y2="${Vb}" stroke="var(--line)"/><text x="${L-4}" y="${Vb}" font-size="${+(9*f).toFixed(1)}" text-anchor="end" fill="var(--fg)">量</text>`;
  cs.forEach((c,j)=>{
    const up=c[3]>=c[0],col=up?'#e04b4b':'#2aa86a',live=off+j===full.length-1&&kc,x=X(j),yo=Y(c[0]),yc=Y(c[3]);
    g+=`<line x1="${x}" x2="${x}" y1="${Y(c[1])}" y2="${Y(c[2])}" stroke="${col}" stroke-width="1.3"/><rect x="${x-bw/2}" y="${Math.min(yo,yc)}" width="${bw}" height="${Math.max(1.5,Math.abs(yo-yc))}" fill="${col}" ${live?'fill-opacity=".55" stroke-dasharray="2 2"':''} stroke="${col}"/>`;
    const vh=(Vb-Vt)*c[4]/vmax;if(vh>0)g+=`<rect x="${x-bw/2}" y="${Vb-vh}" width="${bw}" height="${vh}" fill="${col}" opacity=".55"/>`;
    const rn=off+j+1;if((j%5===0&&j<n-2)||j===n-1)g+=`<text x="${x}" y="${p.y+p.h-2}" font-size="${+(9*f).toFixed(1)}" text-anchor="middle" fill="var(--fg)">${live?'現':rn}</text>`;
  });
  const wl=cs.map((c,j)=>X(j).toFixed(1)+','+Y(c[3]).toFixed(1)).join(' ');
  if(cs.length>1)g+=`<polyline points="${wl}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${wl}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  g+=`<circle cx="${X(cs.length-1)}" cy="${Y(last[3])}" r="3" fill="#fff" stroke="#000" stroke-opacity=".55" stroke-width="1.5"/>`;
  return g;
}
function holdSvgC(p,trading){
  const f=Math.min(1.5,p.h/90);   // 區域（含過路費倍率）｜股價｜各玩家持有數；每區一行，列高由 MINI_H 決定
  const np_=P.length,x0=p.x+8,nw=Math.min(190,p.w*.36),pw=Math.min(100,p.w*.2),cw=(p.w-16-nw-pw)/np_,y0=p.y+2,hh=14*f,rh=(p.h-y0-hh-2)/5,pv=shist&&shist.length?shist[shist.length-1]:stock,fs=Math.max(9,Math.min(15,rh-3));
  let g=panelBg(p,'');
  if(trading)g+=`<rect x="${x0+nw+pw+turn*cw}" y="${y0}" width="${cw}" height="${hh+rh*5}" fill="var(--accent)" opacity=".35"/>`;
  g+=`<text x="${x0}" y="${y0+11*f}" font-size="${+(10.5*f).toFixed(1)}" font-weight="700" fill="var(--fg)">區域／過路費倍率</text><text x="${x0+nw+pw/2}" y="${y0+11*f}" font-size="${+(10.5*f).toFixed(1)}" font-weight="700" text-anchor="middle" fill="var(--fg)">股價</text>`;
  P.forEach((_,i)=>{g+=`<text x="${x0+nw+pw+(i+.5)*cw}" y="${y0+11*f}" font-size="${+(10.5*f).toFixed(1)}" font-weight="700" text-anchor="middle" fill="${C[i]}">P${i+1}</text>`;});
  g+=`<line x1="${x0}" x2="${p.x+p.w-8}" y1="${y0+hh}" y2="${y0+hh}" stroke="var(--line)"/>`;
  RK.forEach((r,k)=>{
    const y=y0+hh+k*rh,d=stock[r]-(pv[r]??stock[r]),m=tollMulOf(r),ty=y+rh/2+fs*.35;
    if(k)g+=`<line x1="${x0}" x2="${p.x+p.w-8}" y1="${y}" y2="${y}" stroke="var(--bd)"/>`;
    g+=`<circle cx="${x0+4}" cy="${y+rh/2}" r="3.5" fill="${RCOL[r]}"/><text x="${x0+12}" y="${ty}" font-size="${fs}" fill="var(--fg)">${RN(r)} <tspan font-size="${fs-2}" opacity=".85">過路費×${m}</tspan></text>`;
    g+=`<text x="${x0+nw+pw/2}" y="${ty}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="var(--fg)">${stock[r]}${d?`<tspan font-size="${fs-2.5}" fill="${d>0?'#e04b4b':'#2aa86a'}"> ${d>0?'▲':'▼'}${Math.abs(d)}</tspan>`:''}</text>`;
    P.forEach((q,i)=>{g+=`<text x="${x0+nw+pw+(i+.5)*cw}" y="${ty}" font-size="${fs}" text-anchor="middle" fill="var(--fg)" ${q.st[r]?'':'opacity=".4"'} ${trading&&i===turn?'font-weight="700"':''}>${q.st[r]}</text>`;});
  });
  return g;
}
const chgTxt=r=>chg[r]?` <small style="color:${chg[r]>0?'#e04b4b':'#2aa86a'}">${chg[r]>0?'▲':'▼'}${Math.abs(chg[r])}</small>`:'';
function costTxt(r){
  const p=P[turn],q=Math.max(1,qty[r]|0),B=buyQuote(r,q),c=B.total,S=sellQuote(r,Math.min(q,p.st[r]));
  return `預購 ${q} 股：<b>${money(c)}</b>`+(RULES.imp?`（均價 ${B.avg}，買後股價約 +${(B.m*100).toFixed(1)}%）`:'')+(p.cash>=c?`（買後餘 ${money(p.cash-c)}）`:`<span style="color:#e04b4b">（現金差 ${money(c-p.cash)}）</span>`)+`｜賣出可得 ${money(S.net)}`+(RULES.imp&&p.st[r]?`（賣後股價約 −${(S.m*100).toFixed(1)}%）`:'');
}
function setQty(r,v){qty[r]=Math.max(1,Math.floor(+v||1));$('#c_'+r).innerHTML=costTxt(r);}

function maxBuy(r){const p=P[turn];let q=Math.max(1,Math.min(MAXH-p.st[r],Math.floor(p.cash/stock[r])));while(q>1&&buyQuote(r,q).total>p.cash)q--;qty[r]=q;render();} // 目前現金買得起的最大張數（單次買賣沒有張數上限，只受現金與每區持股上限 MAXH 限制）

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

/* ---------- 特殊規則一：配息、價格衝擊、K 線 ／ 特殊規則二：土地稅與彩池寶箱 ---------- */
const BUY_K=30,SELL_K=15,DIV=0.3,LTAX=0.03,AID_RATE=0.03,CHEST_STOP=0.8,CHEST_PASS=0.3,CHEST_BOOST=0.1,SKULL_DROP=0.2;   // LTAX：進彩池的土地稅率；AID_RATE：進扶貧基金的稅率；CHEST_BOOST：停在寶箱上時，其餘地區的股價漲幅
// 特殊規則：每一項都能單獨開關（need：必須先開啟的規則）
const applyLocale=()=>MAP.setLocale(!!RULES.tw);   // 台灣地名版：切換地區與土地名稱
const RULE_DEFS=[
  {k:'tw',grp:'版本',name:'台灣地名版',desc:'五大區改為台北市、新北市、台南市、高雄市、台中市，土地改為各區名稱（士林區、板橋區…），股票也一併更名。'},
  {k:'div',grp:'股市',name:'配息',desc:'過路費的 30% 依該區持股比例分給所有持股人。'},
  {k:'imp',grp:'股市',name:'價格衝擊',desc:'買越多股價推得越高、賣越多跌得越深（超線性），並依實際成交均價計價。'},
  {k:'kline',grp:'股市',name:'K 線圖',desc:'股價走勢改為 K 線（開高低收＋成交量、加權指數），另有一條白線顯示即時價格走向；下方表格仍顯示各區股價與本輪漲跌多少。'},
  {k:'tax',grp:'土地',name:'土地稅與彩池',desc:'每輪結束，依各人土地過路費合計的 3% 課稅，進入彩池。'},
  {k:'aid',grp:'土地',name:'扶貧計畫',need:'tax',desc:'每輪結束，依各人土地過路費合計的 3% 課稅，進入扶貧基金（與彩池寶箱同時開啟時，兩邊各課 3%）；每過 10 回合，基金全數發放給當下總資產最低的玩家（同額並列則平分）。需先開啟「土地稅與彩池」。'},
  {k:'chest',grp:'土地',name:'彩池寶箱',need:'tax',desc:'彩池以寶箱出現在隨機空格；經過寶箱可領彩池的 30%、停在寶箱上可領 80%（剩下的留在彩池）。任一種領取後，寶箱立刻換位置。若是停留於該格，除該格所在地區外，其餘地區股價 +10%。需先開啟「土地稅與彩池」。'},
  {k:'skull',grp:'事件',name:'骷髏',desc:'骷髏出現在隨機空格；停在那格，該格所在地區股價 −20%，之後骷髏換到別格。白格（起點、股市、黃寶石，不屬於任何地區）沒有效果，只會換位置。'},
];
const tileTag=id=>nm(id)+(nm(id)==='股市'&&T.filter(t=>t.type==='stock').length>1?(T[id].y>0?'（上方）':'（下方）'):'');   // 有兩個股市同名時：標示上方／下方
const chestRegion=id=>(id>=0&&T[id]&&T[id].region)||null;   // 寶箱所在格的地區（起點、股市、黃寶石不屬於任何地區）
const mBuy=x=>IM.perShare*x*(1+x/BUY_K), mSell=x=>Math.min(.6,IM.perShare*x*(1+x/SELL_K));   // 累計衝擊：買越多推得越高、賣越多跌得越深（超線性）
function buyQuote(r,q){
  const p0=stock[r];let gross,m;
  if(RULES.imp){let g=0;for(let j=1;j<=q;j++)g+=p0*(1+mBuy(j-.5));gross=Math.round(g);m=mBuy(q);}   // 價格衝擊：逐股墊高成交價
  else{gross=q*p0;m=IM.perShare*q;}
  return{gross,total:gross,m,avg:q?Math.round(gross/q*10)/10:p0};
}
function sellQuote(r,q){
  const p0=stock[r];let gross,m;
  if(RULES.imp){let g=0;for(let j=1;j<=q;j++)g+=p0*(1-mSell(j-.5));gross=Math.round(g);m=mSell(q);}
  else{gross=q*p0;m=IM.perShare*q;}
  return{gross,net:gross,m,avg:q?Math.round(gross/q*10)/10:p0};
}
function payDiv(t,o,amt){   // 過路費的 30% 依該地區持股比例分給所有持股人
  const r=t.region,d=Math.floor(amt*DIV),hs=P.map((_,i)=>i).filter(i=>P[i].alive&&P[i].st[r]>0),tot=hs.reduce((a,i)=>a+P[i].st[r],0);
  if(!d||!tot)return;
  let paid=0;const parts=[];
  hs.forEach(i=>{const sh=Math.floor(d*P[i].st[r]/tot);if(sh>0){paid+=sh;P[o].cash-=sh;P[i].cash+=sh;if(i!==o)mfxAdd(i,sh);parts.push(`${pn(i)} ${money(sh)}`);}});
  if(paid)log(`${RN(r)} 配息 ${money(paid)}（過路費 ${DIV*100}% 按持股：${parts.join('、')}）`);
}
const KSER=[...RK,'idx'];
const WTS=Object.fromEntries(RK.map(r=>[r,T.filter(t=>t.type==='land'&&t.region===r).reduce((a,t)=>a+t.price,0)]));
const idxVal=()=>{const W=RK.reduce((a,r)=>a+WTS[r],0);return Math.round(RK.reduce((a,r)=>a+WTS[r]*stock[r]/(base[r]||stock[r]),0)/W*1000)/10;};   // 加權指數：以各區土地總價為權重，開局＝100
const kNow=()=>KSER.map(k=>k==='idx'?idxVal():stock[k]);
function kOpen(){const v=kNow();kc=v.map(x=>[x,x,x,x,0]);}
function kTouch(){if(!RULES.kline||!kc)return;kNow().forEach((x,j)=>{const c=kc[j];if(x>c[1])c[1]=x;if(x<c[2])c[2]=x;c[3]=x;});}
function kVol(r,q){if(RULES.kline&&kc){kc[RK.indexOf(r)][4]+=q;kc[KSER.length-1][4]+=q;}}
function kClose(){kTouch();kl.push(kc);if(kl.length>150)kl.shift();kOpen();}
const tollSum=i=>lands(i).reduce((a,t)=>a+tollOf(t),0);
const taxOf=i=>Math.round(tollSum(i)*LTAX),aidOf=i=>RULES.aid?Math.round(tollSum(i)*AID_RATE):0;
function autoRaise(i,need){   // 土地稅等自動扣款：現金不夠先賣股票（大的先賣），還不夠才賣地（便宜的先賣）
  const p=P[i];
  RK.slice().sort((x,y)=>p.st[y]*stock[y]-p.st[x]*stock[x]).forEach(r=>{
    if(p.cash>=need||p.st[r]<1)return;
    let n=1;while(n<p.st[r]&&p.cash+sellQuote(r,n).net<need)n++;
    const Q=sellQuote(r,n);p.st[r]-=n;p.cash+=Q.net;bump(r,-Q.m);kVol(r,n);log(`${pn(i)} 為繳稅賣出${RN(r)} ${n} 股（${money(Q.net)}）`);
  });
  lands(i).sort((x,y)=>landVal(x)-landVal(y)).forEach(t=>{
    if(p.cash>=need)return;
    const v=landVal(t);bump(t.region,-IM.sellLand);delete owner[t.id];delete lv[t.id];delete inv[t.id];delete landMod[t.id];p.cash+=v;monoSync();log(`${pn(i)} 為繳稅賣掉 ${nm(t.id)}（${money(v)}）`);
  });
}
function landTax(){
  P.forEach((p,i)=>{
    if(!p.alive)return;
    const tx=taxOf(i),aid=aidOf(i),amt=tx+aid;if(amt<=0)return;   // 彩池 3%；扶貧計畫開啟時另外再課 3%（兩者各自獨立計算）
    if(p.cash<amt)autoRaise(i,amt);
    if(p.cash<amt){log(`${pn(i)} 付不出土地稅 ${money(amt)}，破產出局`);pot+=p.cash;bankrupt(i,-1);return;}
    p.cash-=amt;pot+=tx;aidPot+=aid;mfxAdd(i,-amt);
    log(`${pn(i)} 繳土地稅 ${money(tx)}（持有土地過路費合計的 ${LTAX*100}%）→ 彩池`+(aid?`；扶貧計畫另繳 ${money(aid)}（${AID_RATE*100}%）→ 扶貧基金`:''));
  });
}
function moveChest(){
  if(pot<=0){chest=-1;return;}
  const used=new Set(P.filter(q=>q.alive).map(q=>q.pos)),c=T.map(t=>t.id).filter(id=>!used.has(id)&&id!==chest);
  chest=c.length?rnd(c):-1;
  if(chest>=0){const rg=chestRegion(chest);log(`🧰 彩池 ${money(pot)} 的寶箱出現在 ${tileTag(chest)}${rg?`（${RN(rg)}；停在那格時，除${RN(rg)}外其餘地區股價 +${CHEST_BOOST*100}%）`:`（停在那格時，所有地區股價 +${CHEST_BOOST*100}%）`}`);}
}
function claimChest(i,pass){   // pass=true：經過寶箱（領彩池 30%）；否則停在寶箱上（領 80%）。領走後寶箱換位置；停在寶箱上時，除該格所在地區外其餘地區股價 +10%
  if(!RULES.chest||chest<0||pot<=0||P[i].pos!==chest)return;
  const rate=pass?CHEST_PASS:CHEST_STOP,prize=Math.round(pot*rate),rest=pot-prize;
  P[i].cash+=prize;mfxAdd(i,prize);log(`🎉 ${pn(i)} ${pass?'經過':'停在'}寶箱，獲得彩池的 ${rate*100}%：${money(prize)}（剩下 ${money(rest)} 留在彩池）`);
  const rg=chestRegion(chest);
  pot=rest;chest=-1;
  if(!pass){const up=RK.filter(x=>x!==rg),olds=up.map(x=>stock[x]);up.forEach(x=>bump(x,CHEST_BOOST));log(`📈 停在寶箱上：${rg?`除${RN(rg)}外，`:''}其餘地區股價 +${CHEST_BOOST*100}%（${up.map((x,k)=>`${RN(x)} ${olds[k]}→${stock[x]}`).join('、')}）`);}
  moveChest();   // 被領走後，立刻換到新的位置
}
function moveSkull(){
  if(!RULES.skull)return;
  const used=new Set(P.filter(q=>q.alive).map(q=>q.pos)),c=T.map(t=>t.id).filter(id=>!used.has(id)&&id!==skull&&id!==chest);
  skull=c.length?rnd(c):-1;
  if(skull>=0){const rg=chestRegion(skull);log(`💀 骷髏出現在 ${tileTag(skull)}${rg?`（${RN(rg)}，停在那格該區股價 −${SKULL_DROP*100}%）`:'（白格，沒有效果）'}`);}
}
function hitSkull(i){
  if(!RULES.skull||skull<0||P[i].pos!==skull)return;
  const rg=chestRegion(skull);
  if(rg){const o=stock[rg];bump(rg,-SKULL_DROP);log(`💀 ${pn(i)} 踩到骷髏，${RN(rg)}股價下降 ${SKULL_DROP*100}%（${o}→${stock[rg]}）`);}
  else log(`💀 ${pn(i)} 踩到骷髏，但這是白格，什麼事也沒發生`);
  moveSkull();
}
function skullSvg(){
  if(!RULES.skull||skull<0)return '';
  const t=T[skull],x=cx(t),y=cy(t);
  return `<g transform="translate(${x},${y})" style="pointer-events:none"><rect x="${-W/2-4}" y="${-H/2-4}" width="${W+8}" height="${H+8}" rx="13" fill="none" stroke="#e04b4b" stroke-width="4" stroke-dasharray="9 6" class="chestring"/><g class="chest"><circle r="32" fill="#e04b4b" opacity=".2"/><ellipse cx="0" cy="26" rx="22" ry="5" fill="#000" opacity=".25"/><path d="M-19 4a19 19 0 0 1 38 0v7a7 7 0 0 1-7 7h-24a7 7 0 0 1-7-7z" fill="#f6f4ee" stroke="#222" stroke-width="2.2"/><rect x="-11" y="16" width="22" height="11" rx="3" fill="#f6f4ee" stroke="#222" stroke-width="2.2"/><path d="M-4 17v9M4 17v9" stroke="#222" stroke-width="1.6"/><circle cx="-7.5" cy="3" r="5.5" fill="#222"/><circle cx="7.5" cy="3" r="5.5" fill="#222"/><path d="M0 9l-3.5 6h7z" fill="#222"/></g></g>`;
}
/* ---------- 扶貧計畫：每輪課土地過路費合計的 3% 累積成基金，每 10 輪發給總資產最低的玩家 ---------- */
const AID_EVERY=10;
function aidPay(){
  if(roundNo%AID_EVERY!==0)return;
  const al=alive();if(!al.length)return;
  if(aidPot<=0){log(`🤝 扶貧計畫：第 ${roundNo} 輪基金為空，本期不發放`);return;}
  const A=al.map(assets),lo=Math.min(...A),low=al.filter((_,k)=>A[k]===lo),each=Math.floor(aidPot/low.length),rem=aidPot-each*low.length;
  low.forEach((i,k)=>{const g=each+(k===0?rem:0);P[i].cash+=g;mfxAdd(i,g);});
  log(`🤝 扶貧計畫（第 ${roundNo} 輪）：基金 ${money(aidPot)} 發放給總資產最低的 ${low.map(pn).join('、')}（總資產 ${money(lo)}）`+(low.length>1?`，平分每人約 ${money(each)}`:''));
  aidPot=0;
}
/* ---------- 休息格與樂透格（愛心地圖）----------
   休：停在「休」格期間（從停下到下次移動前），別的玩家踩到這位玩家的土地不用付過路費。
   樂透：停在「樂透」格可選號（1~49 號全場共用，每號 500 元，單次最多 10 個）；已被選走的號碼別人不能再選。
         每 10 輪結束開出一個中獎號碼，持有者得獎金（第一期 30000）。無人持有：選號保留、獎金 +15000 進入下一期；有人中獎後號碼表清空、獎金回到 30000。 */
const LOTTO_N=49,LOTTO_PRICE=500,LOTTO_MAX=10,LOTTO_BASE=30000,LOTTO_STEP=15000,LOTTO_EVERY=10;
const resting=i=>!!(P[i]&&P[i].alive&&T[P[i].pos].type==='rest');
const hasLotto=()=>T.some(t=>t.type==='lotto');
const lottoLeft=()=>LOTTO_EVERY-((roundNo-1)%LOTTO_EVERY);   // 距離開獎還有幾輪（含目前這一輪；1＝本輪結束就開獎）
const lottoFree=()=>{const a=[];for(let n=1;n<=LOTTO_N;n++)if(lotto.nums[n]===undefined)a.push(n);return a;};
const lottoMine=i=>Object.keys(lotto.nums).filter(n=>lotto.nums[n]===i).map(Number).sort((a,b)=>a-b);
const lottoCan=()=>hasLotto()&&phase==='act'&&T[P[turn].pos].type==='lotto'&&!lottoUsed&&!need&&!ask&&!alloc&&!cardShow&&!auc&&!offer&&!extraOn&&lottoFree().length>0;
const lottoLeftTxt=()=>lottoLeft()===1?'本輪結束開獎':'還有 '+lottoLeft()+' 輪開獎';
function lottoBuy(ns){   // 伺服器端執行：驗證後扣款、登記號碼
  if(!lottoCan()||!Array.isArray(ns))return;
  const list=[...new Set(ns)];
  if(!list.length||list.length>LOTTO_MAX||!list.every(n=>Number.isInteger(n)&&n>=1&&n<=LOTTO_N&&lotto.nums[n]===undefined))return;
  list.sort((a,b)=>a-b);
  const cost=list.length*LOTTO_PRICE;
  if(P[turn].cash<cost){log(`現金不足，買不起 ${list.length} 個樂透號碼（需 ${money(cost)}）`);return render();}
  P[turn].cash-=cost;list.forEach(n=>{lotto.nums[n]=turn;});lottoUsed=true;LSEL=[];mfxAdd(turn,-cost);
  log(`🎟️ ${pn(turn)} 購買樂透號碼 ${list.join('、')}（${list.length} 個，${money(cost)}）`);
  render();
}
function lottoDraw(){
  if(!hasLotto()||roundNo%LOTTO_EVERY!==0)return;
  const w=1+(Math.random()*LOTTO_N|0),o=lotto.nums[w],prize=lotto.pot,per=lotto.period;
  if(o!==undefined&&P[o]&&P[o].alive){
    P[o].cash+=prize;mfxAdd(o,prize);
    log(`🎟️ 樂透第 ${per} 期開獎（第 ${roundNo} 輪）：中獎號碼 ${w}，${pn(o)} 獲得 ${money(prize)}！號碼表清空，獎金回到 ${money(LOTTO_BASE)}`);
    lotto.last={w,by:o,prize,period:per,round:roundNo};lotto.pot=LOTTO_BASE;lotto.period=1;lotto.nums={};
  }else{
    const nx=prize+LOTTO_STEP;
    log(`🎟️ 樂透第 ${per} 期開獎（第 ${roundNo} 輪）：中獎號碼 ${w}，無人持有；選號保留，下一期獎金累積到 ${money(nx)}`);
    lotto.last={w,by:-1,prize,period:per,round:roundNo};lotto.pot=nx;lotto.period=per+1;
  }
}
function lottoRelease(i){if(!lotto)return;Object.keys(lotto.nums).forEach(n=>{if(lotto.nums[n]===i)delete lotto.nums[n];});}   // 破產出局：他選的號碼釋出
// 以下只動自己的畫面（選號、不買了），不送到伺服器；真正購買才送 lottoBuy
function lottoTog(n){if(!lottoCan()||lotto.nums[n]!==undefined)return;const k=LSEL.indexOf(n);if(k>=0)LSEL.splice(k,1);else if(LSEL.length<LOTTO_MAX)LSEL.push(n);render();}
const lottoRand1=()=>{const f=lottoFree().filter(n=>!LSEL.includes(n));if(f.length&&LSEL.length<LOTTO_MAX){LSEL.push(rnd(f));render();}};
const lottoClear=()=>{LSEL=[];render();};
const lottoSkip=()=>{LSKIP=landSeq;render();};
const lottoOk=()=>{if(LSEL.length)lottoBuy(LSEL.slice());};   // 瀏覽器端 lottoBuy 會被 online.js 換成送給伺服器
let LOTTO_OPEN=false;   // 樂透資訊平常收起；玩家自己按「查看樂透」才展開（只影響自己的畫面，與翻牌區相同）
const toggleLotto=()=>{LOTTO_OPEN=!LOTTO_OPEN;render();};
function lottoInfoBox(){
  if(typeof lotto==='undefined'||!lotto||!hasLotto())return '';
  if(!LOTTO_OPEN)return `<div style="margin:8px 6px 0 0;display:inline-block"><button class="nw" onclick="toggleLotto()">🎟️ 查看樂透</button></div>`;
  const L=lotto.last,lw=L?L.w:-1,mine=ME>=0?lottoMine(ME):[];
  const cells=Array.from({length:LOTTO_N},(_,k)=>{const n=k+1,o=lotto.nums[n],ol=n===lw?'outline:2px dashed #d9a900;':'';
    return o!==undefined?`<div class="cd on" style="${ol}background:${C[o]};color:${ink(C[o])}" title="${esc(NAMES[o]||'玩家'+(o+1))}">${n}<small>P${o+1}</small></div>`:`<div class="cd" style="${ol}">${n}</div>`;}).join('');
  const cnt=P.map((q,i)=>`<span style="${q.alive?'':'opacity:.4'}"><span class="sw" style="background:${C[i]}"></span>${pn(i)} <b>${lottoMine(i).length}</b></span>`).join('　');
  return `<div class="box" style="margin-top:8px"><b>🎟️ 樂透</b> <button class="nw" onclick="toggleLotto()" style="margin:0 0 0 6px;padding:2px 10px">收起</button>　第 ${lotto.period} 期｜獎金 <b>${money(lotto.pot)}</b>｜${lottoLeftTxt()}｜每號 ${money(LOTTO_PRICE)} 元
    <div class="cg">${cells}</div>
    <div style="margin-top:4px;font-size:13px">${L?`上期（第 ${L.period} 期）開出 <b>${L.w}</b>：${L.by>=0?pn(L.by)+' 中獎 '+money(L.prize):'無人中獎'}`:'首次開獎：第 '+LOTTO_EVERY+' 輪結束'}</div>
    <div style="margin-top:4px;font-size:13px">持有（個）：${cnt}${mine.length?`<br>我的號碼：${mine.join('、')}`:''}</div></div>`;
}
function lottoBox(){   // 輪到自己、停在樂透格：蓋在地圖上的選號視窗（比照翻牌區，不必往下捲）
  if(typeof lotto==='undefined'||!lotto||!(ME<0||ME===turn)||!lottoCan()||LSKIP===landSeq)return '';
  if(LSEL_SEQ!==landSeq){LSEL=[];LSEL_SEQ=landSeq;}
  LSEL=LSEL.filter(n=>lotto.nums[n]===undefined);
  const c=P[turn].cash,cost=LSEL.length*LOTTO_PRICE,ok=LSEL.length>0&&c>=cost;
  const cells=Array.from({length:LOTTO_N},(_,k)=>{const n=k+1,o=lotto.nums[n];
    if(o!==undefined)return `<div class="cd on" style="background:${C[o]};color:#fff" title="${pn(o)}">${n}<small>P${o+1}</small></div>`;
    return `<div class="cd can${LSEL.includes(n)?' lsel':''}" onclick="lottoTog(${n})">${n}</div>`;}).join('');
  return `<div class="cov"><div class="box"><b>🎟️ 樂透</b>　<span class="hint">點選號碼（單次最多 ${LOTTO_MAX} 個，每號 ${money(LOTTO_PRICE)} 元）</span>
    <div class="csub">第 ${lotto.period} 期｜獎金 <b>${money(lotto.pot)}</b>｜${lottoLeftTxt()}｜有顏色的號碼已被選走</div>
    <div class="cg">${cells}</div>
    <div style="margin-top:8px">已選 <b>${LSEL.length}</b>／${LOTTO_MAX}　花費 <b>${money(cost)}</b>（現金 ${money(c)}${c>=cost?'':'，<span style="color:#e04b4b">不足</span>'}）</div>
    <div style="margin-top:6px"><button class="big" onclick="lottoOk()" ${ok?'':'disabled'}>購買</button><button onclick="lottoRand1()">隨機選 1 個</button><button onclick="lottoClear()">清除</button><button onclick="lottoSkip()">不買了</button></div></div></div>`;
}
function roundEnd(){
  inRound=true;
  if(RULES.tax)landTax();
  if(phase!=='over'&&RULES.aid)aidPay();   // 扶貧計畫：每滿 10 輪發放一次
  if(phase!=='over')lottoDraw();           // 樂透：每滿 10 輪開獎一次（沒有樂透格的地圖會直接略過）
  if(phase!=='over'){if(RULES.kline)kClose();roundNo++;if(RULES.chest&&chest<0)moveChest();   // 寶箱不會每輪換位置：沒有寶箱時才放一個
  }
  inRound=false;
}
function trade(r,sign){
  const p=P[turn];
  if(!(phase==='act'||(phase==='move'&&extraOn))||need||!((T[p.pos].type==='stock'&&!upUsed)||extraOn))return;
  if(traded[r]){log(`${RN(r)} 本次已交易，暫時關閉`);return render();}
  let q=Math.max(1,Math.floor(+qty[r]||1));
  if(sign>0){
    q=Math.min(q,MAXH-p.st[r]);
    if(q<1){log(`${RN(r)} 持股已達上限 ${MAXH}`);return render();}
    const Q=buyQuote(r,q),cost=Q.total;
    spend(cost,`買入${RN(r)} ${q} 股`,()=>{traded[r]=true;p.cash-=cost;p.st[r]+=q;bump(r,Q.m);kVol(r,q);log(`${pn(turn)} 買入${RN(r)} ${q} 股（${money(cost)}${RULES.imp?`，均價 ${Q.avg}`:''}）`);});
  }else{
    q=Math.min(q,p.st[r]);if(q<1)return;
    const Q=sellQuote(r,q);
    traded[r]=true;p.st[r]-=q;p.cash+=Q.net;bump(r,-Q.m);kVol(r,q);log(`${pn(turn)} 賣出${RN(r)} ${q} 股（${money(Q.net)}${RULES.imp?`，均價 ${Q.avg}`:''}）`);render();
  }
}
function chk(){
  if(need&&need.forced&&P[need.who].cash>=need.amount){const d=need.done;need=null;d();}
  render();
}
function sellStock(r,n){
  const p=P[turn];n=Math.min(n,p.st[r]);if(n<1)return;
  const Q=sellQuote(r,n);p.st[r]-=n;p.cash+=Q.net;log(`${pn(turn)} 賣出${RN(r)} ${n} 股（${money(Q.net)}）`);bump(r,-Q.m);kVol(r,n);chk();
}
function sellEnough(r){const sh=need.amount-P[turn].cash;let n=Math.max(1,Math.ceil(sh/stock[r]));if(RULES.imp){n=1;while(n<P[turn].st[r]&&sellQuote(r,n).net<sh)n++;}sellStock(r,n);}
/* ---------- 土地拍賣：缺錢賣地時，不再直接賣給銀行，改由其他玩家競標 ----------
   底價＝土地價值（地價＋升級投入）。任何人按「競標」，價格立刻 +AUC_STEP、該玩家成為領先者，倒數重新從 AUC_MS（6 秒）開始；
   倒數期間沒有人再加價，最後加價者以目前價格得標。從頭到尾都沒人競標，則由銀行以底價收購（賣方至少拿到土地價值）。
   伺服器依收到的先後順序處理競標。得標者連同等級、升級投入一起接手這塊地。 */
const AUC_STEP=500,AUC_MS=6000;
function sellLand(id){
  if(auc||!need||hasStock(turn)||owner[id]!==turn)return;
  const v=landVal(T[id]);
  auc={id,seller:turn,base:v,price:v,leader:-1,count:0,endAt:Date.now()+AUC_MS};
  log(`🔨 ${pn(turn)} 拍賣 ${nm(id)}，底價 ${money(v)}（每次加價 ${money(AUC_STEP)}，${AUC_MS/1000} 秒內無人再加價即得標）`);
  render();
}
function aucBid(i){
  if(!auc||!Number.isInteger(i)||!P[i]||!P[i].alive||i===auc.seller||i===auc.leader)return;
  if(P[i].cash<auc.price+AUC_STEP)return;   // 只能用現金競標
  auc.price+=AUC_STEP;auc.leader=i;auc.count++;auc.endAt=Date.now()+AUC_MS;   // 每次加價就重新倒數 6 秒
  log(`🔨 ${pn(i)} 加價到 ${money(auc.price)}`);
  render();
}
function aucTick(){   // 伺服器定時呼叫：倒數結束就成交
  if(!auc)return;
  if(phase==='over'){auc=null;return;}
  if(Date.now()>=auc.endAt)aucEnd();
}
function aucEnd(){
  const a=auc;auc=null;const id=a.id,s=a.seller,w=a.leader;
  if(owner[id]!==s)return render();
  if(w>=0&&P[w].alive&&P[w].cash>=a.price){
    P[w].cash-=a.price;P[s].cash+=a.price;owner[id]=w;mfxAdd(w,-a.price);mfxAdd(s,a.price);   // 等級、升級投入與地塊加成都由得標者接手
    log(`🔨 成交！${pn(w)} 以 ${money(a.price)} 標得 ${nm(id)}（底價 ${money(a.base)}，${pn(s)} 多拿 ${money(a.price-a.base)}）`);
  }else{
    bump(T[id].region,-IM.sellLand);delete owner[id];delete lv[id];delete inv[id];delete landMod[id];P[s].cash+=a.base;
    log(`🔨 流標：沒有人競標，銀行以底價 ${money(a.base)} 收購 ${nm(id)}`);
  }
  monoSync();chk();
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
  let fill='#e6e6e6',sub='',sub2='',icon='',badge='',mark='';
  if(t.type==='land'){fill=MAP.REGIONS[t.region].color;const ow=owner[t.id]!==undefined;sub=ow?RN(t.region):`${RN(t.region)}｜地價 ${money(t.price)}`;const zz=ow&&resting(owner[t.id]);sub2=ow&&!zz?money(tollOf(t)):'';if(zz)mark=`<text class="rz" x="${cx(t)}" y="${y+71}" font-size="24" font-weight="800" fill="#4b2fa3" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle" style="pointer-events:none">休</text>`;
    badge=(l=>`<rect x="${x+4}" y="${y+4}" width="22" height="19" rx="5" fill="${LVC[l]}" stroke="#fff" stroke-width="1.5"/><text x="${x+15}" y="${y+18}" font-size="14" font-weight="800" fill="${l===3?'#222':'#fff'}" text-anchor="middle">${MAP.LEVELS[l]}</text>`)(lv[t.id]||0);}
  if(t.type==='gem'){fill=MAP.GEMS[t.gem].color;sub=t.region?RN(t.region):'特殊';icon='💎';}
  if(t.type==='stock'){fill='#d4dae2';icon='📈';sub='可交易股票';}
  if(t.type==='start'){fill='#fff';icon='🏁';}
  if(t.type==='blank'){fill='#f1eee6';icon=t.icon||'';sub=t.sub||'';}   // 空格（沒有效果）
  if(t.type==='lotto'){fill='#fff1c9';icon=t.icon;sub=t.sub;sub2=lotto?money(lotto.pot):'';}   // 樂透：格子上直接顯示目前獎金
  if(t.type==='rest'){fill='#e8e3f7';icon=t.icon;sub=t.sub;}
  const tc=(t.type==='gem'&&t.gem!=='topaz')?'#fff':'#222';
  const here=P.map((p,i)=>p.alive&&p.pos===t.id?i:-1).filter(i=>i>=0);
  const o=owner[t.id],flag=o===undefined?'':`<circle cx="${x+W-11}" cy="${y+11}" r="8" fill="${C[o]}" stroke="#fff" stroke-width="1.5"/><text x="${x+W-11}" y="${y+15}" font-size="10" font-weight="700" fill="${ink(C[o])}" text-anchor="middle">${o+1}</text>`;
  const cur=here.includes(turn);
  return `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="9" fill="${fill}" stroke="${cur?C[turn]:'#8a8a82'}" stroke-width="${cur?4:1.5}"/>
   <text x="${cx(t)}" y="${y+31}" font-size="${t.name.length>4?12:15}" font-weight="700" fill="${tc}" text-anchor="middle">${icon} ${t.name}</text>
   <text x="${cx(t)}" y="${y+43}" font-size="11" fill="${tc}" text-anchor="middle" opacity=".85">${sub}</text>
   <text x="${cx(t)}" y="${y+60}" font-size="17" font-weight="800" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${sub2}</text>${mark}${badge}${flag}`;
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
/* ---------- 右下角資訊區：小地圖／股價／持有數，玩家自己切換（只影響自己的畫面） ---------- */
let MTAB='stock';
const MTABS=[['stock','股價'],['hold','持有數']];
const setMTab=k=>{MTAB=k;render();};
function miniBox(trading){
  const tabs='<div class="mtabs">'+MTABS.map(([k,n])=>`<button class="nw${MTAB===k?' on':''}" onclick="setMTab('${k}')">${n}</button>`).join('')+'</div>';
  const cv=(p,g)=>`<svg viewBox="0 0 ${p.w} ${p.h}">${g}</svg>`;
  const body=MTAB==='stock'?cv(IP.stock,RULES.kline?klineSvgC(IP.stock):stockChartSvgC(IP.stock)):cv(IP.hold,holdSvgC(IP.hold,trading));
  return tabs+`<div class="mbody">${body}</div>`;
}
/* ---------- 小地圖（只標示玩家位置，不含文字） ---------- */
function miniSvg(){
  const tiles=T.map(t=>{
    const x=cx(t)-W/2,y=cy(t)-H/2,X=cx(t),Y=cy(t);
    if(t.type==='gem')return `<polygon points="${X},${Y-42} ${X+46},${Y} ${X},${Y+42} ${X-46},${Y}" fill="${MAP.GEMS[t.gem].color}" stroke="#222" stroke-width="6" stroke-linejoin="round"/>`;
    const f=t.type==='land'?(owner[t.id]!==undefined?C[owner[t.id]]:'#c9c9c4'):t.type==='stock'?'#d4dae2':t.type==='lotto'?'#fff1c9':t.type==='rest'?'#e8e3f7':'#fff';
    return `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="9" fill="${f}" ${t.type==='land'?'':'stroke="#aaa" stroke-width="3"'}/>`;
  }).join('');
  const off=[[-20,-15],[20,-15],[-20,15],[20,15]];
  const dots=P.map((p,i)=>{
    if(!p.alive)return '';
    const k=P.filter((q,j)=>q.alive&&q.pos===p.pos&&j<i).length,t=T[p.pos],x=cx(t)+off[k%4][0],y=cy(t)+off[k%4][1],me=i===turn&&phase!=='over';
    return (me?`<circle class="pulse" cx="${x}" cy="${y}" r="29" fill="none" stroke="${C[i]}" stroke-width="6"/>`:'')+`<circle cx="${x}" cy="${y}" r="${me?20:17}" fill="${C[i]}" stroke="#fff" stroke-width="5"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${VW} ${VH}">${tiles}${dots}</svg>`;
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
  else body=`<p>已無股票可賣，可拍賣土地（底價＝地價＋升級投入；其他玩家競標，無人競標則銀行以底價收購）：</p>`+lands(need.who).map(t=>`<button onclick="sellLand(${t.id})">拍賣 ${t.name}（底價 ${money(landVal(t))}）</button>`).join('');
  const cancel=need.forced?'':`<button onclick="cancelNeed()">取消</button>`;
  return `<div class="md"><div class="box"><b>現金不足</b><p>${need.desc}需要 ${money(need.amount)}，現金 ${money(p.cash)}，還差 <b>${money(Math.max(0,short))}</b>。</p>${body}<div>${cancel}</div></div></div>`;
}
const aucLeft=()=>Math.max(0,Math.ceil((auc.endAt-(Date.now()+(typeof SRVOFF==='undefined'?0:SRVOFF)))/1000));
function aucTimer(){   // 瀏覽器端每 0.2 秒更新倒數（不重畫整個畫面）
  if(!auc)return;const e=$('#auc_t'),b=$('#auc_b');if(!e)return;
  const ms=Math.max(0,auc.endAt-(Date.now()+(typeof SRVOFF==='undefined'?0:SRVOFF)));
  e.textContent=Math.ceil(ms/1000);if(b)b.style.width=(ms/AUC_MS*100).toFixed(1)+'%';
}
function aucModal(){
  const a=auc,t=T[a.id],me=typeof ME==='number'?ME:-1,mp=P[me];
  const isSeller=me===a.seller,isLeader=me===a.leader;
  let btn;
  if(!mp||!mp.alive||(typeof away==='function'&&away()))btn='<div class="hint">你目前無法競標</div>';
  else if(isSeller)btn='<div class="hint">你是賣方，等待其他玩家競標…</div>';
  else if(isLeader)btn='<div class="hint">你目前領先中，倒數結束沒人加價就是你的</div>';
  else if(mp.cash<a.price+AUC_STEP)btn=`<button class="big" disabled>現金不足（需 ${money(a.price+AUC_STEP)}）</button>`;
  else btn=`<button class="big" onclick="aucBid()">競標 +${money(AUC_STEP)}</button>`;
  return `<div class="md" style="z-index:9"><div class="box"><b>🔨 土地拍賣</b>
    <p>${landDet(a.id)}<br>賣方：<b style="color:${C[a.seller]}">${pn(a.seller)}</b></p>
    <p>底價 ${money(a.base)}<br>目前價格 <b style="font-size:20px">${money(a.price)}</b>　領先：${a.leader>=0?`<b style="color:${C[a.leader]}">${pn(a.leader)}</b>`:'<span style="opacity:.6">尚無</span>'}</p>
    <div style="background:var(--bd);border-radius:6px;height:10px;overflow:hidden"><div id="auc_b" style="height:100%;background:var(--accent);width:${(aucLeft()*1000/AUC_MS*100).toFixed(1)}%"></div></div>
    <p>無人加價則成交，倒數 <b id="auc_t">${aucLeft()}</b> 秒｜已加價 <b>${a.count}</b> 次</p>
    ${btn}
    <div style="font-size:12px;margin-top:6px;opacity:.8">每次加價 +${money(AUC_STEP)}，並重新倒數 ${AUC_MS/1000} 秒；倒數內沒人再加價，最後加價者得標。全程無人競標則由銀行以底價收購。</div>
  </div></div>`;
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
  $('#ga').innerHTML=arrows;$('#cb').innerHTML=cardBox()+lottoInfoBox()+lottoBox();updateTokens();
  if($('#cb .cov')){if(!FLIP_SHOWN){FLIP_SHOWN=true;$('#bd').scrollIntoView({behavior:'smooth',block:'start'});}}else FLIP_SHOWN=false;

  const trading=(phase==='act'||(phase==='move'&&extraOn))&&!need&&((t.type==='stock'&&!upUsed)||extraOn);
  $('#gl').innerHTML=lines+T.map(tileSvg).join('')+chestSvg()+skullSvg();
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
    if(t.type==='gem')act+=flipUsed?`<div>本回合已翻牌${lastCard?'：'+lastCard:''}</div>`:mustFlip()?'<div class="hint">請先翻牌，翻完才能結束回合</div>':'';
    if(t.type==='lotto')act+=lottoUsed?'<div>本回合已購買樂透</div>':!lottoFree().length?'<div>號碼已全部被選走</div>':LSKIP===landSeq?'<button onclick="LSKIP=-1;render()">🎟️ 選樂透號碼</button>':'<div class="hint">請在地圖上選樂透號碼（或按「不買了」）</div>';
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
    act+=`<button onclick="endTurn()" ${mustFlip()?'disabled title="請先翻牌"':''}>結束回合</button>`;
  }
  if(ROLL_SEEN===null||rollSeq<ROLL_SEEN)ROLL_SEEN=rollSeq;
  else if(rollSeq>ROLL_SEEN){ROLL_SEEN=rollSeq;ROLL_UNTIL=Date.now()+1500;rollFx();}
  const rl=ROLL_UNTIL-Date.now(),dz=rl>0?`<span class="dz" id="dz" style="animation-delay:-${((1500-rl)/1000).toFixed(2)}s">${DICE_FACES[Math.random()*6|0]}</span>`:'';
  const head=`<div class="box">輪到：<b style="color:${C[turn]}">${pnA(turn)}</b>　<span class="dice">🎲 ${dice||'-'}</span>${dz}<br>${act}</div>`;
  const gemTxt=q=>MAP.GEM_KEYS.map(k=>`<span style="color:${q.gems[k]?MAP.GEMS[k].color:'#999'};font-weight:${q.gems[k]?700:400}">◆${MAP.GEMS[k].name}</span>`).join(' ')+(q.shield?` 🛡×${q.shield}`:'');
  const pls=P.map((q,i)=>{const A=assets(i),hi=A>=MAP.WIN_ASSETS;return `<div class="box pl${i===turn?' on':''}" style="border-left-color:${C[i]};${q.alive?'':'opacity:.45'}"><img class="pp" src="${picUrl(i)}" alt="${MAP.PIC_NAMES[PIC[i]]||''}"><b>${pnA(i)}</b>${i===ME?'（你）':''}${q.alive?'':'（出局）'}　Lv.${q.level}｜${nm(q.pos)}｜來向：${nm(q.prev)}<br>現金 ${money(q.cash)}｜總資產 ${hi?`<span style="background:#333;color:#ffd21f;font-weight:700;padding:0 5px;border-radius:4px">${money(A)}</span>`:money(A)}<br>${gemTxt(q)}<br>地：${lands(i).map(x=>x.name+'(<b style="color:'+LVC[lv[x.id]||0]+'">'+MAP.LEVELS[lv[x.id]||0]+'</b>)').join('、')||'無'}${RULES.tax?`<br>每輪土地稅預估 ${money(taxOf(i)+aidOf(i))}${RULES.aid?`（含扶貧 ${money(aidOf(i))}）`:''}`:''}${hi&&phase!=='over'&&i===turn?'<br><b style="color:#d9a900">已達 '+money(MAP.WIN_ASSETS)+'，經過或停留起點即獲勝</b>':''}${tradeBtn(i)}</div>`}).join('');
  const stk=`<div class="box"><b>股市</b>${RULE_DEFS.filter(d=>RULES[d.k]).map(d=>` <span class="tag">${d.name}</span>`).join('')}　<span style="font-size:12px">股價走勢與各人持有數在右下角資訊區（可切換）；每區每人持股上限 ${MAXH} 股，單次買賣不限張數</span>`+
    (RULES.tax?`<div style="margin-top:4px">🧰 彩池 <b>${money(pot)}</b>（${!RULES.chest?'未開啟「彩池寶箱」，彩池只會累積':chest>=0?'寶箱在 <b>'+tileTag(chest)+'</b>'+(chestRegion(chest)?'（'+RN(chestRegion(chest))+'）':'')+'，經過可領 '+CHEST_PASS*100+'%、停下領 '+CHEST_STOP*100+'%，停下時'+(chestRegion(chest)?'除'+RN(chestRegion(chest))+'外':'')+'其餘地區股價 +'+CHEST_BOOST*100+'%':pot>0?'下一輪出現':'目前沒有彩池'}）</div>`:'')+
    (RULES.aid?`<div style="margin-top:4px">🤝 扶貧基金 <b>${money(aidPot||0)}</b>（每輪課土地過路費合計的 ${AID_RATE*100}%；第 ${Math.ceil(roundNo/AID_EVERY)*AID_EVERY} 輪結束時發給總資產最低的玩家）</div>`:'')+
    (RULES.skull?`<div style="margin-top:4px">💀 骷髏${skull>=0?'在 <b>'+tileTag(skull)+'</b>'+(chestRegion(skull)?'（'+RN(chestRegion(skull))+'，停在那格該區股價 −'+SKULL_DROP*100+'%）':'（白格，沒有效果，只會換位置）'):'暫時沒有位置'}</div>`:'')+
    (trading?'<hr>'+RK.map(r=>traded[r]?`<div>${RN(r)} 🔒 本次已交易，暫時關閉</div>`:`<div>${RN(r)} <span style="background:var(--accent);color:#222;font-weight:700;padding:1px 7px;border-radius:10px">持有 ${P[turn].st[r]}</span> <span style="font-size:12px">過路費×${tollMulOf(r)}</span> <input type="number" min="1" value="${qty[r]}" oninput="setQty('${r}',this.value)">
      <button onclick="trade('${r}',1)">買</button><button onclick="trade('${r}',-1)">賣</button><button onclick="qty['${r}']=99;render()">99</button><button onclick="maxBuy('${r}')">最大</button><div style="font-size:12px" id="c_${r}">${costTxt(r)}</div></div>`).join('')+'<div style="font-size:12px">每區每次停留只能交易一次（買或賣擇一）</div>':'')+`</div>`;
  const ctl=`<div class="box">玩家數 <select onchange="np=+this.value;reset()">${[1,2,3,4].map(n=>`<option ${n===np?'selected':''}>${n}</option>`).join('')}</select>
    指定點數（測試） <select onchange="force=this.value">${['0','1','2','3','4','5','6'].map(v=>`<option value="${v}" ${v===force?'selected':''}>${v==='0'?'隨機':v}</option>`).join('')}</select>
    <button onclick="reset()">重來</button></div>`;
  $('#sd').innerHTML=head+(phase==='over'?histChart():'')+`<div class="prow"><div class="pcol">${pls}</div><div class="rcol"><div class="box" id="log">${logs.join('<br>')}</div><div class="box" id="mm">${miniSvg()}</div></div></div>`+stk+`<div class="box" id="mini">${miniBox(trading)}</div>`;
  mfxPlay();
  $('#md').innerHTML=auc?aucModal():cardShow?cardModal():alloc?allocModal():ask?askModal():need?modal():offer?offerModal():tradeUI?composeModal():'';
}
const CARDS=buildCards();
