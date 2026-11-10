import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {editorFetch} from '../connection.mjs'
const [out,kind='door']=process.argv.slice(2);const project=JSON.parse(await readFile(out+'/project.json'))
const response=await editorFetch('/api/local-chat?sceneId='+project.id);assert.ok(response.ok);const history=await response.json();assert.equal(history.run.status,'completed',JSON.stringify(history.run))
const r=await editorFetch('/api/scenes/'+project.id);assert.ok(r.ok);const after=await r.json();const before=JSON.parse(await readFile(out+'/ready.json'))
const events=(history.currentEvents||history.events).filter(e=>e.type==='tool'&&e.state!=='running');const errors=events.filter(e=>e.state==='error');assert.equal(errors.length,0,JSON.stringify(errors))
if(kind==='door'){
 const opening=events.find(e=>e.name==='add_door'&&e.state==='done');assert.equal(opening?.spatialDecisions?.length,1)
 const target=opening.spatialDecisions[0].selection.wallId;const doors=Object.values(after.graph.nodes).filter(n=>n.type==='door');assert.equal(doors.length,1);assert.equal(doors[0].parentId,target)
 assert.equal(after.graph.nodes[target].name,out.endsWith('/cloud')?'Wall 2':'Wall 3')
}else{
 assert.equal(kind,'directions');const decisions=events.filter(e=>e.name==='spatial_resolve_relative_wall'&&e.state==='done').map(e=>e.result)
 assert.deepEqual([...new Set(decisions.map(d=>d.relation))].sort(),['back','front','left','right'])
 const expected=out.endsWith('/cloud')?{front:'Wall 1',back:'Wall 3',left:'Wall 4',right:'Wall 2'}:{front:'Wall 2',back:'Wall 4',left:'Wall 1',right:'Wall 3'}
 for(const d of decisions){assert.equal(d.status,'resolved');assert.equal(d.referenceFrame,'use_direction');assert.equal(d.selection.name,expected[d.relation])}
 let baseline=before;try{baseline=JSON.parse(await readFile(out+'/after-door.json'))}catch(e){if(e.code!=='ENOENT')throw e}assert.deepEqual(after.graph,baseline.graph)
}
for(const n of Object.values(before.graph.nodes)){const a=after.graph.nodes[n.id];assert.ok(a,'Existing node remains '+n.id);if(n.type==='item')assert.deepEqual(a,n);if(n.type==='wall'){assert.deepEqual(a.start,n.start);assert.deepEqual(a.end,n.end)}}
await writeFile(out+'/history-'+kind+'.json',JSON.stringify(history,null,2));await writeFile(out+'/after-'+kind+'.json',JSON.stringify(after,null,2));const report={sceneId:project.id,kind,version:after.version,furnitureUnchanged:true,supportsPreserved:true,tools:events.map(e=>({name:e.name,state:e.state,wall:e.result?.selection?.name,relation:e.result?.relation})),reply:history.messages.at(-1).content};await writeFile(out+'/report-'+kind+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
