import {Game,cookieToken,json} from './lib/game.mjs';
export default {
 async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname!=='/api/game')return env.ASSETS.fetch(request);
 try{
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Origin rejected.'},403);
 const raw=await request.text();if(raw.length>4096)return json({error:'Request too large.'},413);
 const body=JSON.parse(raw);body.code=String(body.code||'').replace(/\s/g,'').toUpperCase();
 if(body.action==='create'){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';body.code=Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>alphabet[x%alphabet.length]).join('');}
 if(!/^[A-Z2-9]{6}$/.test(body.code))throw Error('Enter a six-character room code.');
 return env.ROOMS.get(env.ROOMS.idFromName(body.code)).fetch(new Request(url,{method:'POST',headers:request.headers,body:JSON.stringify(body)}));
 }catch(error){return json({error:error.message},400);}
 }
};
export class HeistRoom {
 constructor(state,env){this.state=state;this.env=env;this.tail=Promise.resolve();}
 serial(fn){const next=this.tail.then(fn,fn);this.tail=next.catch(()=>{});return next;}
 async fetch(request){return this.serial(async()=>{
 try{
 const data=await this.state.storage.get('game');const body=await request.json();
 if(!data&&body.action!=='create')throw Error('Room not found.');
 const game=new Game(data);const now=Date.now();
 const p=game.act(body.action,body,cookieToken(request),now);
 await this.state.storage.put('game',game.s);await this.schedule(game);
 return json(body.action==='leave'?{left:true}:game.view(p,now),200,['create','join'].includes(body.action)?p.token:null);
 }catch(error){return json({error:error.message},400);}
 });}
 async schedule(game){const now=Date.now();await this.state.storage.setAlarm(Math.min(game.s.deadline||now+30000,now+30000));}
 async alarm(){return this.serial(async()=>{const data=await this.state.storage.get('game');if(!data)return;const game=new Game(data);const now=Date.now();game.advance(now);if(now-game.s.touched>86400000){await this.state.storage.deleteAll();return;}await this.state.storage.put('game',game.s);await this.schedule(game);});}
}
