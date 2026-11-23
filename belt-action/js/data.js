/* ===== data.js : 定義データ（元 index.html の「定義」節＋背景パレットを機械的に分離） ===== */
/* STAGE_END は W に依存する派生値のため app.js 側に残置 */
/* ---------------- 定義 ---------------- */
const PDEF={name:'KAI',hp:100,s:1,body:'#d8402e',pants:'#2b3a66',w:12};
const ET={
  g:{name:'チンピラ',  hp:38, spd:1.15,cd:[50,110], rng:34,turn:6, sc:100, body:'#c8762c',pants:'#3a3a48',w:12},
  r:{name:'ダッシャー',hp:34, spd:1.45,cd:[90,150], rng:30,turn:4, sc:150, body:'#e8c828',pants:'#50302a',w:10},
  t:{name:'タンク',    hp:130,spd:.6,  cd:[90,150], rng:54,turn:14,sc:400, body:'#7a4aa0',pants:'#2a2a3a',w:20,s:1.3},
  k:{name:'ナイフ使い',hp:30, spd:1.25,cd:[100,160],rng:0, turn:4, sc:200, body:'#3a9a5a',pants:'#2a3a2a',w:11},
  d:{name:'ガード兵',  hp:55, spd:.95, cd:[60,120], rng:38,turn:26,sc:250, body:'#3a6ac8',pants:'#22304a',w:13},
  b:{name:'ボス ザンバ',hp:520,spd:1.05,cd:[40,80], rng:52,turn:10,sc:5000,body:'#2a2a30',pants:'#151518',w:16,s:1.45},
};
// プレイヤー技: act=[開始F,終了F] dur=全体F cancel=次段受付F hs=ヒットストップ
const MV={
  j1:{act:[3,5],dur:15,cancel:5,rng:40,dmg:5,kb:1.2,stun:20,hs:4,next:'j2',lunge:1.2,pose:'jab'},
  j2:{act:[3,5],dur:15,cancel:5,rng:40,dmg:5,kb:1.2,stun:20,hs:4,next:'hk',lunge:1.2,pose:'jab2'},
  hk:{act:[4,6],dur:19,cancel:7,rng:44,dmg:8,kb:1.8,stun:24,hs:6,next:'fin',lunge:1.8,pose:'hook'},
  fin:{act:[6,9],dur:28,rng:52,dmg:14,kb:7,launch:4.5,down:1,hs:10,shake:6,heavy:1,lunge:2.5,pose:'kick'},
  jk:{act:[3,24],rng:42,dz:52,dmg:12,kb:5,launch:3.5,down:1,hs:7,shake:3,guardbreak:1},
  dk:{act:[2,14],dur:26,rng:40,dmg:12,kb:7,launch:4,down:1,hs:8,shake:5,guardbreak:1,pose:'tackle'},
  b1:{act:[6,9],dur:20,cancel:9,rng:64,dmg:11,kb:3,stun:24,hs:7,next:'b2',weapon:1,lunge:1,pose:'bat1'},
  b2:{act:[7,11],dur:30,rng:66,dmg:18,kb:8,launch:5,down:1,hs:12,shake:7,weapon:1,guardbreak:1,heavy:1,lunge:2,pose:'bat2'},
  sp:{act:[6,26],dur:38,rng:64,dmg:12,kb:7,launch:5,down:1,hs:6,shake:6,omni:1,guardbreak:1,cost:8,pose:'spin'},
  kt:{act:[99,99],dur:18,pose:'throwk'},
  knee:{dmg:7,stun:30,hs:6,kb:0},
  thr:{dmg:14},
  body:{dmg:12,kb:5,launch:4,down:1,hs:7,shake:5,guardbreak:1,big:1},
  pknife:{dmg:20,kb:5,launch:3,down:1,hs:8},
};
// 敵技: wind=予備動作F（ここが「見て反応する」時間）
const EM={
  gjab:{wind:14,act:3,dur:32,rng:34,dmg:6,kb:2,stun:16,hs:4,lunge:1.5},
  ghook:{wind:24,act:4,dur:40,rng:38,dmg:9,kb:4,stun:22,hs:6,lunge:2,tell:1},
  tslam:{wind:42,act:5,dur:70,rng:58,dmg:16,kb:6,launch:4,down:1,hs:10,shake:8,tell:1,pose:'slam',heavy:1},
  djab:{wind:16,act:3,dur:32,rng:40,dmg:7,kb:2,stun:16,hs:4,lunge:1.5},
  dcounter:{wind:6,act:4,dur:28,rng:42,dmg:9,kb:4,launch:3,down:1,hs:6},
  kthrow:{wind:24,act:0,dur:42,shoot:1,tell:1},
  rwind:{wind:32,dur:32,charge:1,tell:1},
  rcharge:{rng:26,dmg:12,kb:6,launch:4,down:1,hs:8,shake:6},
  bp1:{wind:16,act:3,dur:22,rng:54,dmg:9,kb:2,stun:18,hs:5,lunge:2,next:'bp2',tell:1},
  bp2:{wind:8,act:4,dur:44,rng:58,dmg:12,kb:6,launch:4,down:1,hs:9,shake:6,lunge:3,heavy:1},
  bchargeW:{wind:38,dur:38,charge:1,tell:2},
  bcharge:{rng:40,dmg:16,kb:7,launch:5,down:1,hs:10,shake:10,heavy:1},
  bstomp:{rng:50,omni:1,dmg:14,kb:6,launch:5,down:1,hs:10,heavy:1},
  wave:{dmg:12,kb:4,launch:4,down:1,hs:6,shake:4,omni:1},
  roar:{dmg:0,kb:7,launch:4,down:1,hs:4,omni:1},
  eknife:{dmg:8,kb:2,stun:18,hs:5},
};
// 難易度カーブ: tok=同時攻撃数 ag=攻撃間隔倍率(小さいほど攻撃的) cap=同時出現数
const AREAS=[
  {cam:150, name:'AREA 1  裏通り',tok:1,ag:1.3, cap:3,waves:[['g','g'],['g','g','g'],['r','g','g']]},
  {cam:1000,name:'AREA 2  高架下',tok:2,ag:1.1, cap:4,waves:[['k','g','g'],['r','g','k','g'],['r','r','g','g','k']]},
  {cam:1900,name:'AREA 3  倉庫街',tok:2,ag:1.0, cap:4,waves:[['d','g','g'],['t','g','k'],['d','d','r','g']]},
  {cam:2800,name:'AREA 4  工場跡',tok:3,ag:.85,cap:5,waves:[['t','d','k','g'],['r','r','k','g','g'],['t','d','d','k','r']]},
  {cam:3700,name:'FINAL  屋上',   tok:2,ag:.8, cap:4,waves:[['b']],boss:1},
];
const CRATES=[[560,300,'apple'],[880,240,'bat'],[1480,320,'meat'],[1760,250,'bat'],[2420,240,'apple'],[2560,320,'bat'],[3300,280,'meat'],[3480,236,'bat'],[3960,320,'apple']];
const HINT={
  g:'チンピラ：攻撃連打で4段コンボ。密着して押し込むと掴み→攻撃で膝/ジャンプで投げ',
  r:'ダッシャー：「!」の後に突進。上下に軸をずらすかダッシュで避け、よろけた所を叩け',
  k:'ナイフ使い：ナイフはジャンプで避けるか攻撃で弾く(パリィ)。倒すとナイフを落とす',
  d:'ガード兵：正面の攻撃は弾かれる。背後・跳び蹴り・投げ・ダッシュ攻撃で崩せ',
  t:'タンク：攻撃中はひるまない。振りかぶりを見たら下がり、空振りの隙に叩け',
  b:'ボス：突進は壁に激突させろ。跳躍後の衝撃波はジャンプで回避！',
};

/* 背景パレット（元・描画節の冒頭） */
const SKY=[['#3a2048','#e07a5f'],['#141a3a','#5a4a7a'],['#0b1020','#283a5a'],['#1e0c0c','#6a3020'],['#06040e','#40184a']];
const WALL=['#3d2f3a','#2b2d3a','#3a3326','#2f2522','#1d1a28'];
const SIGNS=['BAR','24H','酒','HOTEL','OPEN','GYM','麺','CLUB'];
