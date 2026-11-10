import test from 'node:test'
import assert from 'node:assert/strict'
import {assess,seal,validRecord,snapshot} from '../studio/orientation-policy.mjs'
import {furnitureReferenceFrame,relativeWallDecision} from '../spatial-reference.mjs'
import {fixture} from './spatial-fixture.mjs'
import {relativeRequestPolicy,assertRelativeWallEdit} from '../relative-edit-policy.mjs'
const views=Array.from({length:8},(_,id)=>({id,frontLocal:[Math.sin(id*Math.PI/4),0,Math.cos(id*Math.PI/4)]}))
const observation={category:'chair',hasUniqueFront:true,frontViewId:0,frontRole:'seated_forward',symmetry:'none',confidence:.95,observations:[{viewId:0,feature:'seat opening and backrest'},{viewId:4,feature:'closed back panel'}],reason:'座面向外，靠背在相反侧'}
const base={version:1,modelSha256:'a'.repeat(64),coordinateFrame:'glb-local',source:'vlm_inferred',...assess(observation,observation,views)}
test('consensus accepts a front, while low evidence and disagreement require review',()=>{
 assert.equal(assess(observation,observation,views).status,'accepted')
 for(const second of [{...observation,frontViewId:4},{...observation,confidence:.5},{...observation,observations:[]},{...observation,frontRole:'foot_side'},{...observation,category:'other'}])assert.equal(assess(observation,second,views).status,'needs_review')
 const symmetric={...observation,category:'stool',hasBackrest:false,hasUniqueFront:false,frontViewId:null,frontRole:'none',symmetry:'radial'}
 assert.equal(assess(symmetric,symmetric,views).status,'symmetric')
 assert.equal(assess({...symmetric,hasBackrest:true},{...symmetric,hasBackrest:true},views).status,'needs_review')
 assert.equal(assess(symmetric,{...symmetric,category:'chair'},views).status,'needs_review')
 assert.equal(assess(symmetric,{...symmetric,confidence:.2},views).status,'needs_review')
 const table={...symmetric,category:'table',hasBackrest:null,symmetry:'radial'}
 assert.equal(assess(table,table,views).status,'symmetric')
 assert.equal(assess({...table,hasBackrest:undefined},table,views).status,'needs_review')
 assert.equal(assess({...symmetric,symmetry:'unknown'},symmetric,views).status,'needs_review')
})
test('records bind the exact model and reject tampered/non-horizontal directions',()=>{
 const r=seal(base);assert.ok(validRecord(r,base.modelSha256));assert.ok(!validRecord(r,'b'.repeat(64)));assert.ok(!validRecord({...r,frontLocal:[1,0,0]},base.modelSha256));assert.ok(!validRecord(seal({...base,frontLocal:[0,1,0]}),base.modelSha256));assert.ok(!validRecord(seal({...base,coordinateFrame:'blender'}),base.modelSha256))
})
test('asset orientation survives arbitrary instance yaw; per-instance manual calibration wins',()=>{
 const nodes=fixture(),item=nodes.item_sofa;item.asset.id='external-chair';item.asset.src='https://example.test/chair.glb'
 item.asset.orientation=snapshot(seal(base),item.asset.id,item.asset.src)
 for(const yaw of [0,.37,Math.PI/2,Math.PI,Math.PI*1.5]){item.rotation[1]=yaw;const f=furnitureReferenceFrame(nodes,{subjectId:item.id,referenceFrame:'use_direction'});assert.equal(f.status,'resolved');assert.ok(Math.abs(f.directions.front.world[0]-Math.sin(yaw))<1e-7);assert.ok(Math.abs(f.directions.front.world[2]-Math.cos(yaw))<1e-7)}
 item.rotation=[0,0,0];item.metadata.spatialReference={version:1,assetId:item.asset.id,assetSrc:item.asset.src,frontLocal:[1,0,0],source:'user_confirmed',evidenceQuote:'模型本地正面 +X'}
 assert.deepEqual(furnitureReferenceFrame(nodes,{subjectId:item.id,referenceFrame:'use_direction'}).directions.front.world,[1,0,0])
 item.asset.orientation={...item.asset.orientation,status:'needs_review'};assert.equal(furnitureReferenceFrame(nodes,{subjectId:item.id,referenceFrame:'use_direction'}).orientation.source,'user_confirmed')
})
test('uncertain and symmetric assets stop furniture-relative edits but allow explicit world axes',()=>{
 const nodes=fixture(),item=nodes.item_sofa;item.asset.orientation=snapshot(seal({...base,status:'symmetric',frontRole:'none',frontLocal:undefined}),item.asset.id,item.asset.src)
 assert.equal(relativeWallDecision(nodes,{subjectId:item.id,referenceFrame:'use_direction',relation:'right'}).status,'no_unique_front')
 assert.equal(relativeWallDecision(nodes,{subjectId:item.id,referenceFrame:'world',relation:'right'}).status,'resolved')
})
test('asset evidence updates invalidate approved wall decisions without moving nodes',()=>{
 const nodes=fixture(),item=nodes.item_sofa;item.asset.orientation=snapshot(seal(base),item.asset.id,item.asset.src)
 const d=relativeWallDecision(nodes,{subjectId:item.id,referenceFrame:'use_direction',relation:'right'}),p=relativeRequestPolicy('在沙发右侧墙开门',nodes)
 item.asset.orientation={...item.asset.orientation,recordHash:'b'.repeat(64)}
 assert.throws(()=>assertRelativeWallEdit('add_door',{wallId:d.selection.wallId,t:.5,width:.9},p,[d],nodes),{code:'scene_conflict'})
})
