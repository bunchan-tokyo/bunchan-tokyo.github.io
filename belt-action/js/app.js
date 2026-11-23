/* ===== app.js : ロジック（元 index.html の script からデータ定義を除いた残り） ===== */
"use strict";
/* =====================================================================
 設計メモ（面白さの核）
 1. 手応え  : 技ごとに hitstop / shake / ノックバック / 打ち上げ量を設定。
              吹っ飛んだ敵は壁バウンドし、他の敵を巻き込む（群れを崩す快感）。
 2. コンボ  : 4段コンボはヒット時のみ次段へ（空振りは初段に戻る＝狙って当てる）。
              先行入力10F、ヒット時はジャンプ/ダッシュでキャンセル可。
              コンボ数でスコア倍率↑、途切れた時にボーナス。被弾で全部失う。
 3. 敵の役割: 攻撃トークンで同時攻撃数を制限し、待機組は左右バランスを取って回り込み囲む。
              突進(見て避けて反撃) / タンク(アーマー、振りかぶりに引く) /
              ナイフ(距離を取る、跳ぶ・弾く) / ガード(正面無効、背後・投げ・跳び蹴りで崩す)。
 4. 進行    : エリアごとにカメラロック→ウェーブ→GO→。新種初登場時に攻略ヒント。
              木箱から食べ物・武器。ボスは3パターン＋HP半分で怒り（増援・高速化）。
 5. リスク/報酬: 必殺技はHP消費・無敵。武器は強いが耐久制・ダウンで落とす。
              ノーダメージでエリアボーナス、ナイフパリィ、満腹時の食べ物はスコア。
 ===================================================================== */
const W=640,H=360,Y0=212,Y1=342,G=.42,BUF=10;
const STAGE_END=AREAS[AREAS.length-1].cam+W; // 元は定義節内（AREAS と W から算出）
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
let DPR=1,SW=640,SH=360,scale=1,offX=0,offY=0,FR=0;
let touchMode=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
const rnd=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>v<a?a:v>b?b:v,sgn=v=>v<0?-1:1;
function hash(i){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x)}

function resize(){
  DPR=window.devicePixelRatio||1;SW=innerWidth;SH=innerHeight;
  cv.width=SW*DPR;cv.height=SH*DPR;
  scale=Math.min(SW/W,SH/H);offX=(SW-W*scale)/2;offY=(SH-H*scale)/2;
  layoutTouch();
}

/* ---------------- Audio (WebAudio 合成のみ) ---------------- */
let AC=null,master=null,noiseBuf=null;
function audioInit(){
  if(AC){if(AC.state==='suspended')AC.resume();return}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  AC=new C();master=AC.createGain();master.gain.value=.55;
  const comp=AC.createDynamicsCompressor();master.connect(comp);comp.connect(AC.destination);
  const n=AC.sampleRate*.5|0;noiseBuf=AC.createBuffer(1,n,AC.sampleRate);
  const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
}
function tone(type,f0,f1,dur,vol,delay){
  if(!AC)return;const t=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02);
}
function noise(dur,vol,freq,q,ftype,delay){
  if(!AC)return;const t=AC.currentTime+(delay||0),s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();
  s.buffer=noiseBuf;f.type=ftype||'bandpass';f.frequency.value=freq;f.Q.value=q||1;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+dur+.02);
}
const SFX={
  hit(){noise(.07,.7,2200,.8);tone('sine',170,55,.11,.8)},
  heavy(){noise(.2,.9,900,.6);tone('sine',130,32,.28,1);tone('square',90,40,.1,.25)},
  whiff(){noise(.06,.16,3200,2,'highpass')},
  guard(){tone('square',1500,1300,.05,.12);tone('triangle',2800,2100,.12,.15);noise(.04,.25,6000,3)},
  jump(){tone('square',240,560,.1,.06)},
  land(){noise(.06,.3,350,1,'lowpass')},
  knife(){tone('sawtooth',900,1600,.1,.05);noise(.1,.15,6000,4)},
  pick(){tone('square',660,660,.05,.1);tone('square',990,990,.08,.1,.06)},
  eat(){[523,659,784,1046].forEach((f,i)=>tone('square',f,f,.08,.09,i*.06))},
  throw(){noise(.2,.35,600,1);tone('sawtooth',220,80,.2,.12)},
  ko(){tone('sawtooth',320,40,.5,.15);noise(.35,.5,500,.7)},
  go(){tone('square',880,880,.09,.1);tone('square',1175,1175,.12,.1,.13)},
  alarm(){tone('sawtooth',300,900,.35,.13);tone('sawtooth',300,900,.35,.13,.4)},
  special(){noise(.4,.6,1300,.5);tone('sawtooth',90,700,.35,.18)},
  brk(){noise(.25,.6,700,.5);tone('square',300,60,.2,.12)},
  tell(){tone('triangle',1300,1900,.07,.09)},
  hurt(){tone('square',320,110,.15,.13);noise(.08,.4,1200,1)},
  combo(){tone('square',784,784,.06,.08);tone('square',1046,1046,.06,.08,.07);tone('square',1568,1568,.14,.08,.14)},
};


/* ---------------- 入力 ---------------- */
const IN={atk:0,jmp:0,dash:0,sp:0,start:0},HELD={atk:0},K={l:0,r:0,u:0,d:0};
const KC={ArrowLeft:'l',KeyA:'l',ArrowRight:'r',KeyD:'r',ArrowUp:'u',KeyW:'u',ArrowDown:'d',KeyS:'d'};
const KB={KeyJ:'atk',KeyZ:'atk',KeyK:'jmp',KeyX:'jmp',Space:'jmp',KeyL:'dash',KeyC:'dash',ShiftLeft:'dash',ShiftRight:'dash',KeyI:'sp',KeyV:'sp'};
const lastTap={l:-99,r:-99};
addEventListener('keydown',e=>{
  const k=KC[e.code],b=KB[e.code];
  if(k||b||e.code==='Enter')e.preventDefault();
  audioInit();touchMode=false;
  if(e.repeat)return;
  if(k){K[k]=1;if(k==='l'||k==='r'){if(FR-lastTap[k]<14)IN.dash=BUF;lastTap[k]=FR}}
  if(b){IN[b]=BUF;if(b==='atk')HELD.atk=1}
  if(e.code==='Enter'||b==='atk'||b==='jmp')IN.start=BUF;
});
addEventListener('keyup',e=>{const k=KC[e.code];if(k)K[k]=0;if(KB[e.code]==='atk')HELD.atk=0});
addEventListener('blur',()=>{K.l=K.r=K.u=K.d=0;HELD.atk=0});

let TB=[],STK={x:0,y:0,R:50,id:null,ox:0,oy:0,vx:0,vy:0};
function safeInsets(){
  try{const cs=getComputedStyle(document.documentElement);return['--sal','--sar','--sab'].map(v=>parseFloat(cs.getPropertyValue(v))||0)}catch(e){return[0,0,0]}
}
function layoutTouch(){
  const u=Math.min(SW,SH),[sl,sr,sb]=safeInsets(),m=u*.04,rx=SW-sr-m,by=SH-sb-m;
  const old={};for(const b of TB)old[b.k]=b.id;
  // 右親指の弧に沿って配置: 最頻の攻撃を最大・最下段に
  TB=[
    {k:'atk', label:'攻撃',    col:'#ff5a3c',r:u*.13, x:rx-u*.36,y:by-u*.17},
    {k:'jmp', label:'ジャンプ',col:'#3cc864',r:u*.10, x:rx-u*.11,y:by-u*.30},
    {k:'dash',label:'ダッシュ',col:'#3c8cff',r:u*.085,x:rx-u*.40,y:by-u*.47},
    {k:'sp',  label:'必殺',    col:'#c85aff',r:u*.075,x:rx-u*.14,y:by-u*.58},
  ];
  for(const b of TB)b.id=old[b.k]===undefined?null:old[b.k];
  STK.R=u*.14;STK.x=sl+m+u*.22;STK.y=by-u*.22;
}
function btnAt(x,y){let best=null,bd=1e9;for(const b of TB){const d=Math.hypot(x-b.x,y-b.y);if(d<b.r*1.25&&d<bd){bd=d;best=b}}return best}
function pressBtn(b){IN[b.k]=BUF;if(b.k==='atk')HELD.atk=1}
function tstart(e){
  e.preventDefault();touchMode=true;audioInit();
  for(const t of e.changedTouches){
    const x=t.clientX,y=t.clientY;IN.start=BUF;
    const b=btnAt(x,y);
    if(b){b.id=t.identifier;pressBtn(b)}
    else if(STK.id===null&&x<SW*.5){STK.id=t.identifier;STK.ox=x;STK.oy=y;STK.vx=STK.vy=0}
  }
}
function tmove(e){
  e.preventDefault();
  for(const t of e.changedTouches){
    const x=t.clientX,y=t.clientY;
    if(t.identifier===STK.id){
      let dx=x-STK.ox,dy=y-STK.oy;const d=Math.hypot(dx,dy);
      if(d>STK.R){STK.ox=x-dx/d*STK.R;STK.oy=y-dy/d*STK.R;dx=dx/d*STK.R;dy=dy/d*STK.R}// 指に追従
      STK.vx=dx/STK.R;STK.vy=dy/STK.R;continue;
    }
    const cur=TB.find(b=>b.id===t.identifier);
    if(cur){const nb=btnAt(x,y);if(nb&&nb!==cur){cur.id=null;if(cur.k==='atk')HELD.atk=0;nb.id=t.identifier;pressBtn(nb)}}// スライド入力
  }
}
function tend(e){
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===STK.id){STK.id=null;STK.vx=STK.vy=0}
    for(const b of TB)if(b.id===t.identifier){b.id=null;if(b.k==='atk')HELD.atk=0}
  }
}
cv.addEventListener('touchstart',tstart,{passive:false});
cv.addEventListener('touchmove',tmove,{passive:false});
cv.addEventListener('touchend',tend,{passive:false});
cv.addEventListener('touchcancel',tend,{passive:false});
cv.addEventListener('mousedown',()=>{audioInit();IN.start=BUF});
addEventListener('resize',resize);
function axis(){
  let x=K.r-K.l+STK.vx,y=K.d-K.u+STK.vy;const m=Math.hypot(x,y);
  if(m<.25)return[0,0];if(m>1){x/=m;y/=m}
  return[Math.abs(x)<.3?0:x,Math.abs(y)<.3?0:y];
}

