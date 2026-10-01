import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,score} from '../lib/game.mjs';
import {HeistRoom} from '../worker.mjs';
function setup(n=2){const g=new Game();const ps=[];for(let i=0;i<n;i++)ps.push(g.act(i?'join':'create',{name:'Player '+i,code:'ABC234'},'',1000));for(const p of ps)g.act('ready',{ready:true},p.token,1000);g.act('start',{},ps[0].token,1000);return {g,ps};}
test('approved payout examples and floor before multiplier',()=>{
 const mk=(actions,double=-1)=>actions.map((action,i)=>({id:String(i),name:'P'+i,action,double:i===double}));
 assert.deepEqual(score(mk(['split','split']),1).map(x=>x.delta),[600,600]);
 assert.deepEqual(score(mk(['steal','split']),2).map(x=>x.delta),[1200,0]);
 assert.deepEqual(score(mk(['steal','guard','guard','split']),3).map(x=>x.delta),[-600,900,900,1200]);
 assert.deepEqual(score(mk(['steal','steal','guard'],0),4).map(x=>x.delta),[-1200,-600,600]);
 assert.deepEqual(score(mk(['steal',...Array(7).fill('guard')]),5).map(x=>x.delta),[-900,...Array(7).fill(384)]);
});
test('all action combinations, two through eight players, five multipliers',()=>{
 for(let n=2;n<=8;n++)for(let k=0;k<3**n;k++){
 let v=k;const ps=Array.from({length:n},(_,i)=>{const action=['split','steal','guard'][v%3];v=Math.floor(v/3);return {id:String(i),name:'P'+i,action,double:i===0};});
 const t=ps.filter(x=>x.action==='steal').length,g=ps.filter(x=>x.action==='guard').length;
 for(let round=1;round<=5;round++)for(const [i,r]of score(ps,round).entries()){
 const a=ps[i].action;const expected=t>=2?(a==='steal'?-300:a==='guard'?300:0):t===1?(g?(a==='steal'?-300:a==='guard'?Math.floor(900/g):600):(a==='steal'?1200:0)):(a==='split'?600:0);
 assert.equal(r.delta,expected*[1,1,2,2,3][round-1]*(i===0?2:1));
 }
 }
});
test('private projections omit opponent actions, credentials, and gadgets',()=>{
 const {g,ps}=setup();g.advance(61000);g.act('lock',{game:1,round:1,choice:'steal',double:true},ps[1].token,61001);
 const view=g.view(ps[0],61002);assert.equal(view.players[1].locked,true);assert.equal(view.players[1].action,undefined);assert.equal(view.players[1].token,undefined);assert.equal(view.players[1].double,undefined);assert.deepEqual(view.history,[]);
});
test('timeout defaults, duplicate locks, gadget consumption, idempotent scoring',()=>{
 const {g,ps}=setup();g.advance(61000);
 g.act('lock',{game:1,round:1,choice:'steal',double:true},ps[0].token,61001);
 g.act('lock',{game:1,round:1,choice:'guard',double:false},ps[0].token,61002);
 assert.equal(ps[0].action,'steal');assert.equal(ps[0].gadget,false);
 g.advance(91000);assert.equal(ps[1].action,'split');assert.equal(ps[1].double,false);
 g.advance(94000);assert.equal(ps[0].score,2400);g.advance(94001);assert.equal(ps[0].score,2400);assert.equal(g.s.history.length,1);
});
test('minimum, maximum, nicknames, join-after-start, stale locks',()=>{
 const g=new Game();const p=g.act('create',{name:'A',code:'ABC234'},'',1000);g.act('ready',{ready:true},p.token,1000);
 assert.throws(()=>g.act('start',{},p.token,1000));assert.throws(()=>g.act('join',{name:'a'},'',1000));
 for(let i=1;i<8;i++)g.act('join',{name:String(i)},'',1000);
 assert.throws(()=>g.act('join',{name:'Ninth'},'',1000));for(const x of g.s.players)g.act('ready',{ready:true},x.token,1000);g.act('start',{},p.token,1000);
 assert.throws(()=>g.act('join',{name:'New'},'',1000));g.advance(61000);assert.throws(()=>g.act('lock',{game:0,round:1,choice:'split'},p.token,61001));
});
test('host transfer and reconnect keep locked choice',()=>{
 const {g,ps}=setup();g.advance(61000);g.act('state',{},ps[1].token,61001);g.advance(61002);assert.equal(g.s.host,ps[1].id);
 g.act('lock',{game:1,round:1,choice:'guard'},ps[0].token,61003);assert.equal(g.act('state',{},ps[0].token,61004).action,'guard');assert.equal(g.s.host,ps[1].id);
});
test('Durable Object two sessions: concurrent lock, full game, winner, rematch, restart',async()=>{
 const data=new Map();const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),setAlarm:async()=>{},deleteAll:async()=>data.clear()};
 let room=new HeistRoom({storage},{}),now=100000;const real=Date.now;Date.now=()=>now;
 const send=async(action,token='',extra={})=>{const response=await room.fetch(new Request('https://example.com/api/game',{method:'POST',headers:{cookie:'hp_session='+token},body:JSON.stringify({action,code:'ABC234',...extra})}));return {status:response.status,cookie:response.headers.get('set-cookie'),body:await response.json()};};
 try{
 const a=await send('create','',{name:'Aryan'}),ta=a.cookie.split(';')[0].slice(11);
 const b=await send('join','',{name:'Alex'}),tb=b.cookie.split(';')[0].slice(11);
 await send('ready',ta,{ready:true});await send('ready',tb,{ready:true});await send('start',ta);
 for(let r=1;r<=5;r++){
 now+=60000;
 const locks=await Promise.all([send('lock',ta,{game:1,round:r,choice:'split',double:r===5}),send('lock',tb,{game:1,round:r,choice:'split'})]);assert.ok(locks.every(x=>x.status===200));
 assert.equal((await send('state',ta)).body.phase,'countdown');
 now+=3000;await room.alarm();
 const va=(await send('state',ta)).body,vb=(await send('state',tb)).body;assert.equal(va.phase,'results');assert.deepEqual(va.players.map(x=>x.score),vb.players.map(x=>x.score));assert.equal(va.history.length,r);
 await room.alarm();assert.equal((await send('state',ta)).body.history.length,r);
 room=new HeistRoom({storage},{});assert.equal((await send('state',ta)).body.round,r);
 now+=15000;await room.alarm();await send('state',ta);await send('state',tb);
 }
 const final=(await send('state',ta)).body;assert.equal(final.phase,'final');assert.deepEqual(final.players.map(x=>x.score),[7200,5400]);assert.equal(final.players.find(x=>x.id===final.me.id).name,'Aryan');
 await send('rematch',ta);const reset=(await send('state',tb)).body;assert.equal(reset.phase,'lobby');assert.equal(reset.me.gadget,true);assert.equal(reset.me.ready,false);assert.equal(reset.history.length,0);assert.ok(reset.players.every(x=>x.score===0));
 }finally{Date.now=real;}
});
