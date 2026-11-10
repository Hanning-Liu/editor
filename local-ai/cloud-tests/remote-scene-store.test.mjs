import test from 'node:test'
import assert from 'node:assert/strict'
import {createRemoteSceneStore} from '../remote-scene-store.mjs'

test('only explicit 429 rejections retry; a write executes once after rate limiting',async()=>{
 process.env.PASCAL_SCENE_API_TOKEN='unit-only'
 const original=globalThis.fetch;let requests=0,writes=0
 globalThis.fetch=async()=>{requests++;if(requests===1)return Response.json({message:{message:'Request limit exceeded.'}},{status:429,headers:{'Retry-After':'0'}});writes++;return Response.json({value:{id:'example',version:2}})}
 try{const r=await createRemoteSceneStore().save({id:'example'});assert.equal(r.version,2);assert.equal(requests,2);assert.equal(writes,1)}finally{globalThis.fetch=original}
})
test('5xx and object errors stay readable and never replay an uncertain write',async()=>{
 process.env.PASCAL_SCENE_API_TOKEN='unit-only';const original=globalThis.fetch;let requests=0
 globalThis.fetch=async()=>{requests++;return Response.json({message:{message:'Upstream unavailable'}},{status:503})}
 try{await assert.rejects(createRemoteSceneStore().save({id:'example'}),{message:'Scene store save HTTP 503: {"message":"Upstream unavailable"}',status:503});assert.equal(requests,1)}finally{globalThis.fetch=original}
})