/* ---------------- 状態 ---------------- */
let S={mode:'title',t:0,cam:0,shake:0};
let HI=0;try{HI=+localStorage.getItem('neonbrawl_hi')||0}catch(e){}
function mkEnt(type,x,y){
  const d=type==='p'?PDEF:ET[type];
  return{type,def:d,x,y,z:0,vx:0,vz:0,f:-1,hp:d.hp,max:d.hp,st:'idle',t:0,mv:null,mk:'',hitSet:new Set(),inv:0,flash:0,
    anim:0,moving:0,cd:rnd(40,90),side:1,seed:Math.random()*6,tok:false,tokT:0,turnT:0,jug:0,poise:0,proj:false,byP:false,
    blocks:0,slotD:rnd(0,45),rot:0,phase:1,sumT:0,plan:null,planT:0,bounced:false,lag:0,jk:0,jkUsed:false,held:null,gc:0,kneeT:0,knees:0,wpn:null,hpShow:0};
}
function newGame(){
  const p=mkEnt('p',80,280);p.f=1;
  S={mode:'play',t:0,cam:0,lock:null,next:0,area:-1,wave:-1,queue:[],spawnT:0,p,es:[],shots:[],waves:[],items:[],
    props:CRATES.map(c=>({x:c[0],y:c[1],hp:2,c:c[2],shk:0})),fx:[],
    hs:0,shake:0,slow:0,score:0,combo:0,comboT:0,maxCombo:0,kos:0,lives:2,banner:null,hint:{txt:'右へ進め！ 攻撃連打で4段コンボ',t:300},
    seen:{},tok:1,ag:1.3,cap:3,areaHit:false,lastE:null,lastET:0,endT:0,flashScr:0,go:1,time:0};
  for(const k in IN)IN[k]=0;
}
function banner(txt,sub,col){S.banner={txt,sub:sub||'',t:0,col:col||'#ffd84a'}}
function alive(){let n=0;for(const e of S.es)if(e.hp>0)n++;return n}
function mult(){return Math.min(4,1+Math.floor(S.combo/5)*.5)}
function comboAdd(){S.combo++;S.comboT=110;if(S.combo>S.maxCombo)S.maxCombo=S.combo}
function comboEnd(lost){
  if(S.combo>=5){
    if(lost)fxText(S.p.x,S.p.y-80,'COMBO BREAK','#f66',14);
    else{const b=S.combo*S.combo*5;S.score+=b;fxText(S.p.x,S.p.y-80,S.combo+' HIT COMBO +'+b,'#7ff',15);SFX.combo()}
  }
  S.combo=0;S.comboT=0;
}

/* ---------------- エフェクト ---------------- */
function fxText(x,y,txt,col,size){S.fx.push({k:'txt',x,y,txt,col,size:size||14,t:0,max:60})}
function fxHit(x,y,big,col){S.fx.push({k:'hit',x,y,t:0,max:big?14:9,big,col:col||'#fff6a0',a:Math.random()*6})}
function fxDust(x,y,n){for(let i=0;i<(n||3);i++)S.fx.push({k:'dust',x:x+rnd(-8,8),y,vx:rnd(-1.2,1.2),vy:rnd(-.8,-.2),t:0,max:22,r:rnd(3,6)})}

/* ---------------- 戦闘コア ---------------- */
function hittable(t){
  if(t.hp<=0||t.inv>0)return false;
  const st=t.st;
  if(st==='down'||st==='thrown'||st==='grabbed'||st==='roar'||st==='dead')return false;
  if(st==='air')return t!==S.p&&t.jug<2;// 空中追撃は2回まで
  if(t===S.p&&st==='dash'&&t.t<9)return false;// ダッシュ序盤は無敵（回避手段）
  return true;
}
function inBox(a,t,m){
  const s=t.def.s||1,dy=Math.abs(t.y-a.y),dz=Math.abs(t.z-a.z);
  if(dy>13+4*s||dz>(m.dz||36))return false;
  if(m.omni)return Math.abs(t.x-a.x)<(m.rng||40)+6*s;
  const dx=(t.x-a.x)*a.f;return dx>-8&&dx<(m.rng||40)+8*s;
}
function hitCheck(a,m,targets){
  let any=false;
  for(const t of targets){
    if(t===a||a.hitSet.has(t)||!hittable(t)||!inBox(a,t,m))continue;
    a.hitSet.add(t);if(applyHit(a,t,m))any=true;
  }
  return any;
}
function launch(t,dir,kb,vz){t.st='air';t.vx=dir*kb;t.vz=vz;t.z=Math.max(t.z,1);t.mv=null;t.bounced=false}
function applyHit(a,t,m){
  const isP=t===S.p,byP=a===S.p||!!a.byP,p=S.p;
  let dir=m.omni?(sgn(t.x-a.x)):a.f;
  const s=t.def.s||1,hx=t.x-dir*6,hy=t.y-t.z-30*s;
  // ガード兵: 正面からの通常攻撃を弾く
  if(!isP&&t.type==='d'&&t.st==='idle'&&t.f===-dir&&!m.guardbreak){
    t.blocks++;fxHit(hx,hy,false,'#8cf');SFX.guard();fxText(t.x,t.y-70,'GUARD','#8cf',12);
    S.hs=Math.max(S.hs,3);t.vx=dir*1;if(a===p)p.vx=-dir*2.5;
    if(t.blocks>=2){t.blocks=0;t.f=-dir;startAtk(t,EM.dcounter)}
    return false;
  }
  const dmg=m.dmg||0;
  t.hp-=dmg;t.flash=8;t.hpShow=150;
  S.hs=Math.max(S.hs,m.hs||4);S.shake=Math.max(S.shake,m.shake||(m.hs||4)*.4);
  if(dmg>0){fxHit(hx,hy,m.heavy||m.down,isP?'#ff8080':null);(m.heavy||m.down?SFX.heavy:SFX.hit)()}
  if(byP&&!isP){comboAdd();S.score+=10*mult();S.lastE=t;S.lastET=200}
  if(isP&&dmg>0){
    SFX.hurt();S.areaHit=true;if(S.combo)comboEnd(true);
    if(p.held)releaseGrab(2);
    if(p.wpn&&(m.down||t.hp<=0)){S.items.push({kind:p.wpn.k,dur:p.wpn.dur,x:p.x,y:p.y,z:20,vz:3});p.wpn=null}
  }
  if(a===p&&m.weapon&&p.wpn){if(--p.wpn.dur<=0){p.wpn=null;SFX.brk();fxText(p.x,p.y-70,'バットが折れた！','#fa6',12)}}
  if(t.tok){t.tok=false;t.cd=rnd(30,60)}
  const ko=t.hp<=0;
  if(t.st==='grabbed'&&!ko)return true;
  if(t.st==='grabbed'&&ko){p.held=null;p.st='idle'}
  if(ko){
    t.hp=0;launch(t,dir,Math.max(m.kb||0,4)+2,6);t.proj=byP;t.byP=byP;t.hitSet.clear();
    if(!isP)onKO(t);
    return true;
  }
  const armored=!isP&&((t.type==='t'&&t.st==='atk')||(t.type==='b'&&!['stun','rec','hurt','air','down'].includes(t.st)));
  if(armored){
    if(t.type==='b'){t.poise+=dmg+(m.big?30:0);if(t.poise>=50){t.poise=0;launch(t,dir,4,4);t.byP=byP;return true}}
    t.vx=dir*.6;return true;
  }
  if(m.down||t.st==='air'){
    launch(t,dir,m.kb||3,m.launch||3.5);t.jug++;t.byP=byP;t.proj=byP&&(m.kb||0)>=6;t.hitSet.clear();
  }else if(t.st==='stun'||t.st==='rec'){
    t.vx=dir*(m.kb||1)*.5;// ピヨり中はタイマーを延ばさない（無限防止）
  }else{
    t.st='hurt';t.t=(m.stun||16)*(t.type==='t'||t.type==='b'?.65:1);t.vx=dir*(m.kb||1)*(t.type==='t'?.4:1);t.mv=null;
    if(!isP)t.f=-dir;
  }
  return true;
}
function onKO(e){
  if(e.koDone)return;e.koDone=1;
  const sc=Math.round(e.def.sc*mult());S.score+=sc;S.kos++;
  fxText(e.x,e.y-75,'+'+sc,'#ffd84a',14);SFX.ko();
  const drop=k=>S.items.push({kind:k,dur:k==='bat'?14:1,x:e.x,y:e.y,z:20,vz:3});
  if(e.type==='k')drop('knife');
  else if(e.type==='t'){if(Math.random()<.6)drop('meat')}
  else if(e.type!=='b'&&Math.random()<.12)drop('apple');
  if(e.type==='b'){
    S.slow=110;S.hs=26;S.shake=18;S.endT=230;S.flashScr=1;
    for(const o of S.es)if(o!==e&&o.hp>0){o.hp=0;launch(o,sgn(o.x-e.x),5,5);o.koDone=1}
  }else if(!S.queue.length&&alive()===0&&S.lock!==null&&S.wave>=AREAS[S.area].waves.length-1){S.slow=45}
}
function releaseGrab(push){const p=S.p,e=p.held;p.held=null;if(e&&e.st==='grabbed'){e.st='hurt';e.t=12;e.vx=p.f*push}}
function doThrow(dir){
  const p=S.p,e=p.held;if(!e)return;p.held=null;p.f=dir;
  e.st='thrown';e.x=p.x+dir*8;e.z=12;e.vz=4.8;e.vx=dir*(e.type==='t'?5:7.5);e.byP=true;e.proj=true;e.hitSet.clear();e.rot=0;e.bounced=false;
  p.st='throw';p.t=0;SFX.throw();S.hs=Math.max(S.hs,5);
}
function land(e){
  const st=e.st;
  if(st==='air'||st==='thrown'){
    if(st==='thrown'){
      e.st='air';
      if(e.hp>0){e.hp-=MV.thr.dmg;e.flash=8;e.hpShow=150;if(e.byP){comboAdd();S.score+=20*mult()}if(e.hp<=0){e.hp=0;onKO(e)}}
      S.shake=Math.max(S.shake,8);S.hs=Math.max(S.hs,5);SFX.heavy();fxHit(e.x,e.y-6,true);
    }
    if(!e.bounced&&e.vz<-3){e.bounced=true;e.vz=-e.vz*.38;e.z=.1;e.vx*=.6;SFX.land();fxDust(e.x,e.y,4);S.shake=Math.max(S.shake,2)}
    else{e.vz=0;e.st='down';e.t=0;e.proj=false;e.vx*=.5;fxDust(e.x,e.y,3)}
  }else if(st==='jump'){e.st='idle';e.vz=0;e.lag=4;e.jk=0;SFX.land();fxDust(e.x,e.y,2)}
  else e.vz=0;
}
function phys(e){
  if(e.st==='grabbed'||e.st==='bjump')return;
  if(e.z>0||e.vz>0){e.vz-=G;e.z+=e.vz;if(e.z<=0){e.z=0;land(e)}}
  e.x+=e.vx;
  if(e.z<=0&&e.st!=='dash'&&e.st!=='charge')e.vx*=.75;
  e.y=clamp(e.y,Y0,Y1);
  const L=S.cam+10,R=(S.lock!==null?S.cam+W:STAGE_END)-10;
  if(e===S.p||e.st==='air'||e.st==='thrown'){
    if(e.x<L){e.x=L;if(e.vx<-2&&e!==S.p){e.vx=-e.vx*.5;S.shake=Math.max(S.shake,4);SFX.land();fxHit(e.x,e.y-e.z-20,false)}}
    if(e.x>R){e.x=R;if(e.vx>2&&e!==S.p){e.vx=-e.vx*.5;S.shake=Math.max(S.shake,4);SFX.land();fxHit(e.x,e.y-e.z-20,false)}}
  }else if(e.st!=='enter'&&S.lock!==null)e.x=clamp(e.x,L-4,R+4);
}

