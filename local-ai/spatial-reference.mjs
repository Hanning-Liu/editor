import { generatedOrientation } from './studio/orientation-store.mjs'
import { createHash } from 'node:crypto'
import { rotateVector } from './editor-src/packages/core/dist/procedural-items/spatial.js'
import { roomWallFaces } from './editor-src/packages/core/dist/agent-operations/room-faces.js'

export const SPATIAL_READ_TOOLS = ['spatial_get_furniture_frame', 'spatial_resolve_relative_wall']
export const SPATIAL_CALIBRATE_TOOL = 'spatial_set_furniture_front'
const EPS = 1e-7
const frames = {
  use_direction: '沿家具使用方向看（座椅采用坐姿）：右 = 前向 × 世界上向',
  facing_front: '站在家具正面、面向家具看：左右与沿使用方向看相反',
  world: '世界坐标：右 +X、左 −X、前 −Z、后 +Z；不采用家具方向',
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
export const spatialSceneHash = nodes => createHash('sha256').update(JSON.stringify(canonical(nodes))).digest('hex')
const add = (a, b) => a.map((x, i) => x + b[i])
const scale = (a, b) => a.map((x, i) => x * b[i])
const neg = a => a.map(x => -x)
const length = a => Math.hypot(...a)
const unit = a => length(a) > EPS ? a.map(x => x / length(a)) : null
const rotate = (v, node) => rotateVector(v, node.rotation || [0, 0, 0])
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0]
const plan = v => [v[0], v[2]]
const failure = (status, message, extra = {}) => ({ kind: 'spatial_reference', schemaVersion: 1, status, message, ...extra })

function orientation(item) {
  const saved = item.metadata?.spatialReference
  if (saved) {
    if (saved.version !== 1 || saved.assetId !== item.asset.id || saved.assetSrc !== item.asset.src ||
        saved.source !== 'user_confirmed' || !Array.isArray(saved.frontLocal) || saved.frontLocal.length !== 3 ||
        !saved.frontLocal.every(Number.isFinite) || !unit(saved.frontLocal) || !saved.evidenceQuote)
      return { status: 'needs_calibration', message: '家具正面标定无效或资产已替换，请重新确认。' }
    return { frontLocal: unit(saved.frontLocal), source: 'user_confirmed', evidence: saved.evidenceQuote }
  }
  const assetRef=generatedOrientation(item) || item.asset.orientation
  if(assetRef){
    if(assetRef.assetId && (assetRef.assetId!==item.asset.id||assetRef.assetSrc!==item.asset.src))return {status:'needs_calibration',message:'资产朝向与当前模型绑定不一致。'}
    if(assetRef.status==='symmetric')return {status:'no_unique_front',message:'此资产没有唯一正面，请明确世界坐标或设置实例使用方向。'}
    if(assetRef.status!=='accepted'||!Array.isArray(assetRef.frontLocal)||assetRef.frontLocal.length!==3||!assetRef.frontLocal.every(Number.isFinite)||Math.abs(assetRef.frontLocal[1])>1e-6||!unit(assetRef.frontLocal))return {status:'needs_calibration',message:assetRef.reason||'资产朝向尚待复核。'}
    return {frontLocal:unit(assetRef.frontLocal),source:assetRef.source,evidence:assetRef.reason,recordHash:assetRef.recordHash,modelSha256:assetRef.modelSha256}
  }
  // One reviewed built-in asset. Names, category labels and yaw=0 alone are not front evidence.
  if (item.asset.id === 'sofa' && item.asset.src === '/items/sofa/model.glb' && item.asset.source === 'library')
    return { frontLocal: [0, 0, 1], source: 'reviewed_catalog', evidence: '内置 Sofa：已核对使用方向为模型本地 +Z；左右采用坐姿约定。' }
  return { status: 'needs_calibration', message: '此资产尚无可靠正面标定。不能仅凭名称或 rotation=0 假定朝向。请明确模型本地正面轴后标定。' }
}

