export const multipliers = [1,1,2,2,3];
export const connected = (p,now) => !p.left && now-p.seen < 15000;
export function score(players,round) {
 const thieves=players.filter(p=>p.action==='steal').length, guards=players.filter(p=>p.action==='guard').length;
 return players.map(p=>{
 let base=p.action==='split'?600:0, reason='Nobody stole. Cooperation paid off.';
 if(thieves>=2){base=p.action==='steal'?-300:p.action==='guard'?300:0;reason='Multiple thieves triggered the alarm.';}
 else if(thieves===1&&guards){base=p.action==='steal'?-300:p.action==='guard'?Math.floor(900/guards):600;reason=p.action==='guard'?'You shared the 900-credit bounty.':p.action==='steal'?'The guards caught you.':'The guards protected your payout.';}
 else if(thieves===1){base=p.action==='steal'?1200:0;reason='An unguarded thief took the reward.';}
 else if(p.action==='guard')reason='No thief to catch. No bounty.';
 return {id:p.id,name:p.name,action:p.action,double:p.double,base,delta:base*multipliers[round-1]*(p.double?2:1),reason};
 });
}
export class Game {
 constructor(data){this.s=data||{code:'',phase:'lobby',round:0,game:0,players:[],host:'',deadline:0,history:[],created:Date.now(),touched:Date.now()};}
 advance(now){
 const s=this.s;
 const host=s.players.find(p=>p.id===s.host);
 if(!host||host.left||now-host.seen>=30000){const next=s.players.find(p=>connected(p,now));if(next)s.host=next.id;}
 while(s.deadline&&now>=s.deadline){
 const at=s.deadline;s.rev=(s.rev||0)+1;
 if(s.phase==='briefing'){s.phase='decision';s.deadline=at+30000;}
 else if(s.phase==='decision'){for(const p of s.players)if(!p.action){p.action='split';p.double=false;}s.phase='countdown';s.deadline=at+3000;}
 else if(s.phase==='countdown'){const result=score(s.players,s.round);for(const r of result)s.players.find(p=>p.id===r.id).score+=r.delta;s.history.push({round:s.round,result});s.phase='results';s.deadline=at+15000;}
 else if(s.phase==='results'){if(s.round===5){s.phase='final';s.deadline=0;}else{this.nextRound(at);}}
 else break;
 }
 }
 nextRound(now){const s=this.s;s.round++;s.phase='briefing';s.deadline=now+60000;for(const p of s.players){p.action=null;p.double=false;}}
 act(action,body,token,now){
 this.advance(now);const s=this.s;let p=s.players.find(p=>p.token===token);
 if(action==='create'||action==='join'){
 if(action==='create'&&s.code)throw Error('Room already exists. Try creating again.');
 if(s.phase!=='lobby')throw Error('This heist has started. Join the next one.');
 if(p&&!p.left){p.seen=now;return p;}
 const name=String(body.name||'').trim().normalize('NFKC');
 if(name.length<1||name.length>20||/[\x00-\x1f<>]/.test(name))throw Error('Use a nickname of 1–20 characters.');
 if(s.players.filter(x=>!x.left).length>=8)throw Error('This room is full.');
 if(s.players.some(x=>!x.left&&x.name.toLowerCase()===name.toLowerCase()))throw Error('That nickname is taken.');
 if(action==='create')s.code=body.code;
 p={id:crypto.randomUUID(),token:crypto.randomUUID()+crypto.randomUUID(),name,score:0,gadget:true,ready:false,seen:now,action:null,double:false,left:false};
 s.players.push(p);if(!s.host)s.host=p.id;
 }else{
 if(!p||p.left)throw Error('Your session expired. Create or join a room again.');
 p.seen=now;
 if(action==='ready'){if(s.phase!=='lobby')throw Error('Readiness only changes in the lobby.');p.ready=!!body.ready;}
 else if(action==='start'){
 if(p.id!==s.host||s.phase!=='lobby')throw Error('Only the host can start from the lobby.');
 const roster=s.players.filter(x=>connected(x,now));
 if(roster.length<2||!roster.every(x=>x.ready))throw Error('At least two connected players must all be ready.');
 s.players=roster;s.game++;s.round=0;s.history=[];
 for(const x of roster){x.score=0;x.gadget=true;}
 this.nextRound(now);
 }else if(action==='lock'){
 if(body.game!==s.game||body.round!==s.round)throw Error('This decision belongs to an old round.');
 if(p.action)return p;
 if(s.phase!=='decision')throw Error('The decision window has closed.');
 if(!['split','steal','guard'].includes(body.choice))throw Error('Choose Split, Steal, or Guard.');
 if(body.double&&!p.gadget)throw Error('Double Down has already been used.');
 p.action=body.choice;p.double=!!body.double;if(p.double)p.gadget=false;
 if(s.players.every(x=>x.action)){s.phase='countdown';s.deadline=now+3000;}
 }else if(action==='rematch'){
 if(p.id!==s.host||s.phase!=='final')throw Error('Only the host can request a rematch after the game.');
 s.phase='lobby';s.deadline=0;s.round=0;s.history=[];
 s.players=s.players.filter(x=>!x.left);
 for(const x of s.players){x.score=0;x.gadget=true;x.ready=false;x.action=null;x.double=false;}
 }else if(action==='leave'){p.left=true;p.ready=false;if(p.id===s.host){const next=s.players.find(x=>connected(x,now));if(next)s.host=next.id;}}
 else if(action!=='state')throw Error('Unknown action.');
 }
 s.rev=(s.rev||0)+1;s.touched=now;return p;
 }
 view(p,now){const s=this.s;return {revision:s.rev||0,code:s.code,phase:s.phase,round:s.round,game:s.game,host:s.host,deadline:s.deadline,serverTime:now,multiplier:multipliers[s.round-1]||1,players:s.players.filter(x=>s.phase!=='lobby'||!x.left).map(x=>({id:x.id,name:x.name,score:x.score,ready:x.ready,connected:connected(x,now),locked:!!x.action})),me:{id:p.id,action:p.action,double:p.double,gadget:p.gadget,ready:p.ready},history:s.history};}
}
export function cookieToken(request){return (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hp_session='))?.slice(11)||'';}
export function json(data,status=200,token,secure=true){const headers={'content-type':'application/json','cache-control':'no-store'};if(token)headers['set-cookie']=`hp_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure?'; Secure':''}`;return new Response(JSON.stringify(data),{status,headers});}