/* ---------------- プレイヤー ---------------- */
function pAtk(k){const p=S.p;p.st='atk';p.mk=k;p.mv=MV[k];p.t=0;p.hitSet.clear();p.hit=false}
function pJump(vx){const p=S.p;p.st='jump';p.vz=7.2;p.z=.1;p.vx=vx;p.jkUsed=false;p.jk=0;SFX.jump()}
function pDash(ax){const p=S.p;if(ax)p.f=sgn(ax);p.st='dash';p.t=0;SFX.whiff();fxDust(p.x,p.y,3)}
function nearItem(p,weapon){return S.items.find(i=>i.z<=0&&Math.abs(i.x-p.x)<24&&Math.abs(i.y-p.y)<14&&(weapon?(i.kind==='bat'||i.kind==='knife'):(i.kind==='apple'||i.kind==='meat')))}
function hitProps(p,m){
  for(const o of S.props){
    if(p.hitSet.has(o))continue;
    const dx=(o.x-p.x)*(m.omni?sgn(o.x-p.x):p.f);
    if(dx>-10&&dx<(m.rng||40)+12&&Math.abs(o.y-p.y)<16&&p.z<40){
      p.hitSet.add(o);o.hp--;o.shk=8;S.hs=Math.max(S.hs,3);SFX.hit();fxHit(o.x,o.y-14,false);
      if(o.hp<=0){o.dead=1;SFX.brk();S.shake=Math.max(S.shake,4);S.score+=50;
        for(let i=0;i<6;i++)S.fx.push({k:'chip',x:o.x,y:o.y,z:14,vx:rnd(-3,3),vz:rnd(2,5),t:0,max:40});
        S.items.push({kind:o.c,dur:o.c==='bat'?14:1,x:o.x,y:o.y,z:10,vz:3.5})}
    }
  }
}
function parry(p,m){
  for(const s of S.shots)if(s.owner==='e'&&!s.dead){
    const dx=(s.x-p.x)*p.f;
    if(dx>-10&&dx<(m.rng||40)+14&&Math.abs(s.y-p.y)<16){s.dead=1;S.hs=Math.max(S.hs,6);SFX.guard();fxHit(s.x,s.y-s.z,true,'#aef');fxText(s.x,s.y-60,'PARRY! +'+100*mult(),'#aef',13);S.score+=100*mult()}
  }
}
function tryGrab(p,ax){
  if(!ax||sgn(ax)!==p.f){p.gc=0;return}
  const e=S.es.find(e=>e.hp>0&&e.type!=='b'&&e.z<2&&Math.abs(e.y-p.y)<9&&(e.x-p.x)*p.f>0&&(e.x-p.x)*p.f<26&&
    (e.st==='idle'||e.st==='hurt'||e.st==='stun'||e.st==='enter')&&!(e.type==='t'&&e.st==='idle'));
  if(!e){p.gc=0;return}
  if(++p.gc<7)return;
  p.gc=0;p.st='grab';p.t=0;p.held=e;p.knees=0;e.st='grabbed';e.tok=false;e.mv=null;e.vx=0;SFX.land();tone('square',140,90,.08,.12);
}
function updPlayer(){
  const p=S.p,[ax,ay]=axis();
  if(p.flash>0)p.flash--;if(p.inv>0)p.inv--;if(p.lag>0)p.lag--;if(p.kneeT>0)p.kneeT--;
  p.moving=0;
  switch(p.st){
  case 'idle':{
    if(p.lag>0)break;
    if(IN.sp&&p.hp>MV.sp.cost){IN.sp=0;p.hp-=MV.sp.cost;pAtk('sp');p.inv=MV.sp.dur;SFX.special();S.shake=5;fxText(p.x,p.y-80,'-'+MV.sp.cost+'HP','#f8a',11);break}
    if(IN.jmp){IN.jmp=0;pJump(ax*2.6);break}
    if(IN.dash){IN.dash=0;pDash(ax);break}
    if(IN.atk){
      IN.atk=0;
      const it=!p.wpn&&nearItem(p,true);
      if(it){it.dead=1;p.wpn={k:it.kind,dur:it.dur};SFX.pick();fxText(p.x,p.y-70,it.kind==='bat'?'バット！':'ナイフ！','#fff',12);break}
      if(p.wpn&&p.wpn.k==='knife'){pAtk('kt');p.wpn=null;S.shots.push({x:p.x+p.f*14,y:p.y,z:30,vx:p.f*8,f:p.f,owner:'p',byP:true,life:90,hitSet:new Set()});SFX.knife();break}
      if(ax)p.f=sgn(ax);
      pAtk(p.wpn?'b1':'j1');break;
    }
    p.x+=ax*2.3;p.y+=ay*1.6;if(ax)p.f=sgn(ax);
    if(ax||ay){p.moving=1;p.anim+=.22}
    tryGrab(p,ax);
    break}
  case 'atk':{
    const m=p.mv;p.t++;
    if(p.t===2&&m.lunge)p.vx=p.f*m.lunge;
    if(p.t===m.act[0])SFX.whiff();
    if(p.mk==='sp'&&p.t%8===0)SFX.whiff();
    if(p.t>=m.act[0]&&p.t<=m.act[1]){if(hitCheck(p,m,S.es))p.hit=true;hitProps(p,m);parry(p,m)}
    if(m.cancel&&p.t>=m.cancel&&p.hit){
      if(IN.jmp){IN.jmp=0;pJump(ax*2.6);break}
      if(IN.dash){IN.dash=0;pDash(ax);break}
      if(IN.atk&&m.next){IN.atk=0;if(ax)p.f=sgn(ax);pAtk(m.next);break}
    }
    if(p.t>=m.dur)p.st='idle';
    break}
  case 'jump':{
    p.vx=clamp(p.vx+ax*.15,-Math.max(3.2,Math.abs(p.vx)),Math.max(3.2,Math.abs(p.vx)));p.y+=ay*1.1;
    if(ax&&!p.jk)p.f=sgn(ax);
    if(IN.atk&&!p.jkUsed){IN.atk=0;p.jkUsed=true;p.jk=1;p.hitSet.clear();SFX.whiff()}
    if(p.jk){p.jk++;if(p.jk>=MV.jk.act[0]&&p.jk<=MV.jk.act[1]){hitCheck(p,MV.jk,S.es);hitProps(p,MV.jk)}}
    break}
  case 'dash':
    p.t++;p.vx=p.f*(p.t<12?6.2:3);p.y+=ay*1.2;if(p.t%4===0)fxDust(p.x-p.f*8,p.y,1);
    if(IN.atk){IN.atk=0;pAtk('dk');p.vx=p.f*5.5}
    else if(IN.jmp){IN.jmp=0;pJump(p.f*4.8)}
    else if(p.t>=18){p.st='idle';p.lag=3}
    break;
  case 'grab':{
    const e=p.held;p.t++;
    if(!e||e.st!=='grabbed'){p.st='idle';p.held=null;break}
    e.x=p.x+p.f*20;e.y=p.y+.1;e.z=0;e.f=-p.f;
    if(IN.atk){IN.atk=0;
      if(ax&&sgn(ax)!==p.f)doThrow(-p.f);
      else if(p.knees<2){p.knees++;p.kneeT=12;p.hitSet.clear();applyHit(p,e,MV.knee);if(p.held)p.t=Math.min(p.t,60)}
      else doThrow(p.f);
    }else if(IN.jmp){IN.jmp=0;doThrow(ax?sgn(ax):p.f)}
    else if(p.t>120){releaseGrab(3);p.st='idle'}
    break}
  case 'throw':if(++p.t>=16)p.st='idle';break;
  case 'hurt':if(--p.t<=0)p.st='idle';break;
  case 'down':
    if(++p.t>=45){
      if(p.hp>0){p.st='idle';p.inv=70}
      else if(S.lives>0){
        S.lives--;p.hp=p.max;p.st='idle';p.inv=150;S.shake=10;SFX.special();fxText(p.x,p.y-80,'REVIVE!','#7f7',16);
        for(const e of S.es)if(e.hp>0&&hittable(e)&&Math.abs(e.x-p.x)<220){launch(e,sgn(e.x-p.x),6,4);e.tok=false}
      }else{p.st='dead';endGame('over')}
    }
    break;
  }
  phys(p);
}

