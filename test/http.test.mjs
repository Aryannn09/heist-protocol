import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('local HTTP: two independent cookie sessions, room, readiness, start, reconnect',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'18978'},stdio:['ignore','pipe','pipe']});
 try{
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server start timeout')),5000).unref())]);
 const cookies=['',''];
 const api=async(i,body)=>{const r=await fetch('http://127.0.0.1:18978/api/game',{method:'POST',headers:{'Content-Type':'application/json',cookie:cookies[i]},body:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookies[i]=r.headers.get('set-cookie').split(';')[0];const x=await r.json();assert.equal(r.status,200,JSON.stringify(x));return x;};
 const a=await api(0,{action:'create',name:'Aryan'}),code=a.code;
 await api(1,{action:'join',name:'Alex',code});assert.notEqual(cookies[0],cookies[1]);
 await api(0,{action:'ready',code,ready:true});await api(1,{action:'ready',code,ready:true});
 const started=await api(0,{action:'start',code});const guest=await api(1,{action:'state',code});assert.equal(started.phase,'briefing');assert.equal(guest.phase,started.phase);assert.deepEqual(guest.players,started.players);assert.equal(started.players.length,2);
 assert.equal((await api(0,{action:'state',code})).me.id,a.me.id);assert.ok(!JSON.stringify(guest).includes('token'));
 }finally{child.kill();await once(child,'exit');}
});