function pose(nodes, item) {
  let position = [...item.position]
  const ancestors = []
  const seen = new Set([item.id])
  let parent = nodes[item.parentId]
  while (parent && parent.type !== 'level') {
    if (seen.has(parent.id)) return failure('invalid_hierarchy', '承托关系存在循环。')
    seen.add(parent.id)
    if (parent.type === 'item') {
      ancestors.push(parent)
      // Renderer children are siblings of the scaled model, not children of its scale group.
      position = add(parent.position, rotate(position, parent))
    } else if (!['slab', 'ceiling'].includes(parent.type)) {
      return failure('unsupported_host', '该宿主采用专用安装坐标，尚不能可靠解析家具方位。', { hostId: parent.id, hostType: parent.type })
    }
    parent = nodes[parent.parentId]
  }
  if (!parent) return failure('level_not_found', '家具没有可确定的楼层。')
  const level = parent
  const worldAncestors = []
  parent = nodes[level.parentId]
  while (parent) {
    if (seen.has(parent.id)) return failure('invalid_hierarchy', '楼层祖先存在循环。')
    seen.add(parent.id)
    if (!['building', 'site'].includes(parent.type)) return failure('unsupported_host', '无法解析楼层到世界的坐标变换。')
    if ((parent.rotation?.[0] || 0) !== 0 || (parent.rotation?.[2] || 0) !== 0)
      return failure('non_planar_building', '建筑或场地发生倾斜，请先明确可用的水平参照平面。')
    worldAncestors.push(parent)
    parent = nodes[parent.parentId]
  }
  const toWorld = point => worldAncestors.reduce((p, a) => add(a.position || [0, 0, 0], rotate(p, a)), point)
  const levelVectorToWorld = vector => worldAncestors.reduce((v, a) => rotate(v, a), vector)
  const worldVectorToLevel = vector => [...worldAncestors].reverse().reduce((v, a) => rotateVector(v, [0, -(a.rotation?.[1] || 0), 0]), vector)
  return { level, position, ancestors, worldAncestors, toWorld, levelVectorToWorld, worldVectorToLevel }
}

export function furnitureReferenceFrame(nodes, { subjectId, referenceFrame }) {
  const item = nodes[subjectId]
  if (item?.type !== 'item') return failure('item_required', '参照对象必须是场景中的家具实例。', { subjectId })
  if (!frames[referenceFrame]) return failure('reference_frame_required', '必须明确 use_direction、facing_front 或 world 参照系。')
  const p = pose(nodes, item)
  if (p.status) return p
  const subject = { id: item.id, name: item.name || item.asset.name, assetId: item.asset.id, parentId: item.parentId }
  const ref = orientation(item)
  if (referenceFrame !== 'world' && ref.status) return failure(ref.status, ref.message, { subject, referenceFrame })
  let front, right
  if (referenceFrame === 'world') { front = [0, 0, -1]; right = [1, 0, 0] }
  else {
    const modelVector = vector => p.levelVectorToWorld(p.ancestors.reduce((v, a) => rotate(v, a),
      rotate(scale(rotateVector(scale(vector, item.asset.scale || [1, 1, 1]), item.asset.rotation || [0, 0, 0]), item.scale || [1, 1, 1]), item)))
    const up = unit(modelVector([0, 1, 0]))
    const raw = modelVector(ref.frontLocal)
    if (!up || up[1] < 0.98 || Math.abs(raw[1]) > length(raw) * 0.05)
      return failure('non_planar_furniture', '家具的使用方向或上向显著倾斜，不能假装成水平前后左右。', { subject })
    front = unit([raw[0], 0, raw[2]])
    if (!front) return failure('invalid_front', '家具正面在水平面的投影为零。', { subject })
    right = [ -front[2], 0, front[0] ]
    if (referenceFrame === 'facing_front') { front = neg(front); right = neg(right) }
  }
  const directions = { front, back: neg(front), right, left: neg(right) }
  return {
    kind: 'spatial_reference', schemaVersion: 1, status: 'resolved', subject,
    referenceFrame, referenceDescription: frames[referenceFrame],
    orientation: referenceFrame === 'world' ? { source: 'explicit_world_axes' } : ref,
    levelId: p.level.id, originLevel: plan(p.position), originWorld: plan(p.toWorld(p.position)),
    directions: Object.fromEntries(Object.entries(directions).map(([k, world]) => [k, { world, level: p.worldVectorToLevel(world) }])),
    transformEvidence: { itemRotation: item.rotation, itemModelScale: item.scale, assetRotation: item.asset.rotation,
      assetScale: item.asset.scale, supportChain: p.ancestors.map(a => ({ id: a.id, rotation: a.rotation, position: a.position })),
      worldAncestors: p.worldAncestors.map(a => ({ id: a.id, rotation: a.rotation, position: a.position })),
      originConvention: '家具放置锚点；模型缩放不传给承托子节点。坐标单位米、旋转弧度。' },
    sceneHash: spatialSceneHash(nodes),
  }
}

