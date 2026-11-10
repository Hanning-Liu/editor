import {editorFetch,assetFetch} from '../connection.mjs'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
const [out,...types]=process.argv.slice(2),project=JSON.parse(await readFile(path.join(out,'project.json'))),jobs=JSON.parse(await readFile(path.join(out,'studio-jobs.json')))
const scene=async()=>{const r=await editorFetch('/api/scenes/'+project.id);assert.ok(r.ok);return r.json()}
const api='/api/local-studio?sceneId='+project.id
const original=await scene(),protectedItems=Object.values(original.graph.nodes).filter(n=>n.type==='item'&&!n.asset.id.startsWith('studio-'))
const report=[]
for(const type of types){
 const receipt=jobs[type];assert.ok(receipt)
 const r=await editorFetch(api+'&action=get&jobId='+receipt.id),job=await r.json();assert.equal(job.status,'succeeded',type+' not generated')
 const folder=path.join(out,'downloads',type);await mkdir(folder,{recursive:true})
 const files=[{name:'preview.png',url:job.result.previewUrl},...job.result.downloads],verified=[]
 for(const file of files){
  const response=await assetFetch(file.url+'&download=1');assert.ok(response.ok,file.name)
  const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>0)
  if(file.name.endsWith('.png'))assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
  if(file.name.endsWith('.glb'))assert.equal(bytes.subarray(0,4).toString(),'glTF')
  if(file.name.endsWith('.zip'))assert.equal(bytes.subarray(0,2).toString(),'PK')
  if(file.name.endsWith('.json'))JSON.parse(bytes.toString())
  await writeFile(path.join(folder,file.name),bytes)
  verified.push({name:file.name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
 }
 let before=await scene(),applied
 if(!job.applications.length){
  const target=Object.values(before.graph.nodes).find(n=>n.type===(type==='pbr'?'wall':'zone'))
  const body={jobId:job.id,expectedVersion:before.version,levelId:project.defaultLevelId,x:type==='trellis'?3.4:0.6,z:0.4,rotation:0,...(target?{targetId:target.id,role:type==='pbr'?'a':'surface'}:{})}
  const response=await editorFetch(api+'&action=apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});applied=await response.json();assert.ok(response.ok,JSON.stringify(applied));assert.ok(applied.ok)
 }else applied={previousApplicationVerified:true}
 const after=await scene()
 if(type==='render'){if(!applied.previousApplicationVerified)assert.deepEqual(after.graph,before.graph);assert.ok(after.thumbnailUrl.includes(job.id))}
 if(['material','pbr'].includes(type))assert.ok(JSON.stringify(after.graph).includes(job.id))
 if(['blender','trellis'].includes(type)){
  const item=Object.values(after.graph.nodes).find(n=>n.type==='item'&&n.asset.id==='studio-'+job.id)
  assert.ok(item?.asset.floorPlanUrl);assert.ok(item.asset.src.startsWith(process.env.PASCAL_PUBLIC_URL));assert.ok(job.result.projection.alphaCoverage>0)
 }
 for(const item of protectedItems){const actual=after.graph.nodes[item.id];for(const k of ['parentId','position','rotation','scale'])assert.deepEqual(actual[k],item[k],item.id+' '+k+' changed')}
 report.push({type,id:job.id,downloads:verified,application:applied,version:after.version,originalFurniturePreserved:true,apiReadbackVerified:true})
 await writeFile(path.join(out,'apply-download-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({type,downloaded:verified.length,applied:true,version:after.version}))
}
