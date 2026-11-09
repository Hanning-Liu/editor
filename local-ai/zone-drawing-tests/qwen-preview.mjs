import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='zone-drawing-tests/', pr=JSON.parse(await readFile(dir+'qwen-project.json')), old=JSON.parse(await readFile(dir+'qwen-report.json'));
const api='http://127.0.0.1:3002/api/scenes/'+pr.id, before=await fetch(api).then(r=>r.json());
const response=await fetch('http://127.0.0.1:3002/api/local-chat?sceneId='+pr.id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'只读检查，不要修改任何对象：第一，预览在当前房间新增一个功能分区还有多少剩余区域（不排除任何已有分区）；第二，预览如果要重绘已有的“Qwen补余区”，它可使用的剩余区域。分别实际调用 get_functional_zone_remainder，最后报告面积、分块和孔洞数量。不要把其他已有功能分区排除。',preferences:{modelId:'qwen38',effort:'fast'}})}); assert.ok(response.ok);
let raw='';for await(const chunk of response.body){raw+=new TextDecoder().decode(chunk);await writeFile(dir+'qwen-preview.ndjson',raw)}
const events=raw.split('\n').flatMap(l=>{try{return[JSON.parse(l)]}catch{return[]}}), calls=events.filter(e=>e.type==='tool'&&e.state==='done'&&e.name==='get_functional_zone_remainder');
assert.ok(calls.some(c=>!c.args.excludeId)); assert.ok(calls.some(c=>c.args.excludeId===old.remainderZoneId)); assert.ok(!calls.some(c=>c.args.excludeId===old.multipartZoneId));
for(const c of calls){let r=c.result;if(r.content)r=JSON.parse(r.content.find(c=>c.type==='text').text);console.log(JSON.stringify({args:c.args,result:r}));const data=r.data??r; if(c.args.excludeId){assert.equal(data.areaM2,33);assert.equal(data.partCount,2);assert.equal(data.holeCount,2)}else{assert.equal(data.areaM2,0);assert.equal(data.empty,true)}}
assert.deepEqual((await fetch(api).then(r=>r.json())).graph,before.graph);
await writeFile(dir+'qwen-preview-report.json',JSON.stringify({passed:true,realLocalQwen:true,newZonePreviewEmpty:true,replacingOwnZonePreviewAreaM2:33,correctExclusion:true,readOnlyGraphUnchanged:true,tools:events.filter(e=>e.type==='tool'&&e.state==='done').map(e=>e.name)},null,2));
old.initialPreviewHadUnneededExclusion=true;old.correctedGuidancePreviewVerified=true;await writeFile(dir+'qwen-report.json',JSON.stringify(old,null,2));
