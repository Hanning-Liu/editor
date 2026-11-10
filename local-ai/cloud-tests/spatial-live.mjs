import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createSceneStore} from '../editor-src/packages/mcp/dist/storage/index.js'
import {createRemoteSceneStore} from '../remote-scene-store.mjs'
import {createMcpSession} from '../mcp-session.mjs'
const [out,mode='local']=process.argv.slice(2);assert.ok(out);await mkdir(out,{recursive:true})
const cloud=mode==='cloud',store=cloud?createRemoteSceneStore():await createSceneStore()
const file=out+'/project.json';let project
try{project=JSON.parse(await readFile(file))}catch(e){if(e.code!=='ENOENT')throw e
 const original=JSON.parse(await readFile(path.join(out,'..','cloud-57da3e861d32-before.json')))
 const graph=structuredClone(original.graph),nodes=graph.nodes
 for(const n of Object.values(nodes))if(['door','window'].includes(n.type)){for(const p of Object.values(nodes))if(p.children)p.children=p.children.filter(id=>id!==n.id);delete nodes[n.id]}
 const sofa=Object.values(nodes).find(n=>n.type==='item'&&n.asset.id==='sofa');assert.ok(sofa)
 // Keep a supported child to audit both scene graph and child-local transforms.
 const toy=Object.values(nodes).find(n=>n.type==='item'&&n.id!==sofa.id);assert.ok(toy)
 for(const p of Object.values(nodes))if(p.children)p.children=p.children.filter(id=>id!==toy.id)
 toy.parentId=sofa.id;toy.position=[0,.5,0];toy.scale=[.1,.1,.1];toy.name='承托关系验收物件';sofa.children.push(toy.id)
 project=await store.createProject({name:`家具方位与承托验收-${mode}-20261110`})
 await store.save({id:project.id,name:project.name,graph,expectedVersion:0})
 project={...project,sofaId:sofa.id,toyId:toy.id};await writeFile(file,JSON.stringify(project,null,2),{flag:'wx'})
}
const {client,transport}=createMcpSession();const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent||JSON.parse(r.content.find(c=>c.type==='text').text)}
try{await client.connect(transport);await call('load_scene',{id:project.id});const before=await store.load(project.id);await writeFile(out+'/before-native.json',JSON.stringify(before,null,2));const reports=[]
 const walls=Object.values(before.graph.nodes).filter(n=>n.type==='wall');const named=Object.fromEntries(walls.map(w=>[w.name,w.id]));
 for(const [yaw,expected]of [[0,[3,1,4,2]],[90,[2,4,3,1]],[180,[1,3,2,4]],[270,[4,2,1,3]]]){
  await call('move_node',{id:project.sofaId,rotation:yaw})
  for(const [i,relation]of ['front','back','right','left'].entries()){
   const r=await call('spatial_resolve_relative_wall',{subjectId:project.sofaId,referenceFrame:'use_direction',relation});assert.equal(r.status,'resolved',JSON.stringify(r));assert.equal(r.selection.wallId,named['Wall '+expected[i]]);reports.push({yaw,relation,wall:r.selection.name,parameters:r.recommendedParameters})
  }
 }
 await call('move_node',{id:project.sofaId,rotation:cloud?180:90})
 const beforeCalibration=await store.load(project.id)
 await call('spatial_set_furniture_front',{subjectId:project.sofaId,frontAxis:'+Z',confirmedByUser:true,evidenceQuote:'模型本地正面 +Z'})
 const calibrated=await store.load(project.id);const ca=structuredClone(calibrated.graph),cb=structuredClone(beforeCalibration.graph);delete ca.nodes[project.sofaId].metadata.spatialReference;delete cb.nodes[project.sofaId].metadata.spatialReference;assert.deepEqual(ca,cb)
 await call('undo',{})
 const afterUndo=await store.load(project.id);assert.deepEqual(afterUndo.graph,beforeCalibration.graph)
 await call('load_scene',{id:project.id});const frame=await call('spatial_get_furniture_frame',{subjectId:project.sofaId,referenceFrame:'use_direction'});assert.equal(frame.status,'resolved')
 const after=await store.load(project.id);for(const n of Object.values(before.graph.nodes)){
  if(n.type!=='item')continue
  const a=after.graph.nodes[n.id];assert.equal(a.parentId,n.parentId);assert.deepEqual(a.children,n.children);assert.deepEqual(a.position,n.position);assert.deepEqual(a.scale,n.scale);if(n.id!==project.sofaId)assert.deepEqual(a.rotation,n.rotation)
 }
 await writeFile(out+'/ready.json',JSON.stringify(after,null,2));await writeFile(out+'/native-report.json',JSON.stringify({projectId:project.id,checks:reports,calibrationMetadataOnly:true,undo:true,reload:true,supportsPreserved:true},null,2));console.log(JSON.stringify({projectId:project.id,rotatedDirections:reports.length,calibrationUndoReload:'passed',frame}))
}finally{await client.close()}
