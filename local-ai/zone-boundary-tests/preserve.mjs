import{readFile,writeFile}from'node:fs/promises';import assert from'node:assert/strict';
const snapshot=JSON.parse(await readFile('zone-boundary-tests/original-scenes.json')),results=[];
for(const[id,graph]of Object.entries(snapshot)){const r=await fetch('http://127.0.0.1:3002/api/scenes/'+id);assert.ok(r.ok);assert.deepEqual((await r.json()).graph,graph,'Original changed: '+id);results.push({id,unchanged:true})}
const health={};for(const[name,url]of Object.entries({editor:'http://127.0.0.1:3002',chat:'http://127.0.0.1:18081/health',studio:'http://127.0.0.1:18082/health',qwen:'http://127.0.0.1:18080/v1/models'})){const r=await fetch(url);assert.ok(r.ok,name+': '+r.status);health[name]=r.status}
await writeFile('zone-boundary-tests/preserve-report.json',JSON.stringify({passed:true,originalSceneCount:results.length,allGraphsExactlyUnchanged:true,results,health},null,2));console.log(results.length,'original scenes unchanged; services healthy')
