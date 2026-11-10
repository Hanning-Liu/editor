import assert from 'node:assert/strict'
import {createMcpSession} from '../mcp-session.mjs'
const {client,transport}=createMcpSession()
try {
 await client.connect(transport)
 const tools=(await client.listTools()).tools
 for(const name of ['spatial_get_furniture_frame','spatial_resolve_relative_wall','spatial_set_furniture_front']) assert.ok(tools.some(t=>t.name===name),name)
 const r=await client.callTool({name:'spatial_get_furniture_frame',arguments:{subjectId:'item_missing',referenceFrame:'use_direction'}})
 console.log(JSON.stringify({spatialTools:tools.filter(t=>t.name.startsWith('spatial_')).map(t=>({name:t.name,readOnly:t.annotations?.readOnlyHint})),result:r}))
}finally{await client.close()}
