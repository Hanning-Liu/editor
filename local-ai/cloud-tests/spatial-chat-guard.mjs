import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {readFile,writeFile} from 'node:fs/promises'
import {createSceneStore} from '../editor-src/packages/mcp/dist/storage/index.js'
const out=process.argv[2];assert.ok(out)
const store=await createSceneStore();const ready=JSON.parse(await readFile(out+'/local/ready.json'))
const p=await store.createProject({name:'方位错误工具参数拦截验收-20261110'});await store.save({id:p.id,name:p.name,graph:ready.graph,expectedVersion:0})
const nodes=ready.graph.nodes,sofa=Object.values(nodes).find(n=>n.type==='item'&&n.asset.id==='sofa'),wall=name=>Object.values(nodes).find(n=>n.name===name).id
const commands=[['discover_tools',{names:['add_door']}],['add_door',{wallId:wall('Wall 2'),t:.5}],['spatial_resolve_relative_wall',{subjectId:sofa.id,referenceFrame:'use_direction',relation:'right'}],['add_door',{wallId:wall('Wall 2'),t:.5}],['add_door',{wallId:wall('Wall 3'),t:.5,width:.9,height:2.1}],['verify_scene',{}]]
let i=0
const fake=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;res.setHeader('Content-Type','application/json');if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'mlx-community/Qwen3.8-27B-8bit',loaded:true}]}));const cmd=commands[i++];res.end(JSON.stringify({choices:[{finish_reason:cmd?'tool_calls':'stop',message:cmd?{role:'assistant',content:'',tool_calls:[{id:'call_'+i,type:'function',function:{name:cmd[0],arguments:JSON.stringify(cmd[1])}}]}:{role:'assistant',content:'已按坐姿方向在沙发右侧 Wall 3 开门并检查。'}}],usage:{prompt_tokens:1,completion_tokens:1}}))})
fake.listen(18096,'127.0.0.1');await once(fake,'listening')
const child=spawn(process.execPath,[new URL('../chat-server.mjs',import.meta.url).pathname],{env:{...process.env,LOCAL_CHAT_PORT:'18097',LOCAL_QWEN_URL:'http://127.0.0.1:18096/v1/chat/completions'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
try{
 for(let j=0;j<30;j++){try{if((await fetch('http://127.0.0.1:18097/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const r=await fetch(`http://127.0.0.1:18097/?sceneId=${p.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'在沙发右边的墙体上开一扇门，以坐姿为准。只新增一扇门，不移动家具。',preferences:{effort:'fast'}}),signal:AbortSignal.timeout(60000)});assert.ok(r.ok);const text=await r.text();await writeFile(out+'/guard-chat.ndjson',text);const events=text.trim().split('\n').map(JSON.parse)
 const errors=events.filter(e=>e.type==='tool'&&e.state==='error');assert.deepEqual(errors.map(e=>e.result.code),['spatial_resolution_required','relative_wall_mismatch'])
 const added=events.find(e=>e.name==='add_door'&&e.state==='done');assert.ok(added?.spatialDecisions?.length);assert.equal(added.args.wallId,wall('Wall 3'))
 const after=await store.load(p.id);const doors=Object.values(after.graph.nodes).filter(n=>n.type==='door');assert.equal(doors.length,1);assert.equal(doors[0].parentId,wall('Wall 3'))
 for(const n of Object.values(nodes).filter(n=>n.type==='item'))assert.deepEqual(after.graph.nodes[n.id],n)
 console.log(JSON.stringify({projectId:p.id,missingEvidenceBlocked:true,wrongWallBlocked:true,correctDoorOnly:true,furnitureUnchanged:true}));await writeFile(out+'/guard-report.json',JSON.stringify({projectId:p.id,errors,added},null,2))
}finally{child.kill('SIGTERM');fake.close();await once(child,'exit');if(logs.includes('Error'))console.log(logs)}
