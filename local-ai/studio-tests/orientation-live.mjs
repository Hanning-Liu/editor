import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createSceneStore} from '../editor-src/packages/mcp/dist/storage/index.js'
import {createRemoteSceneStore} from '../remote-scene-store.mjs'
import {createMcpSession} from '../mcp-session.mjs'

const [out,mode='local',jobId]=process.argv.slice(2)
const project=JSON.parse(await readFile(out+'/project.json'))
const baseline=JSON.parse(await readFile(out+'/baseline.json'))
const protectedIds=JSON.parse(await readFile(out+'/protected.json'))
const store=mode==='cloud'?createRemoteSceneStore():await createSceneStore()
const {client,transport}=createMcpSession()
const call=async(name,input)=>{
  const r=await client.callTool({name,arguments:input})
  assert.ok(!r.isError,JSON.stringify({name,input,r}))
  return r.structuredContent||JSON.parse(r.content.find(c=>c.type==='text').text)
}
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6,JSON.stringify({a,b})))
try{
  await client.connect(transport)
  await call('load_scene',{id:project.id})
  const before=await store.load(project.id)
  const item=Object.values(before.graph.nodes).find(n=>n.type==='item'&&n.asset.id==='studio-'+jobId&&n.name!=='既有实例手动朝向')
  assert.ok(item,'Place the generated model from the web Studio first')
  assert.equal(item.asset.orientation.status,'accepted')
  const localFront=item.asset.orientation.frontLocal
  const checks=[]
  for(const degrees of [0,90,180,270,21.199438419840458]){
    await call('move_node',{id:item.id,rotation:degrees})
    const f=await call('spatial_get_furniture_frame',{subjectId:item.id,referenceFrame:'use_direction'})
    assert.equal(f.status,'resolved',JSON.stringify(f))
    const a=degrees*Math.PI/180
    const expected=[Math.cos(a)*localFront[0]+Math.sin(a)*localFront[2],0,-Math.sin(a)*localFront[0]+Math.cos(a)*localFront[2]]
    near(f.directions.front.world,expected)
    if(degrees!==21.199438419840458){
      for(const relation of ['front','back','left','right']){
        const d=await call('spatial_resolve_relative_wall',{subjectId:item.id,referenceFrame:'use_direction',relation})
        assert.equal(d.status,'resolved',JSON.stringify(d))
        checks.push({degrees,relation,wall:d.selection.name,front:f.directions.front.world})
      }
    }
  }
  const beforeManual=await store.load(project.id)
  await call('spatial_set_furniture_front',{subjectId:item.id,frontAxis:'+X',confirmedByUser:true,evidenceQuote:'本验收实例手动修正模型本地正面 +X'})
  const manual=await store.load(project.id)
  assert.equal(manual.graph.nodes[item.id].metadata.spatialReference.source,'user_confirmed')
  assert.deepEqual(manual.graph.nodes[item.id].asset.orientation,item.asset.orientation)
  const mf=await call('spatial_get_furniture_frame',{subjectId:item.id,referenceFrame:'use_direction'})
  assert.equal(mf.orientation.source,'user_confirmed')
  near(mf.directions.front.world,[Math.cos(.37),0,-Math.sin(.37)])
  await call('undo',{})
  assert.deepEqual((await store.load(project.id)).graph,beforeManual.graph)
  await call('move_node',{id:item.id,rotation:90})
  await call('load_scene',{id:project.id})
  const reloaded=await call('spatial_get_furniture_frame',{subjectId:item.id,referenceFrame:'use_direction'})
  assert.equal(reloaded.status,'resolved')
  near(reloaded.directions.front.world,[localFront[2],0,-localFront[0]])
  const after=await store.load(project.id)
  assert.deepEqual(after.graph.nodes[item.id].asset.orientation,item.asset.orientation)
  for(const id of protectedIds)assert.deepEqual(after.graph.nodes[id],baseline.graph.nodes[id])
  const oldManual=await call('spatial_get_furniture_frame',{subjectId:protectedIds[2],referenceFrame:'use_direction'})
  assert.equal(oldManual.orientation.source,'user_confirmed')
  await writeFile(out+'/native-orientation-'+jobId+'.json',JSON.stringify({projectId:project.id,itemId:item.id,jobId,assetInheritance:true,checks,arbitraryYaw:true,manualOverride:true,undo:true,reload:true,protectedNodes:protectedIds,oldManualOverride:true},null,2))
  await writeFile(out+'/ready.json',JSON.stringify(after,null,2))
  console.log(JSON.stringify({projectId:project.id,itemId:item.id,checks:checks.length,manualOverrideUndoReload:true,protectedNodes:protectedIds.length}))
}finally{await client.close()}
