import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { SceneBridge } from '../editor-src/packages/mcp/dist/bridge/scene-bridge.js'
import { createPascalMcpServer } from '../editor-src/packages/mcp/dist/server.js'
import { MOVE_ROOFS_CASES } from '../editor-src/packages/core/src/agent-operations/__fixtures__/roof-cases.ts'
import { writeFile } from 'node:fs/promises'
const fixture=MOVE_ROOFS_CASES[0]!, graph=fixture.scene(),bridge=new SceneBridge()
bridge.setScene(graph.nodes as never,graph.rootNodeIds as never)
bridge.setActiveScene({id:'roof-migration-fixture',name:'Roof fixture',projectId:'roof-migration-fixture',version:1} as never)
const server=createPascalMcpServer({bridge}),client=new Client({name:'roof-fixture',version:'1'})
const [s,c]=InMemoryTransport.createLinkedPair()
try{await Promise.all([server.connect(s),client.connect(c)]);await client.listTools();const r=await client.callTool({name:fixture.tool,arguments:fixture.input});const result=r.structuredContent || JSON.parse((r.content[0] as {text:string}).text);const errors=fixture.expect.check?.(result,bridge.getNodes()) || [];const ok=!r.isError && errors.length===0;await writeFile('full-tools-tests/migration-result.json',JSON.stringify({name:fixture.tool,ok,fixture:fixture.name,result,errors},null,2));console.log({ok,result,errors});if(!ok)process.exitCode=1}finally{await client.close();await server.close()}
