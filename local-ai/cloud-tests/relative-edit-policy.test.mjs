import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './spatial-fixture.mjs'
import {relativeWallDecision} from '../spatial-reference.mjs'
import {relativeRequestPolicy,acceptSpatialResolution,assertRelativeWallEdit,checkCalibrationRequest} from '../relative-edit-policy.mjs'
const request='在沙发右边的墙体上开一扇门，不移动家具。以坐姿为准。'
const args={wallId:'wall_4',t:.5,width:.9,height:2.1}
const resolved=nodes=>relativeWallDecision(nodes,{subjectId:'item_sofa',referenceFrame:'use_direction',relation:'right'})
test('a resolution is required; wrong walls and wrong observer frames cannot bypass the guard',()=>{
  const nodes=fixture(),policy=relativeRequestPolicy(request,nodes),decision=resolved(nodes)
  assert.equal(policy.referenceFrame,'use_direction')
  assert.throws(()=>assertRelativeWallEdit('add_door',args,policy,[],nodes),{code:'spatial_resolution_required'})
  assert.throws(()=>assertRelativeWallEdit('add_door',{...args,wallId:'wall_2'},policy,[decision],nodes),{code:'relative_wall_mismatch'})
  assert.throws(()=>acceptSpatialResolution(policy,{...decision,referenceFrame:'facing_front'}),{code:'reference_frame_mismatch'})
  const receipts=assertRelativeWallEdit('add_door',args,policy,[decision],nodes)
  assert.deepEqual(receipts[0].toolParameters,args)
  assert.throws(()=>assertRelativeWallEdit('apply_patch',{patches:[]},policy,[decision],nodes),{code:'relative_edit_tool_required'})
  assert.throws(()=>assertRelativeWallEdit('author_scene',{},policy,[decision],nodes),{code:'relative_edit_tool_required'})
})
test('rotation or wall changes invalidate prior evidence instead of silently using the old side',()=>{
  const nodes=fixture(),policy=relativeRequestPolicy(request,nodes),decision=resolved(nodes)
  nodes.item_sofa.rotation[1]=Math.PI/2
  assert.throws(()=>assertRelativeWallEdit('add_door',args,policy,[decision],nodes),{code:'scene_conflict'})
  const fresh=resolved(nodes)
  assert.equal(fresh.selection.wallId,'wall_3')
  assert.equal(assertRelativeWallEdit('add_door',{...args,wallId:'wall_3'},policy,[fresh],nodes).length,1)
})
test('read-only, multiple sofas and camera references cannot become edits',()=>{
  const nodes=fixture();let policy=relativeRequestPolicy('只读检查沙发前后左右对应的墙，不要修改场景',nodes)
  assert.equal(policy.relations.length,4)
  assert.throws(()=>assertRelativeWallEdit('add_door',args,policy,[resolved(nodes)],nodes),{code:'read_only_relative_request'})
  nodes.item_other={...nodes.item_sofa,id:'item_other'};policy=relativeRequestPolicy(request,nodes)
  assert.equal(policy.subjectId,null)
  assert.throws(()=>assertRelativeWallEdit('add_door',args,policy,[],nodes),{code:'ambiguous_subject'})
  delete nodes.item_other;policy=relativeRequestPolicy('在屏幕上沙发右边墙开门',nodes)
  assert.throws(()=>assertRelativeWallEdit('add_door',args,policy,[resolved(nodes)],nodes),{code:'camera_reference_unavailable'})
})
test('a shared long wall must not be edited in the neighboring room span',()=>{
  const nodes=fixture();nodes.wall_2.end=[4,6]
  const policy=relativeRequestPolicy('在沙发左侧墙开门',nodes)
  const decision=relativeWallDecision(nodes,{subjectId:'item_sofa',referenceFrame:'use_direction',relation:'left'})
  assert.throws(()=>assertRelativeWallEdit('add_door',{...args,wallId:'wall_2',t:.75},policy,[decision],nodes),{code:'outside_room_wall_span'})
  assert.equal(assertRelativeWallEdit('add_door',{...args,wallId:'wall_2',t:.25},policy,[decision],nodes).length,1)
})
test('calibration requires the actual current user quote, not a model-invented confirmation',()=>{
  const text='请标定这件家具的模型本地正面为+X。'
  assert.doesNotThrow(()=>checkCalibrationRequest(text,{frontAxis:'+X',evidenceQuote:text}))
  assert.throws(()=>checkCalibrationRequest('在椅子右侧开门',{frontAxis:'+Z',evidenceQuote:'模型本地正面+Z'}),{code:'front_confirmation_required'})
  assert.throws(()=>checkCalibrationRequest(text,{frontAxis:'+Z',evidenceQuote:text}),{code:'front_confirmation_required'})
})

test('multiple relations, position aliases, default widths and rebuild aliases remain bounded',()=>{
 const nodes=fixture(),decision=resolved(nodes),policy=relativeRequestPolicy(request,nodes)
 assert.throws(()=>assertRelativeWallEdit('add_door',{...args,nodeId:'door_other'},policy,[decision],nodes),{code:'relative_new_opening_required'})
 assert.throws(()=>assertRelativeWallEdit('add_door',args,{...policy,relations:['right','left']},[decision],nodes),{code:'ambiguous_edit_relation'})
 assert.throws(()=>assertRelativeWallEdit('add_window',{wallId:'wall_4',position:.99},{...policy,expectedTools:['add_window']},[decision],nodes),{code:'outside_room_wall_span'})
 assert.throws(()=>assertRelativeWallEdit('add_door',{...args,width:'900 mm'},policy,[decision],nodes),{code:'relative_numeric_dimensions'})
})
