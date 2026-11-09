import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const {id}=JSON.parse(await readFile('web-test-scene.json','utf8'));
const s=await(await fetch('http://127.0.0.1:3002/api/scenes/'+id)).json();
const nodes=Object.values(s.graph.nodes);const walls=nodes.filter(n=>n.type==='wall');
assert.equal(walls.length,4);assert.ok(walls.every(w=>w.height===2.5));
const area=nodes.find(n=>n.type==='zone');
await writeFile('web-scene-verification.json',JSON.stringify({sceneId:id,version:s.version,graphHash:s.graphHash,walls:walls.map(({id,start,end,height})=>({id,start,end,height})),zone:area,items:nodes.filter(n=>['item','procedural-item'].includes(n.type))},null,2));console.log('Scene verified',s.version,nodes.length);