/* ---------------- 敵 ---------------- */
function startAtk(e,m){e.st='atk';e.mv=m;e.t=0;e.hitSet.clear();if(m.tell){SFX.tell()}}
function endAtk(e){
  const m=e.mv;
  if(m&&m.next){startAtk(e,EM[m.next]);return}
  e.st='idle';e.mv=null;e.tok=false;e.cd=rnd(e.def.cd[0],e.def.cd[1])*S.ag*(e.phase===2?.6:1);
}
function takeTok(e){
  if(e.tok)return true;
  let n=0;for(const o of S.es)if(o.tok)n++;
  if(n<S.tok){e.tok=true;e.tokT=0;return true}
  return false;
}
function canTarget(p){return p.hp>0&&p.st!=='down'&&p.st!=='air'&&p.st!=='dead'&&p.inv<=0}
function moveTo(e,tx,ty,spd){
  tx=clamp(tx,S.cam+24,S.cam+W-24);
  const dx=tx-e.x,dy=ty-e.y,d=Math.hypot(dx,dy);
  if(d>3){e.x+=dx/d*spd;e.y+=dy/d*spd*.7;e.anim+=spd*.13;e.moving=1}
}
function ai(e){
  const p=S.p,d=e.def,dx=p.x-e.x,dy=p.y-e.y,adx=Math.abs(dx),want=sgn(dx);
  if(want!==e.f){if(++e.turnT>d.turn){e.f=want;e.turnT=0}}else e.turnT=0;
  const ok=canTarget(p);e.cd--;
  if(e.tok&&++e.tokT>200){e.tok=false;e.cd=60}
  if(e.type==='b')return aiBoss(e,dx,dy,adx,want,ok);
  if(e.type==='k'){
    const corner=e.x<=S.cam+28||e.x>=S.cam+W-28,flee=adx<110&&!corner;
    moveTo(e,p.x-want*(flee?270:200),p.y+(flee?(e.y>p.y?20:-20):0),d.spd*(flee?1.4:1));
    if(ok&&e.cd<=0&&Math.abs(dy)<10&&adx>(corner?30:90)&&adx<340&&e.f===want)startAtk(e,EM.kthrow);
    return;
  }
  if(e.type==='r'){
    moveTo(e,p.x-want*190,p.y,d.spd);
    if(ok&&e.cd<=0&&Math.abs(dy)<12&&adx>90&&adx<320&&e.f===want&&takeTok(e))startAtk(e,EM.rwind);
    return;
  }
  // 近接型: トークン保持者だけが踏み込み、他は左右の待機位置で回り込む
  if(ok&&e.cd<=0&&takeTok(e)){
    const onSide=sgn(e.x-p.x)===e.side;
    let ty=p.y;
    if(!onSide&&Math.abs(dy)<26)ty=p.y+(e.y>p.y?42:-42);// 回り込み
    moveTo(e,p.x+e.side*d.rng*.75,ty,d.spd);
    if(adx<d.rng+4&&Math.abs(dy)<9&&e.f===want)
      startAtk(e,e.type==='t'?EM.tslam:e.type==='d'?EM.djab:(Math.random()<.7?EM.gjab:EM.ghook));
  }else{
    moveTo(e,p.x+e.side*(88+e.slotD),p.y+Math.sin(S.t*.025+e.seed)*30,d.spd*.7);
  }
}
function aiBoss(e,dx,dy,adx,want,ok){
  const p=S.p,d=e.def;
  if(e.phase===1&&e.hp<e.max*.5){
    e.phase=2;e.st='roar';e.t=0;e.inv=70;SFX.alarm();S.shake=12;banner('ザンバ 激昂！','攻撃が速くなり、手下を呼ぶ','#f55');
    S.queue.push('g','g');return;
  }
  if(e.phase===2&&++e.sumT>700&&alive()<3){e.sumT=0;S.queue.push(Math.random()<.5?'g':'k')}
  const spd=d.spd*(e.phase===2?1.3:1);
  if(!ok){moveTo(e,p.x+e.side*150,p.y,spd*.6);return}
  if(e.cd>0){moveTo(e,p.x-want*110,p.y,spd*.6);return}
  if(!e.plan){const r=Math.random();e.plan=adx<90?(r<.65?'combo':'slam'):adx>170?(r<.6?'charge':'slam'):(r<.5?'combo':r<.8?'slam':'charge');e.planT=0}
  if(++e.planT>170){e.plan=null;e.cd=20;return}
  if(e.plan==='combo'){moveTo(e,p.x-want*44,p.y,spd*1.2);if(adx<62&&Math.abs(dy)<10&&e.f===want){startAtk(e,EM.bp1);e.plan=null}}
  else if(e.plan==='charge'){moveTo(e,adx<170?p.x-want*220:e.x,p.y,spd);if(Math.abs(dy)<8&&adx>120&&e.f===want){startAtk(e,EM.bchargeW);e.plan=null}}
  else{e.st='bjump';e.t=0;e.plan=null;SFX.jump();tone('sawtooth',120,300,.3,.12);fxText(e.x,e.y-110,'!!','#f44',22)}
}
function updEnemyAtk(e){
  const m=e.mv,t0=e.t;e.t+=e.phase===2?1.3:1;
  const cross=k=>t0<k&&e.t>=k;
  if(m.lunge&&cross(m.wind))e.vx=e.f*m.lunge;
  if(m.shoot&&cross(m.wind)){S.shots.push({x:e.x+e.f*14,y:e.y,z:30,vx:e.f*5.5,f:e.f,owner:'e',life:120});SFX.knife()}
  if(m.charge&&cross(m.wind)){e.st='charge';e.t=0;e.hitSet.clear();SFX.whiff();return}
  if(m.act&&e.t>=m.wind&&e.t<m.wind+m.act){if(cross(m.wind))SFX.whiff();hitCheck(e,m,[S.p])}
  if(e.t>=m.dur)endAtk(e);
}
function updEnemy(e){
  const p=S.p,d=e.def;
  if(e.flash>0)e.flash--;if(e.inv>0)e.inv--;if(e.hpShow>0)e.hpShow--;
  e.moving=0;
  switch(e.st){
  case 'enter':{
    const tx=clamp(e.x,S.cam+40,S.cam+W-40);e.f=sgn(tx-e.x);e.x+=e.f*d.spd*1.4;e.anim+=.2;e.moving=1;
    e.y+=(clamp(p.y,Y0+10,Y1-10)-e.y)*.01;
    if(Math.abs(e.x-tx)<4)e.st='idle';
    break}
  case 'idle':ai(e);break;
  case 'atk':updEnemyAtk(e);break;
  case 'charge':{
    const b=e.type==='b';e.t++;e.vx=e.f*(b?8.5:7);if(e.t%3===0)fxDust(e.x-e.f*10,e.y,1);
    if(e.t%10===1)noise(.08,.2,300,1,'lowpass');
    hitCheck(e,b?EM.bcharge:EM.rcharge,[p]);
    const wall=e.x<=S.cam+14||e.x>=S.cam+W-14,passed=(e.x-p.x)*e.f>100;
    if(b&&wall){e.st='stun';e.t=90;e.vx=-e.f*3;S.shake=12;S.hs=8;SFX.heavy();fxHit(e.x+e.f*10,e.y-60,true);fxText(e.x,e.y-110,'CRASH!','#ff0',18);e.cd=0}
    else if(!b&&(wall||passed||e.t>70)){e.st='stun';e.t=42;e.vx*=.4;e.tok=false;e.cd=rnd(d.cd[0],d.cd[1])*S.ag}
    else if(b&&(passed&&e.t>40||e.t>80)){e.st='rec';e.t=30;e.vx*=.3}
    break}
  case 'hurt':if(--e.t<=0){e.st='idle';e.side=sgn(e.x-p.x)}break;
  case 'stun':case 'rec':if(--e.t<=0){e.st='idle';e.cd=Math.min(e.cd,40);e.tok=false}break;
  case 'down':
    e.t++;
    if(e.hp<=0){if(e.t>55)e.dead=true}
    else if(e.t>(e.type==='b'?34:46)){e.st='idle';e.inv=24;e.jug=0;e.side=sgn(e.x-p.x);e.cd=Math.max(e.cd,30)}
    break;
  case 'thrown':e.rot+=.28*sgn(e.vx);break;
  case 'roar':
    if(++e.t===20){S.shake=14;fxHit(e.x,e.y-60,true,'#f66');if(Math.abs(p.x-e.x)<170&&canTarget(p))applyHit(e,p,EM.roar)}
    if(e.t>60)e.st='idle';
    break;
  case 'bjump':{
    e.t++;const hover=e.phase===2?28:40;
    if(e.t<=20)e.z+=(150-e.z)*.25;
    else if(e.t<=20+hover){e.z=150;e.x+=(clamp(p.x,S.cam+40,S.cam+W-40)-e.x)*.06;e.y+=(p.y-e.y)*.06}
    else{e.z-=15;if(e.z<=0){
      e.z=0;e.vz=0;S.shake=16;S.hs=6;SFX.heavy();fxDust(e.x,e.y,8);e.hitSet.clear();hitCheck(e,EM.bstomp,[p]);
      S.waves.push({x:e.x,y:e.y,r:10,hit:false});if(e.phase===2)S.waves.push({x:e.x,y:e.y,r:-50,hit:false});
      e.st='rec';e.t=50;
    }}
    break}
  }
  phys(e);
}
function rebalance(){
  const mel=S.es.filter(e=>e.hp>0&&'gtd'.includes(e.type)&&e.st!=='enter');
  const L=mel.filter(e=>e.side<0),R=mel.filter(e=>e.side>0);
  if(Math.abs(L.length-R.length)>=2){
    const big=L.length>R.length?L:R,cand=big.filter(e=>!e.tok);
    if(cand.length){const far=cand.reduce((a,b)=>Math.abs(b.x-S.p.x)>Math.abs(a.x-S.p.x)?b:a);far.side=-far.side}
  }
}
function separate(){
  const es=S.es;
  for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
    const a=es[i],b=es[j];
    if(a.z>0||b.z>0||a.hp<=0||b.hp<=0||a.st==='grabbed'||b.st==='grabbed')continue;
    const dx=b.x-a.x;
    if(Math.abs(dx)<20&&Math.abs(b.y-a.y)<10){const s=dx<0?-.7:.7;a.x-=s;b.x+=s}
  }
}
function spawn(type){
  let side=type==='k'?(S.p.x-S.cam<W/2?1:-1):(Math.random()<.5?-1:1);
  if(type==='b')side=1;
  const e=mkEnt(type,side>0?S.cam+W+40:S.cam-40,rnd(Y0+15,Y1-15));
  e.st='enter';e.side=side;e.f=-side;e.cd=rnd(40,80)*S.ag;
  S.es.push(e);
  if(!S.seen[type]){S.seen[type]=1;S.hint={txt:HINT[type],t:330}}
  if(type==='b'){banner('BOSS','ボス ザンバ','#f55');SFX.alarm()}
}

