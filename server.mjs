import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Game,cookieToken,json} from './lib/game.mjs';
const rooms=new Map();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(){return Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>alphabet[x%alphabet.length]).join('');}
const port=Number(process.env.PORT||8787);
http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,`http://${req.headers.host}`);
 if(url.pathname==='/api/game'){
 if(req.method!=='POST')throw Error('Use POST.');
 if(req.headers.origin&&new URL(req.headers.origin).hostname!==url.hostname)throw Error('Origin rejected.');
 let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw Error('Request too large.');}
 const body=JSON.parse(text);body.code=String(body.code||'').replace(/\s/g,'').toUpperCase();
 if(body.action==='create'){do{body.code=code();}while(rooms.has(body.code));rooms.set(body.code,new Game());}
 const game=rooms.get(body.code);if(!game)throw Error('Room not found. Check the six-character code.');
 const request=new Request(url,{headers:req.headers});
 const p=game.act(body.action,body,cookieToken(request),Date.now());
 const reply=json(body.action==='leave'?{left:true}:game.view(p,Date.now()),200,['join','create'].includes(body.action)?p.token:null,false);
 res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(await reply.text());
 }else{
 const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[url.pathname];
 if(!file){res.writeHead(404);return res.end('Not found');}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');
 res.end(await readFile(new URL(`./public/${file}`,import.meta.url)));
 }
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
}).listen(port,'0.0.0.0',()=>console.log(`HEIST PROTOCOL: http://localhost:${port}`));
setInterval(()=>{const now=Date.now();for(const [code,g]of rooms){g.advance(now);if(now-g.s.touched>86400000)rooms.delete(code);}},500).unref();
