import test from 'node:test'
import assert from 'node:assert/strict'
import { Euler, Vector3 } from 'three'
import { furnitureReferenceFrame, relativeWallDecision, calibrateFurnitureFront, spatialSceneHash } from '../spatial-reference.mjs'

import { fixture } from './spatial-fixture.mjs'
const input=(relation='right',referenceFrame='use_direction')=>({subjectId:'item_sofa',referenceFrame,relation})
const near=(a,b)=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-6,`${a} != ${b}`))

for(const [degrees,expected] of [[0,[3,1,4,2]],[90,[2,4,3,1]],[180,[1,3,2,4]],[270,[4,2,1,3]]]) {
  test(`sofa yaw ${degrees}: front/back/right/left hit the anatomical wall`,()=>{
    const nodes=fixture();nodes.item_sofa.rotation[1]=degrees*Math.PI/180
    const before=structuredClone(nodes)
    for(const [i,relation] of ['front','back','right','left'].entries()) {
      const result=relativeWallDecision(nodes,input(relation))
      assert.equal(result.status,'resolved',JSON.stringify(result))
      assert.equal(result.selection.wallId,'wall_'+expected[i])
      assert.equal(result.candidates.length,4)
      assert.equal(result.candidates.filter(c=>c.eligible).length,1)
    }
    assert.deepEqual(nodes,before)
  })
}
test('facing the object reverses the observer sides; world frame is explicit and yaw independent',()=>{
  const nodes=fixture()
  assert.equal(relativeWallDecision(nodes,input('right','facing_front')).selection.wallId,'wall_2')
  nodes.item_sofa.rotation[1]=Math.PI/2
  assert.equal(relativeWallDecision(nodes,input('right','facing_front')).selection.wallId,'wall_1')
  assert.equal(relativeWallDecision(nodes,input('right','world')).selection.wallId,'wall_2')
})
test('arbitrary item rotation matches Three.js XYZ Euler geometry',()=>{
  const nodes=fixture();nodes.item_sofa.rotation[1]=.37
  const result=furnitureReferenceFrame(nodes,input())
  const oracle=new Vector3(0,0,1).applyEuler(new Euler(0,.37,0,'XYZ'))
  near(result.directions.front.world,oracle.toArray())
  near(result.directions.right.world,[-oracle.z,0,oracle.x])
  assert.equal(relativeWallDecision(nodes,input()).status,'resolved')
})
test('model correction, nonuniform scale and reflection affect its front but not child coordinates',()=>{
  const nodes=fixture();nodes.item_sofa.asset.rotation=[0,Math.PI/2,0]
  assert.equal(relativeWallDecision(nodes,input('front')).selection.wallId,'wall_2')
  nodes.item_sofa.scale=[-2,1,3]
  assert.equal(relativeWallDecision(nodes,input('front')).selection.wallId,'wall_4')
  nodes.item_sofa.asset.rotation=[0,0,0];nodes.item_sofa.scale=[2,1,-3]
  assert.equal(relativeWallDecision(nodes,input('front')).selection.wallId,'wall_1')
})
test('nested supports follow renderer rotations and positions without multiplying the parent model scale',()=>{
  const nodes=fixture();const original=structuredClone(nodes.item_sofa)
  nodes.item_host={...original,id:'item_host',name:'Support',position:[2,0,1.5],rotation:[0,Math.PI/2,0],scale:[5,2,8],children:['item_sofa']}
  nodes.item_sofa.parentId='item_host';nodes.item_sofa.position=[.2,1,0]
  const before=structuredClone(nodes)
  const frame=furnitureReferenceFrame(nodes,input())
  near(frame.originLevel,[2,1.3]);near(frame.directions.front.level,[1,0,0])
  assert.equal(relativeWallDecision(nodes,input('right')).selection.wallId,'wall_3')
  assert.deepEqual(nodes,before)
})
test('rotated/translated buildings expose world vectors and retain room-local target IDs',()=>{
  const nodes=fixture();nodes.building_b.rotation=[0,Math.PI/2,0];nodes.building_b.position=[10,2,-4]
  const frame=furnitureReferenceFrame(nodes,input())
  near(frame.originWorld,[11.5,-6]);near(frame.directions.front.world,[1,0,0]);near(frame.directions.right.world,[0,0,1])
  assert.equal(relativeWallDecision(nodes,input()).selection.wallId,'wall_4')
  assert.equal(relativeWallDecision(nodes,input('right','world')).selection.wallId,'wall_3')
})
test('unknown fronts do not get guessed; explicit calibration updates only semantic metadata',()=>{
  const nodes=fixture();nodes.item_sofa.asset={...nodes.item_sofa.asset,id:'custom',src:'/api/artifacts/custom.glb'}
  assert.equal(furnitureReferenceFrame(nodes,input()).status,'needs_calibration')
  const before=structuredClone(nodes.item_sofa)
  const patch=calibrateFurnitureFront(nodes,{subjectId:'item_sofa',frontAxis:'+X',confirmedByUser:true,evidenceQuote:'这件模型正面为本地+X'})
  nodes.item_sofa={...nodes.item_sofa,...patch.changes.update[0].data}
  assert.deepEqual({...nodes.item_sofa,metadata:before.metadata},before)
  assert.equal(relativeWallDecision(nodes,input('front')).selection.wallId,'wall_2')
  nodes.item_sofa.asset.src='/different.glb'
  assert.equal(furnitureReferenceFrame(nodes,input()).status,'needs_calibration')
})
test('corner ties, overlapping rooms, tilt, curved boundaries and cycles remain explicit refusals',()=>{
  const nodes=fixture();nodes.zone_r.polygon=[[0,0],[4,0],[4,4],[0,4]];nodes.item_sofa.position=[2,0,2]
  nodes.wall_2.end=[4,4];nodes.wall_3.start=[4,4];nodes.wall_3.end=[0,4];nodes.wall_4.start=[0,4];nodes.item_sofa.rotation[1]=Math.PI/4
  assert.equal(relativeWallDecision(nodes,input('front')).status,'ambiguous_corner')
  nodes.zone_other={...nodes.zone_r,id:'zone_other'}
  assert.equal(relativeWallDecision(nodes,input()).status,'ambiguous_room');delete nodes.zone_other
  nodes.item_sofa.rotation=[Math.PI/2,0,0];assert.equal(furnitureReferenceFrame(nodes,input()).status,'non_planar_furniture')
  nodes.item_sofa.rotation=[0,0,0];nodes.wall_1.curveOffset=.3;assert.equal(relativeWallDecision(nodes,input()).status,'curved_boundary_unsupported')
  nodes.item_sofa.parentId='item_sofa';assert.equal(furnitureReferenceFrame(nodes,input()).status,'invalid_hierarchy')
})
test('shared long walls return only the current room spans, and evidence changes with pose',()=>{
  const nodes=fixture();nodes.wall_2.end=[4,6]
  const result=relativeWallDecision(nodes,input('left'))
  assert.equal(result.status,'resolved');assert.equal(result.selection.wallId,'wall_2');assert.ok(Math.abs(result.selection.t-.25)<1e-6)
  assert.ok(result.selection.roomSpans.every(s=>s.t1<=.5+1e-6))
  const hash=result.sceneHash;nodes.item_sofa.rotation[1]=.1
  assert.notEqual(spatialSceneHash(nodes),hash)
})