/* ---------------- 進行 ---------------- */
function startArea(i){
  const a=AREAS[i];S.area=i;S.lock=a.cam;S.cam=a.cam;S.wave=-1;S.areaHit=false;S.go=0;
  S.tok=a.tok;S.ag=a.ag;S.cap=a.cap;
  if(!a.boss)banner(a.name,'敵を全滅させろ！');
  nextWave();
}
function nextWave(){
  S.wave++;S.queue=AREAS[S.area].waves[S.wave].slice();S.spawnT=a0(S.wave);
  if(S.wave>0)fxText(S.p.x,S.p.y-90,'WAVE '+(S.wave+1)+'/'+AREAS[S.area].waves.length,'#fff',14);
}
function a0(w){return w?40:60}
function areaClear(){
  const a=AREAS[S.area];
  if(!S.areaHit){S.score+=3000;fxText(S.p.x,S.p.y-100,'NO DAMAGE +3000','#7f7',15)}
  if(a.boss)return;
  S.lock=null;S.next=S.area+1;S.go=1;SFX.go();banner('AREA CLEAR','GO →','#7ff');
}
function updFlow(){
  const p=S.p;
  if(S.lock===null){
    const nx=AREAS[S.next];
    const tgt=Math.min(p.x-W*.42,nx?nx.cam:STAGE_END-W);
    if(tgt>S.cam)S.cam+=Math.min(tgt-S.cam,4);
    if(nx&&S.cam>=nx.cam-.5){S.cam=nx.cam;startArea(S.next)}
    return;
  }
  if(S.queue.length&&alive()<S.cap&&--S.spawnT<=0){spawn(S.queue.shift());S.spawnT=45}
  const last=S.wave>=AREAS[S.area].waves.length-1,n=alive();
  if(!S.queue.length&&!last&&n<=1)nextWave();
  else if(!S.queue.length&&last&&n===0&&!S.endT&&!AREAS[S.area].boss)areaClear();
}
function endGame(mode){
  if(mode==='clear'){S.score+=S.lives*5000;areaClear()}
  S.mode=mode;S.t=0;
  if(S.score>HI){HI=S.score;S.newHi=1;try{localStorage.setItem('neonbrawl_hi',HI)}catch(e){}}
}
function rank(){return S.score>=90000?'S':S.score>=60000?'A':S.score>=35000?'B':'C'}

/* ---------------- メインループ ---------------- */
function decIN(){for(const k in IN)if(IN[k]>0)IN[k]--}
function updFx(){
  for(const f of S.fx){
    f.t++;
    if(f.k==='dust'){f.x+=f.vx;f.y+=f.vy}
    else if(f.k==='txt')f.y-=.6;
    else if(f.k==='chip'){f.x+=f.vx;f.vz-=G;f.z+=f.vz;if(f.z<0){f.z=0;f.vz*=-.3;f.vx*=.5}}
  }
  S.fx=S.fx.filter(f=>f.t<f.max);
}
function update(){
  FR++;
  if(S.mode!=='play'){S.t++;if((IN.start||IN.atk)&&S.t>40){audioInit();newGame()}decIN();return}
  if(HELD.atk&&FR%9===0)IN.atk=Math.max(IN.atk,4);// 押しっぱなしで連打扱い（スマホの指の負担軽減）
  if(S.hs>0){S.hs--;S.shake*=.92;return}// ヒットストップ中は入力バッファを保持
  if(S.slow>0){S.slow--;if(S.slow%3){updFx();return}}
  S.t++;S.time++;
  const p=S.p;
  updPlayer();
  for(const e of S.es)updEnemy(e);
  // 吹っ飛び中の体が他の敵を巻き込む
  for(const e of S.es){
    if(!e.proj||(e.st!=='thrown'&&e.st!=='air'))continue;
    e.f=sgn(e.vx);
    for(const o of S.es)if(o!==e&&!e.hitSet.has(o)&&hittable(o)&&Math.abs(o.x-e.x)<26&&Math.abs(o.y-e.y)<14&&e.z<40){
      e.hitSet.add(o);applyHit(e,o,MV.body);
    }
  }
  for(const s of S.shots){
    s.x+=s.vx;if(--s.life<=0)s.dead=1;
    if(s.owner==='e'){
      if(hittable(p)&&Math.abs(p.x-s.x)<14&&Math.abs(p.y-s.y)<12&&p.z<22){s.dead=1;applyHit(s,p,EM.eknife)}
    }else for(const e of S.es)if(!s.dead&&hittable(e)&&Math.abs(e.x-s.x)<18&&Math.abs(e.y-s.y)<14&&e.z<34){s.dead=1;applyHit(s,e,MV.pknife)}
    if(s.x<S.cam-40||s.x>S.cam+W+40)s.dead=1;
  }
  for(const w of S.waves){
    w.r+=5;if(w.r<=0)continue;
    const dd=Math.hypot(p.x-w.x,(p.y-w.y)*2.6);
    if(!w.hit&&Math.abs(dd-w.r)<12&&p.z<5&&hittable(p)){w.hit=true;applyHit({x:w.x,y:w.y,z:0,f:1,byP:false},p,EM.wave)}
  }
  S.waves=S.waves.filter(w=>w.r<170);
  for(const it of S.items){
    if(it.z>0||it.vz>0){it.vz-=G;it.z+=it.vz;if(it.z<=0){it.z=0;it.vz=0}}
  }
  const food=p.st!=='down'&&p.st!=='air'&&p.st!=='dead'&&p.z<10&&nearItem(p,false);
  if(food){
    food.dead=1;const v=food.kind==='meat'?60:25;
    if(p.hp>=p.max){S.score+=1000;fxText(p.x,p.y-70,'満腹ボーナス +1000','#ffd84a',12)}
    else fxText(p.x,p.y-70,'+'+v+'HP','#7f7',13);
    p.hp=Math.min(p.max,p.hp+v);SFX.eat();
  }
  for(const o of S.props)if(o.shk>0)o.shk--;
  S.es=S.es.filter(e=>!e.dead);S.shots=S.shots.filter(s=>!s.dead);S.items=S.items.filter(i=>!i.dead);S.props=S.props.filter(o=>!o.dead);
  if(S.t%45===0)rebalance();
  separate();
  updFlow();
  updFx();
  if(S.comboT>0&&--S.comboT===0)comboEnd(false);
  if(S.lastET>0)S.lastET--;
  if(S.hint&&--S.hint.t<=0)S.hint=null;
  if(S.banner&&++S.banner.t>150)S.banner=null;
  if(S.flashScr>0)S.flashScr-=.04;
  if(S.endT>0&&--S.endT===0){if(S.combo)comboEnd(false);endGame('clear')}
  S.shake*=.86;
  decIN();
}