const onSegment = (p, a, b) => Math.abs(cross2([p[0]-a[0],p[1]-a[1]],[b[0]-a[0],b[1]-a[1]])) < EPS &&
  p[0] >= Math.min(a[0], b[0])-EPS && p[0] <= Math.max(a[0], b[0])+EPS && p[1] >= Math.min(a[1], b[1])-EPS && p[1] <= Math.max(a[1], b[1])+EPS
function contains(polygon, point) {
  let inside = false
  for (let i = 0, j = polygon.length-1; i < polygon.length; j = i++) {
    const a=polygon[i], b=polygon[j]
    if (onSegment(point,a,b)) return false
    if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside
  }
  return inside
}
function rayHit(origin, direction, a, b) {
  const segment=[b[0]-a[0],b[1]-a[1]], q=[a[0]-origin[0],a[1]-origin[1]], d=cross2(direction,segment)
  if (Math.abs(d)<EPS) return null
  const distance=cross2(q,segment)/d, t=cross2(q,direction)/d
  if (distance<=EPS || t < -EPS || t > 1+EPS) return null
  return { distance, t: Math.max(0,Math.min(1,t)), point:origin.map((v,i)=>v+distance*direction[i]) }
}

export function relativeWallDecision(nodes, input) {
  const frame = furnitureReferenceFrame(nodes,input)
  const base = { ...frame, kind: 'relative_wall_decision', relation: input.relation }
  if (frame.status !== 'resolved') return base
  if (!frame.directions[input.relation]) return { ...base, status: 'invalid_relation', message: '请选择 front/back/left/right。' }
  const rooms = Object.values(nodes).filter(n=>n.type==='zone' && n.spaceRole==='room' && n.parentId===frame.levelId &&
    (!input.roomId || n.id===input.roomId) && contains(n.polygon,frame.originLevel) && !(n.holes||[]).some(h=>contains(h,frame.originLevel)))
  if (rooms.length !== 1) return { ...base, status: rooms.length ? 'ambiguous_room' : 'room_not_found', message:'参照家具必须位于唯一明确的房间内部，请指定 roomId 或调整参照对象。', rooms:rooms.map(r=>({id:r.id,name:r.name})) }
  const room=rooms[0], dir=plan(frame.directions[input.relation].level)
  const walls=Object.values(nodes).filter(n=>n.type==='wall' && n.parentId===frame.levelId && (!room.boundaryWallIds?.length || room.boundaryWallIds.includes(n.id)))
  if (walls.some(w=>Math.abs(w.curveOffset||0)>EPS)) return { ...base, status:'curved_boundary_unsupported', message:'此房间包含曲墙，目前不把直线射线结果冒充曲墙上的准确编辑位置。' }
  const exits=[room.polygon,...room.holes||[]].flatMap(r=>r.map((a,i)=>rayHit(frame.originLevel,dir,a,r[(i+1)%r.length]))).filter(Boolean).sort((a,b)=>a.distance-b.distance)
  const exit=exits[0]
  if (!exit) return { ...base, status:'room_exit_not_found', message:'无法确定该方向离开房间的位置。' }
  const spans=roomWallFaces(nodes,{...room,boundaryWallIds:walls.map(w=>w.id)})
  const candidates=walls.map(w=>{
    const hit=rayHit(frame.originLevel,dir,w.start,w.end)
    const roomSpans=spans.filter(s=>s.wallId===w.id).map(s=>({t0:s.t0,t1:s.t1,face:s.face}))
    const nearExit=hit && Math.abs(hit.distance-exit.distance) <= (w.thickness||0.2)+0.05
    const inSpan=hit && roomSpans.some(s=>hit.t>=s.t0-EPS && hit.t<=s.t1+EPS)
    const eligible=!!(nearExit && inSpan)
    return {wallId:w.id,name:w.name||w.id,start:w.start,end:w.end,eligible,
      rayDistanceM:hit?.distance??null,hitLevel:hit?.point??null,t:hit?.t??null,roomSpans,
      reason: !hit ? '该方向的射线不与此墙段正向相交' : !nearExit ? '此墙不是该方向离开当前房间的第一边界' : !inSpan ? '交点不在此房间对应的墙面范围' : '射线命中当前房间第一边界，且交点位于该房间墙段内',
      openings:Object.values(nodes).filter(n=>['door','window'].includes(n.type)&&n.parentId===w.id).map(n=>({id:n.id,type:n.type,position:n.position,width:n.width})) }
  }).sort((a,b)=>(a.rayDistanceM??Infinity)-(b.rayDistanceM??Infinity)||a.wallId.localeCompare(b.wallId))
  const eligible=candidates.filter(c=>c.eligible)
  const selection=eligible[0]
  if (!selection) return {...base,status:'no_matching_wall',room:{id:room.id,name:room.name},candidates,message:'该方向未命中可靠的房间边界墙，不执行编辑。'}
  if (eligible[1] && Math.abs(eligible[1].rayDistanceM-selection.rayDistanceM)<1e-5)
    return {...base,status:'ambiguous_corner',room:{id:room.id,name:room.name},candidates,message:'射线落在墙角，两堵墙同样符合；请明确哪堵墙。'}
  const selected={wallId:selection.wallId,name:selection.name,t:selection.t,hitLevel:selection.hitLevel,distanceM:selection.rayDistanceM,reason:selection.reason,roomSpans:selection.roomSpans}
  return {...base,status:'resolved',room:{id:room.id,name:room.name},candidates,selection:selected,
    recommendedParameters:{wallId:selected.wallId,t:selected.t},
    resolutionId:createHash('sha256').update(JSON.stringify([frame.sceneHash,input.subjectId,input.referenceFrame,input.relation,selected])).digest('hex'),
    message:'已明确参照系并选定房间边界墙；这只是解析结果，尚未修改场景。'}
}

export function calibrateFurnitureFront(nodes,input) {
  const item=nodes[input.subjectId]
  if(item?.type!=='item') throw Error('参照对象必须是家具实例')
  const axes={'+X':[1,0,0],'-X':[-1,0,0],'+Z':[0,0,1],'-Z':[0,0,-1]}
  if(!axes[input.frontAxis] || !input.confirmedByUser || !input.evidenceQuote?.trim()) throw Error('需要用户明确确认模型本地正面轴和原始说明')
  const reference={version:1,assetId:item.asset.id,assetSrc:item.asset.src,frontLocal:axes[input.frontAxis],source:'user_confirmed',evidenceQuote:input.evidenceQuote}
  return {result:{kind:'spatial_calibration',subjectId:item.id,reference,layoutChanged:false},changes:{update:[{id:item.id,data:{metadata:{...item.metadata,spatialReference:reference}}}]}}
}
