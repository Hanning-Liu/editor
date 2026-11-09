import assert from 'node:assert/strict'
import {createMcpSession} from '../mcp-session.mjs'
import {MOVE_ROOFS_CASES} from '../editor-src/packages/core/src/agent-operations/__fixtures__/roof-cases.ts'
import {writeFile} from 'node:fs/promises'
const {client:c,transport}=createMcpSession()
try{
 await c.connect(transport)
 const made=await c.callTool({name:'create_project',arguments:{name:'旧屋顶归层持久化验收-20261109'}})
 const p=made.structuredContent as {id:string;version:number}
 const fixture=MOVE_ROOFS_CASES[0]!,graph=fixture.scene()
 const imported=await fetch('http://127.0.0.1:3002/api/scenes/'+p.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({graph,name:'旧屋顶归层持久化验收-20261109',expectedVersion:p.version})})
 assert.equal(imported.status,200,await imported.clone().text())
 await c.callTool({name:'load_scene',arguments:{id:p.id}})
 const r=await c.callTool({name:fixture.tool,arguments:fixture.input})
 assert.ok(!r.isError,JSON.stringify(r))
 const after=await(await fetch('http://127.0.0.1:3002/api/scenes/'+p.id)).json()
 const result=r.structuredContent||JSON.parse((r.content[0] as {text:string}).text)
 const errors=fixture.expect.check?.(result,after.graph.nodes)||[]
 assert.deepEqual(errors,[])
 assert.notEqual(after.graph.nodes.roof_low.parentId,'level_g')
 await writeFile('full-tools-tests/migration-persisted-result.json',JSON.stringify({name:fixture.tool,ok:true,id:p.id,version:after.version,result,errors},null,2))
 console.log('PASS real persisted legacy roof migration',p.id,after.version)
}finally{await c.close()}