/* ---------------- 描画 ---------------- */
function areaAt(x){let i=0;for(let k=0;k<AREAS.length;k++)if(x>=AREAS[k].cam-500)i=k;return i}
function drawBG(cam){
  const ai=areaAt(cam),sk=SKY[ai];
  let g=ctx.createLinearGradient(0,0,0,Y0-50);g.addColorStop(0,sk[0]);g.addColorStop(1,sk[1]);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,Y0-40);
  ctx.fillStyle='rgba(255,240,200,.8)';ctx.beginPath();ctx.arc(520-cam*.02,48,16,0,7);ctx.fill();
  // 遠景
  let f=cam*.2;ctx.fillStyle='rgba(10,8,20,.75)';
  for(let i=Math.floor(f/50)-1;i<Math.floor((f+W)/50)+2;i++){const h=40+hash(i)*80;ctx.fillRect(i*50-f,Y0-60-h,46,h+20)}
  // 中景ビル＋ネオン
  f=cam*.5;
  for(let i=Math.floor(f/110)-1;i<Math.floor((f+W)/110)+2;i++){
    const h=70+hash(i+50)*70,x=i*110-f;
    ctx.fillStyle='#15121f';ctx.fillRect(x,Y0-70-h,96,h+10);
    ctx.fillStyle='rgba(255,220,120,.55)';
    for(let r=0;r<h/16-1;r++)for(let c=0;c<4;c++)if(hash(i*31+r*7+c)>.45)ctx.fillRect(x+8+c*22,Y0-62-h+r*16,10,8);
    if(hash(i+9)>.4){
      const on=hash(i+FR/40|0)>.08,cols=['#ff3c8c','#3cf0ff','#ffd23c','#8cff3c'];
      ctx.font='bold 13px sans-serif';ctx.textAlign='center';
      ctx.fillStyle=on?cols[i&3]:'#333';ctx.shadowColor=cols[i&3];ctx.shadowBlur=on?10:0;
      ctx.fillText(SIGNS[(i>>>0)%SIGNS.length],x+48,Y0-78-h*.3);ctx.shadowBlur=0;
    }
  }
  // 奥の壁（等速）
  ctx.fillStyle=WALL[ai];ctx.fillRect(0,Y0-70,W,64);
  for(let i=Math.floor(cam/160)-1;i<Math.floor((cam+W)/160)+2;i++){
    const x=i*160-cam,k=hash(i+200);
    if(k<.4){ctx.fillStyle='#55505a';ctx.fillRect(x+10,Y0-64,120,54);ctx.fillStyle='#45404a';for(let y=0;y<54;y+=6)ctx.fillRect(x+10,Y0-64+y,120,2)}// シャッター
    else if(k<.7){ctx.strokeStyle='#666';ctx.lineWidth=1;for(let y=0;y<56;y+=8){ctx.beginPath();ctx.moveTo(x,Y0-66+y);ctx.lineTo(x+150,Y0-66+y);ctx.stroke()}}// フェンス
    else{ctx.fillStyle='rgba(255,60,140,.35)';ctx.fillRect(x+30,Y0-56,80,20);ctx.fillStyle='rgba(60,240,255,.3)';ctx.fillRect(x+60,Y0-34,60,14)}// 落書き
    // 街灯
    ctx.fillStyle='#222';ctx.fillRect(x+150,Y0-120,4,114);ctx.fillRect(x+138,Y0-120,18,4);
    ctx.fillStyle='rgba(255,230,160,.9)';ctx.fillRect(x+138,Y0-116,10,4);
    ctx.fillStyle='rgba(255,230,160,.06)';ctx.beginPath();ctx.moveTo(x+143,Y0-114);ctx.lineTo(x+100,Y0+40);ctx.lineTo(x+190,Y0+40);ctx.fill();
  }
  // 歩道と道路
  ctx.fillStyle='#5a5660';ctx.fillRect(0,Y0-8,W,26);
  ctx.fillStyle='#4a4650';for(let i=Math.floor(cam/40);i<(cam+W)/40+1;i++)ctx.fillRect(i*40-cam,Y0-8,2,26);
  ctx.fillStyle='#33303a';ctx.fillRect(0,Y0+18,W,H-Y0-18);
  ctx.fillStyle='#d8c84a';for(let i=Math.floor(cam/80);i<(cam+W)/80+1;i++)ctx.fillRect(i*80-cam,Y0+70,40,3);
  ctx.fillStyle='#777';ctx.fillRect(0,Y0+16,W,3);
}
function limb(ax,ay,bx,by,seg,bend,col,w){
  const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1,h=Math.sqrt(Math.max(0,seg*seg-L*L/4));
  const mx=(ax+bx)/2-dy/L*h*bend,my=(ay+by)/2+dx/L*h*bend;
  ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(mx,my);ctx.lineTo(bx,by);ctx.stroke();
}
function pose(e){
  const P={lean:0,fh:[9,-37],bh:[2,-33],ff:[5,0],bf:[-6,0],cr:0,rot:0,lie:0};
  const st=e.st,t=e.t;
  if(e.moving){const w=Math.sin(e.anim),c=Math.cos(e.anim);P.ff=[5+w*8,-Math.max(0,c)*4];P.bf=[-5-w*8,-Math.max(0,-c)*4];P.fh=[9-w*3,-35];P.bh=[2+w*3,-32]}
  else{const b=Math.sin(FR*.08+e.seed);P.fh=[9,-37+b];P.bh=[2,-33+b];P.cr=b*.6}
  switch(st){
  case 'atk':{
    const m=e.mv;if(!m)break;
    if(e===S.p){
      const a0=m.act[0],on=t>=a0&&t<=m.act[1]+2,pre=t<a0;
      switch(m.pose){
        case 'jab':P.fh=on?[30,-38]:pre?[6,-38]:[14,-37];P.lean=on?.25:0;break;
        case 'jab2':P.bh=on?[30,-37]:pre?[6,-36]:[12,-35];P.lean=on?.3:0;break;
        case 'hook':P.fh=on?[28,-44]:pre?[-4,-40]:[12,-38];P.lean=on?.35:-.1;break;
        case 'kick':if(pre){P.lean=-.2;P.ff=[-4,-8]}else if(t<a0+8){P.ff=[34,-24];P.lean=-.4;P.bf=[-4,0]}else P.ff=[14,-4];break;
        case 'tackle':P.lean=.6;P.fh=[18,-34];P.bh=[12,-30];P.ff=[10,0];P.bf=[-14,0];break;
        case 'bat1':P.fh=pre?[-10,-50]:on?[24,-36]:[16,-30];P.lean=pre?-.2:.3;break;
        case 'bat2':P.fh=pre?[-2,-58]:on?[26,-22]:[18,-18];P.lean=pre?-.25:.45;P.cr=on?4:0;break;
        case 'spin':P.fh=[26,-38];P.bh=[-24,-38];P.ff=[10,-6];break;
        case 'throwk':P.fh=t<6?[-10,-50]:[28,-40];P.lean=t<6?-.2:.3;break;
      }
    }else{
      const pre=t<m.wind,on=!pre&&t<m.wind+(m.act||0)+4;
      if(m.shoot){P.fh=pre?[-12,-54]:[26,-40];P.lean=pre?-.2:.3}
      else if(m.charge){P.lean=.55;P.cr=7;P.fh=[6,-26];P.bh=[-6,-24];P.ff=[10,0];P.bf=[-12,0]}
      else if(m.pose==='slam'){P.fh=pre?[2,-66]:[30,-6];P.bh=pre?[-4,-64]:[24,-8];P.lean=pre?-.25:.5;P.cr=on?6:0}
      else{P.fh=pre?[-6,-42]:on?[(m.rng||30)*.8,-38]:[12,-36];P.lean=pre?-.2:on?.3:0}
    }
    break}
  case 'charge':{P.lean=.7;P.fh=[20,-30];P.bh=[14,-28];const w=Math.sin(FR*.6);P.ff=[8+w*10,0];P.bf=[-8-w*10,0];break}
  case 'hurt':P.lean=-.45;P.fh=[-4,-46];P.bh=[-10,-44];break;
  case 'stun':P.lean=Math.sin(FR*.15)*.3;P.fh=[6,-24];P.bh=[-4,-24];break;
  case 'grabbed':P.lean=-.3;P.fh=[6,-26];P.bh=[-2,-24];P.cr=3;break;
  case 'air':case 'thrown':P.rot=st==='thrown'?e.rot:-1.1-clamp(e.vz*.08,-.4,.4);P.fh=[-6,-48];P.bh=[-14,-44];P.ff=[10,-6];P.bf=[-2,-4];break;
  case 'down':case 'dead':P.lie=1;P.fh=[-2,-50];P.bh=[6,-48];P.ff=[6,-2];P.bf=[-2,-2];break;
  case 'jump':if(e.jk&&e.jk<=MV.jk.act[1]){P.ff=[30,-20];P.bf=[-6,-10];P.lean=-.3;P.fh=[2,-42]}else{P.ff=[8,-10];P.bf=[-6,-8];P.fh=[10,-44];P.bh=[-6,-42]}break;
  case 'dash':{P.lean=.5;const w=Math.sin(FR*.7);P.ff=[10+w*10,0];P.bf=[-10-w*10,0];break}
  case 'grab':P.fh=[20,-34];P.bh=[18,-30];if(e.kneeT>0){P.ff=[16,-24];P.lean=-.1}break;
  case 'throw':P.fh=t<8?[18,-46]:[-10,-50];P.bh=P.fh;P.lean=t<8?.2:-.4;break;
  case 'bjump':P.ff=[6,-8];P.bf=[-6,-8];P.fh=[14,-58];P.bh=[-10,-58];break;
  case 'rec':P.cr=8;P.lean=.3;P.fh=[16,-12];P.bh=[8,-10];break;
  case 'roar':P.lean=-.3;P.fh=[20,-60];P.bh=[-16,-60];break;
  }
  return P;
}
function drawFighter(e){
  const d=e.def,s=d.s||1,P=pose(e),sx=e.x-S.cam;
  // 影（ジャンプ・ボス跳躍の着地点の手がかり）
  ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(sx,e.y,15*s*Math.max(.4,1-e.z/220),5*s,0,0,7);ctx.fill();
  if(e.st==='bjump'&&e.z>100){ctx.strokeStyle='rgba(255,60,60,'+(.5+.4*Math.sin(FR*.5))+')';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(sx,e.y,40,15,0,0,7);ctx.stroke()}
  if(e.hp<=0&&e.st==='down'&&e.t>25&&(e.t>>2)&1)return;
  if(e===S.p&&e.inv>0&&e.st!=='atk'&&(FR>>2)&1)return;
  let f=e.f;if(e===S.p&&e.st==='atk'&&e.mk==='sp')f=(e.t>>2)&1?1:-1;
  ctx.save();ctx.translate(sx,e.y-e.z);
  if(e.st==='grabbed'||e.st==='hurt')ctx.translate(Math.sin(FR*2)*1.2,0);
  ctx.scale(f*s,s);
  if(P.lie){ctx.translate(0,-5);ctx.rotate(-Math.PI/2)}
  else if(P.rot){ctx.translate(0,-24);ctx.rotate(P.rot);ctx.translate(0,24)}
  const fl=e.flash>0&&(e.flash&2),skin=fl?'#fff':'#e8b48a',body=fl?'#fff':d.body,pants=fl?'#ddd':d.pants;
  const cr=P.cr,hip=[P.lean*4,-22+cr],sh=[P.lean*12,-40+cr],hd=[P.lean*15,-49+cr];
  ctx.lineCap='round';ctx.lineJoin='round';
  limb(hip[0],hip[1],P.bf[0],P.bf[1],12,-1,fl?'#ccc':d.pants,6);
  limb(sh[0]-2,sh[1]+2,P.bh[0],P.bh[1],12,1,fl?'#ddd':'#c8946a',4.5);
  ctx.strokeStyle=body;ctx.lineWidth=d.w;ctx.beginPath();ctx.moveTo(hip[0],hip[1]-2);ctx.lineTo(sh[0],sh[1]);ctx.stroke();
  limb(hip[0],hip[1],P.ff[0],P.ff[1],12,-1,pants,6.5);
  // 頭
  ctx.fillStyle=skin;ctx.beginPath();ctx.arc(hd[0],hd[1],e.type==='t'?8:7,0,7);ctx.fill();
  drawHead(e,hd[0],hd[1],fl);
  // 前の腕＋武器/盾
  const ws=e===S.p&&e.wpn;
  if(ws){
    const ang=Math.atan2(P.fh[1]-sh[1],P.fh[0]-sh[0]);
    if(ws.k==='bat'){ctx.strokeStyle='#a0703a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(P.fh[0],P.fh[1]);ctx.lineTo(P.fh[0]+Math.cos(ang)*26,P.fh[1]+Math.sin(ang)*26);ctx.stroke()}
    else{ctx.strokeStyle='#ddd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(P.fh[0],P.fh[1]);ctx.lineTo(P.fh[0]+Math.cos(ang)*10,P.fh[1]+Math.sin(ang)*10);ctx.stroke()}
  }
  if(e.type==='k'&&!(e.st==='atk'&&e.t>=e.mv.wind)){ctx.strokeStyle='#ddd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(P.fh[0],P.fh[1]);ctx.lineTo(P.fh[0]+3,P.fh[1]-10);ctx.stroke()}
  limb(sh[0]+1,sh[1]+2,P.fh[0],P.fh[1],12,1,skin,4.5);
  ctx.fillStyle=skin;ctx.beginPath();ctx.arc(P.fh[0],P.fh[1],3,0,7);ctx.fill();
  if(e.type==='d'&&e.st!=='down'&&e.st!=='air'&&e.st!=='thrown'){
    const gu=e.st==='idle';ctx.fillStyle=fl?'#fff':gu?'rgba(140,200,255,.85)':'rgba(90,120,170,.8)';
    ctx.fillRect(gu?12:6,-48+cr,6,30);ctx.strokeStyle='#cde';ctx.lineWidth=1;ctx.strokeRect(gu?12:6,-48+cr,6,30);
  }
  ctx.restore();
  // 頭上表示
  const top=e.y-e.z-62*s;
  if(e.st==='atk'&&e.mv&&e.mv.tell&&e.t<e.mv.wind){txt(e.mv.tell===2?'!!':'!',sx,top-4+Math.sin(FR*.6)*2,18,'#ff3c3c')}
  if(e.st==='stun'){for(let i=0;i<3;i++){const a=FR*.12+i*2.1;ctx.fillStyle='#ffe23c';ctx.beginPath();ctx.arc(sx+Math.cos(a)*12,top+4+Math.sin(a)*4,2.5,0,7);ctx.fill()}}
  if(e!==S.p&&e.type!=='b'&&e.hpShow>0&&e.hp>0){ctx.fillStyle='#000';ctx.fillRect(sx-16,top-2,32,5);ctx.fillStyle='#f44';ctx.fillRect(sx-15,top-1,30*e.hp/e.max,3)}
  if(e===S.p&&e.st==='grab'){txt('攻撃:膝  ジャンプ:投げ',sx,top-8,9,'#fff')}
}
function drawHead(e,x,y,fl){
  const T=e.type;
  if(T==='p'){ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(x-1,y-3,7,Math.PI,0);ctx.fill();
    ctx.fillStyle=fl?'#fff':'#ffd23c';ctx.fillRect(x-7,y-4,14,3);
    ctx.strokeStyle='#ffd23c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-7,y-3);ctx.lineTo(x-15,y-4+Math.sin(FR*.3)*3);ctx.stroke()}
  else if(T==='g'){ctx.fillStyle='#111';ctx.fillRect(x,y-2,7,3)}
  else if(T==='r'){ctx.fillStyle='#e33';for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(x-5+i*3,y-6);ctx.lineTo(x-4+i*3,y-13);ctx.lineTo(x-2+i*3,y-6);ctx.fill()}}
  else if(T==='t'){ctx.fillStyle='#444';ctx.beginPath();ctx.arc(x,y-2,8.5,Math.PI,0);ctx.fill()}
  else if(T==='k'){ctx.fillStyle='#2a7a3a';ctx.fillRect(x-7,y-6,14,4);ctx.fillStyle='#ddd';ctx.fillRect(x,y+1,7,4)}
  else if(T==='d'){ctx.fillStyle='#2a4a90';ctx.beginPath();ctx.arc(x,y-1,8,Math.PI,0);ctx.fill();ctx.fillStyle='#9cf';ctx.fillRect(x,y-2,7,2)}
  else if(T==='b'){ctx.fillStyle='#eee';ctx.beginPath();ctx.arc(x-2,y-3,7.5,Math.PI*.9,Math.PI*1.9);ctx.fill();
    ctx.fillStyle=e.phase===2?'#f22':'#000';ctx.fillRect(x+2,y-2,4,2);
    if(e.phase===2){ctx.strokeStyle='rgba(255,40,40,.4)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y+20,26+Math.sin(FR*.3)*2,0,7);ctx.stroke()}}
}
function drawItem(it){
  const x=it.x-S.cam,y=it.y-it.z;
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(x,it.y,9,3,0,0,7);ctx.fill();
  const b=Math.sin(FR*.1)*1.5-3;
  if(it.kind==='apple'){ctx.fillStyle='#e22';ctx.beginPath();ctx.arc(x,y-6+b,6,0,7);ctx.fill();ctx.fillStyle='#3c3';ctx.fillRect(x,y-14+b,4,3)}
  else if(it.kind==='meat'){ctx.fillStyle='#b5651d';ctx.beginPath();ctx.ellipse(x,y-7+b,10,7,0,0,7);ctx.fill();ctx.fillStyle='#eee';ctx.fillRect(x+8,y-9+b,7,3)}
  else if(it.kind==='bat'){ctx.strokeStyle='#a0703a';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-12,y-3);ctx.lineTo(x+12,y-6);ctx.stroke()}
  else{ctx.strokeStyle='#ddd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y-3);ctx.lineTo(x+6,y-4);ctx.stroke()}
  if((it.kind==='bat'||it.kind==='knife')&&Math.abs(it.x-S.p.x)<24&&Math.abs(it.y-S.p.y)<14&&!S.p.wpn)txt('攻撃で拾う',x,y-20,9,'#fff');
}
function drawCrate(o){
  const x=o.x-S.cam+(o.shk?Math.sin(o.shk*2)*2:0),y=o.y;
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x-17,y-3,34,6);
  ctx.fillStyle='#8a5a2a';ctx.fillRect(x-15,y-28,30,28);
  ctx.strokeStyle='#5a3a1a';ctx.lineWidth=2;ctx.strokeRect(x-15,y-28,30,28);
  ctx.beginPath();ctx.moveTo(x-15,y-28);ctx.lineTo(x+15,y);ctx.moveTo(x+15,y-28);ctx.lineTo(x-15,y);ctx.stroke();
}
function txt(s,x,y,sz,col,al){ctx.font='bold '+sz+'px sans-serif';ctx.textAlign=al||'center';ctx.fillStyle='#000';ctx.fillText(s,x+1.5,y+1.5);ctx.fillStyle=col||'#fff';ctx.fillText(s,x,y)}
function bar(x,y,w,h,v,col){ctx.fillStyle='#000';ctx.fillRect(x-2,y-2,w+4,h+4);ctx.fillStyle='#411';ctx.fillRect(x,y,w,h);ctx.fillStyle=col;ctx.fillRect(x,y,w*clamp(v,0,1),h)}
function drawWorld(){
  const cam=S.cam;
  for(const w of S.waves)if(w.r>0){ctx.strokeStyle='rgba(255,140,60,'+(1-w.r/170)+')';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(w.x-cam,w.y,w.r,w.r/2.6,0,0,7);ctx.stroke()}
  const L=[];
  for(const o of S.props)L.push([o.y,()=>drawCrate(o)]);
  for(const it of S.items)L.push([it.y-1,()=>drawItem(it)]);
  for(const e of S.es)L.push([e.y,()=>drawFighter(e)]);
  L.push([S.p.y+.01,()=>drawFighter(S.p)]);
  L.sort((a,b)=>a[0]-b[0]);for(const l of L)l[1]();
  for(const s of S.shots){
    const x=s.x-cam,y=s.y-s.z;
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(x,s.y,6,2,0,0,7);ctx.fill();
    ctx.strokeStyle=s.owner==='e'?'#eef':'#ffe';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x-s.f*8,y);ctx.lineTo(x+s.f*6,y);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.moveTo(x-s.f*24,y);ctx.lineTo(x-s.f*8,y);ctx.stroke();
  }
  for(const f of S.fx){
    const k=f.t/f.max;
    if(f.k==='hit'){
      const R=(f.big?26:16)*(.4+k);ctx.strokeStyle=f.col;ctx.globalAlpha=1-k;ctx.lineWidth=f.big?3:2;ctx.beginPath();
      for(let i=0;i<8;i++){const a=f.a+i*Math.PI/4,r0=R*.35;ctx.moveTo(f.x-cam+Math.cos(a)*r0,f.y+Math.sin(a)*r0);ctx.lineTo(f.x-cam+Math.cos(a)*R,f.y+Math.sin(a)*R)}
      ctx.stroke();ctx.fillStyle=f.col;ctx.beginPath();ctx.arc(f.x-cam,f.y,(f.big?10:6)*(1-k),0,7);ctx.fill();ctx.globalAlpha=1;
    }else if(f.k==='dust'){ctx.fillStyle='rgba(200,200,210,'+(.5*(1-k))+')';ctx.beginPath();ctx.arc(f.x-cam,f.y-2,f.r*(1+k),0,7);ctx.fill()}
    else if(f.k==='chip'){ctx.fillStyle='#8a5a2a';ctx.fillRect(f.x-cam-3,f.y-f.z-3,6,4)}
    else if(f.k==='txt'){ctx.globalAlpha=Math.min(1,(1-k)*2);txt(f.txt,f.x-cam,f.y,f.size,f.col);ctx.globalAlpha=1}
  }
}
function drawHUD(){
  const p=S.p;
  txt(PDEF.name,12,17,13,'#fff','left');bar(48,7,150,11,p.hp/p.max,p.hp<30?'#f84':'#3d3');
  for(let i=0;i<S.lives;i++){ctx.fillStyle='#f55';ctx.beginPath();ctx.arc(210+i*14,13,5,0,7);ctx.fill()}
  if(p.wpn){txt(p.wpn.k==='bat'?'バット':'ナイフ',12,36,11,'#fc8','left');if(p.wpn.k==='bat')bar(52,29,60,5,p.wpn.dur/14,'#c96')}
  if(S.lastE&&S.lastET>0&&S.lastE.type!=='b'){const e=S.lastE;txt(e.def.name,12,p.wpn?54:36,11,'#ccc','left');bar(80,p.wpn?47:29,90,6,e.hp/e.max,'#e44')}
  txt('SCORE '+String(S.score).padStart(7,'0'),W-12,18,15,'#ffd84a','right');
  txt('HI '+String(Math.max(HI,S.score)).padStart(7,'0'),W-12,32,10,'#aaa','right');
  if(S.area>=0){
    const a=AREAS[S.area];txt(a.name,W/2,16,11,'#ddd');
    if(!a.boss)for(let i=0;i<a.waves.length;i++){ctx.fillStyle=i<S.wave||(i===S.wave&&S.lock===null)?'#7ff':i===S.wave?'#ffd84a':'#444';ctx.beginPath();ctx.arc(W/2-(a.waves.length-1)*7+i*14,26,4,0,7);ctx.fill()}
  }
  const boss=S.es.find(e=>e.type==='b'&&e.st!=='enter');
  if(boss){txt(boss.def.name,W/2-110,46,11,'#f88','left');bar(W/2-110,50,220,9,boss.hp/boss.max,boss.phase===2?'#f33':'#e83')}
  if(S.combo>=2){
    const pop=S.comboT>100?1+(S.comboT-100)*.04:1;
    ctx.save();ctx.translate(W-60,78);ctx.scale(pop,pop);
    txt(S.combo,0,0,30,S.combo>=20?'#f5f':S.combo>=10?'#7ff':'#fff');txt('HITS',0,14,11,'#fff');ctx.restore();
    txt('×'+mult().toFixed(1),W-60,108,13,'#ffd84a');bar(W-90,114,60,3,S.comboT/110,'#7ff');
  }
  if(S.go&&S.lock===null&&(FR>>4)&1){txt('GO',W-50,170,28,'#7ff');ctx.fillStyle='#7ff';ctx.beginPath();ctx.moveTo(W-28,152);ctx.lineTo(W-10,162);ctx.lineTo(W-28,172);ctx.fill()}
  if(S.hint){ctx.globalAlpha=Math.min(1,S.hint.t/30);ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(40,124,W-80,22);txt(S.hint.txt,W/2,140,11,'#fff');ctx.globalAlpha=1}
  if(S.banner){const b=S.banner,k=b.t<15?b.t/15:b.t>120?(150-b.t)/30:1;
    ctx.globalAlpha=clamp(k,0,1);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,72,W,48);
    txt(b.txt,W/2+(1-k)*80,100,26,b.col);if(b.sub)txt(b.sub,W/2,115,11,'#fff');ctx.globalAlpha=1}
  if(S.flashScr>0){ctx.fillStyle='rgba(255,255,255,'+S.flashScr+')';ctx.fillRect(0,0,W,H)}
}
function drawTitle(){
  ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(0,0,W,H);
  ctx.shadowColor='#ff3c8c';ctx.shadowBlur=18;txt('NEON BRAWL',W/2,92,50,'#ff6cb0');ctx.shadowBlur=0;
  txt('ネオン・ブロウル  ―  ベルトスクロールアクション',W/2,118,13,'#7ff');
  txt(touchMode?'タップでスタート':'Enter / J でスタート',W/2,160,20,(FR>>5)&1?'#fff':'#999');
  const L=touchMode?['左半分スライド:移動　攻撃:4段コンボ(押しっぱなしで連打)','ジャンプ中に攻撃:跳び蹴り　ダッシュ中に攻撃:タックル','敵に向かって押し込む:掴み → 攻撃:膝 / ジャンプ:投げ','必殺:HPを消費して全方位攻撃（無敵）']
    :['移動:矢印/WASD　攻撃:J/Z　ジャンプ:K/X/Space　ダッシュ:L/Shift/←←','必殺:I/V（HP消費・無敵）　ジャンプ中に攻撃:跳び蹴り　ダッシュ中に攻撃:タックル','敵に向かって押し込む:掴み → 攻撃:膝 / ジャンプ:投げ / 逆方向+攻撃:後ろ投げ','コンボを繋ぐほどスコア倍率UP（被弾でリセット）'];
  L.forEach((s,i)=>txt(s,W/2,200+i*20,11,'#ddd'));
  txt('HI SCORE '+HI,W/2,295,13,'#ffd84a');
}
function drawEnd(){
  ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,W,H);
  const c=S.mode==='clear';
  txt(c?'STAGE CLEAR!':'GAME OVER',W/2,100,42,c?'#ffd84a':'#f55');
  txt('SCORE  '+S.score+(S.newHi?'  NEW RECORD!':''),W/2,145,18,'#fff');
  txt('最大コンボ '+S.maxCombo+'　撃破 '+S.kos+'　タイム '+Math.floor(S.time/3600)+':'+String(Math.floor(S.time/60)%60).padStart(2,'0'),W/2,172,13,'#ccc');
  if(c)txt('RANK '+rank(),W/2,215,34,'#7ff');
  if(S.t>40)txt(touchMode?'タップでリトライ':'Enter でリトライ',W/2,262,18,(FR>>5)&1?'#fff':'#999');
}
function drawTouch(){
  if(!touchMode)return;
  const u=Math.min(SW,SH),act=STK.id!==null,sx=act?STK.ox:STK.x,sy=act?STK.oy:STK.y;
  ctx.globalAlpha=act?.4:.22;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(sx,sy,STK.R,0,7);ctx.fill();
  ctx.globalAlpha=act?.75:.45;ctx.beginPath();ctx.arc(sx+STK.vx*STK.R,sy+STK.vy*STK.R,STK.R*.45,0,7);ctx.fill();
  for(const b of TB){
    const on=b.id!==null;ctx.globalAlpha=on?.8:.42;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.r*(on?.94:1),0,7);ctx.fill();
    ctx.globalAlpha=on?1:.75;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    ctx.globalAlpha=1;const fs=Math.max(11,b.r*(b.k==='atk'?.38:.32));ctx.font='bold '+fs+'px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText(b.label,b.x,b.y+fs*.35);
    if(b.k==='sp'&&S.p&&S.p.hp<=MV.sp.cost){ctx.globalAlpha=.6;ctx.fillStyle='#000';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill()}
  }
  ctx.globalAlpha=1;
}
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,SW,SH);
  const sh=S.shake>.4?S.shake:0,jx=(Math.random()*2-1)*sh,jy=(Math.random()*2-1)*sh;
  ctx.setTransform(scale*DPR,0,0,scale*DPR,(offX+jx*scale)*DPR,(offY+jy*scale)*DPR);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
  drawBG(S.cam||0);
  if(S.mode==='title')drawTitle();
  else{drawWorld();drawHUD();if(S.mode!=='play')drawEnd()}
  ctx.restore();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  drawTouch();
  if(SH>SW){ctx.fillStyle='rgba(0,0,0,.85)';ctx.fillRect(0,0,SW,SH);ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText('横画面にしてください',SW/2,SH/2)}
}
let last=0,acc=0;
function loop(ts){
  acc+=Math.min(100,ts-last);last=ts;
  while(acc>=1000/60){update();acc-=1000/60}
  draw();requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
