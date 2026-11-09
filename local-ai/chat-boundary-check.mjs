import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3002/api/local-chat';const rows=[];
async function check(name,url,init,status){const r=await fetch(url,init);assert.equal(r.status,status,name+': '+await r.text());rows.push({name,status});}
await check('reject path as scene',base+'?sceneId=..%2Fbad',{},400);
await check('reject missing scene',base+'?sceneId=nonexistent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'draw'})},404);
await check('reject foreign origin',base+'?sceneId=613bfb3b5f9a',{method:'POST',headers:{Origin:'http://example.com','Content-Type':'application/json'},body:'{}'},403);
const active=await (await fetch('http://127.0.0.1:18081/health')).json();
if(active.active.length)await check('serialize writes',base+'?sceneId=7282523591b5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'不要修改'})},409);
const isolated=await (await fetch(base+'?sceneId=7282523591b5')).json();assert.equal(isolated.messages.length,0);rows.push({name:'scene transcript isolation',passed:true});
await writeFile('chat-boundary-check.json',JSON.stringify(rows,null,2));console.log(rows);
