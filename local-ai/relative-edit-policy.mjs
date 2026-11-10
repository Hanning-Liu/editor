import { spatialSceneHash, relativeWallDecision } from './spatial-reference.mjs'

const relationPatterns = {
  right: /右(?:侧|边|方|手)?|\bright\b/i,
  left: /左(?:侧|边|方|手)?|\bleft\b/i,
  front: /前(?:方|面|侧|边|墙)|正对|对面|对着|\bfront\b/i,
  back: /后(?:方|面|侧|边|墙)|背后|背面|\bback\b|\bbehind\b/i,
}
const aliases = [
  {words:['沙发','sofa','couch'],match:/sofa|couch|沙发/i},
  {words:['椅子','椅','chair'],match:/chair|armchair|椅/i},
  {words:['床','bed'],match:/\bbed\b|beds|床/i},
  {words:['桌子','桌','table','desk'],match:/table|desk|桌/i},
]
export function relativeRequestPolicy(text,nodes) {
  const relations=Object.entries(relationPatterns).filter(([,r])=>r.test(text)).map(([k])=>k)
  if (/前后左右/.test(text)) relations.splice(0,relations.length,'front','back','left','right')
  if (!relations.length || !/墙|门|窗|\bwall\b|\bdoor\b|\bwindow\b/i.test(text)) return null
  const items=Object.values(nodes).filter(n=>n.type==='item')
  const exact=items.filter(n=>text.includes(n.id) || (n.name && n.name.length>1 && text.toLowerCase().includes(n.name.toLowerCase())))
  const candidates=exact.length ? exact : items.filter(n=>aliases.some(a=>a.words.some(w=>text.toLowerCase().includes(w)) && a.match.test([n.name,n.asset.name,n.asset.id,...n.asset.tags||[],...n.asset.functionTags||[]].join(' '))))
  if (!candidates.length && !/家具|沙发|椅|桌|床|它的|它右|它左|它前|它后/.test(text)) return null
  // Canonical frame identifiers express the requested convention. Asking to
  // report a world-space vector must not override an explicit use_direction.
  const explicitFrames=[...new Set([...text.matchAll(/\breferenceFrame["']?\s*(?:[:=：]|为|是|采用|\bis\b)\s*["']?(use_direction|facing_front|world)\b/gi)].map(m=>m[1].toLowerCase()))]
  const referenceFrame=explicitFrames.length>1 ? 'ambiguous_reference_frame'
    : explicitFrames.length===1 ? explicitFrames[0]
    : /屏幕|画面|镜头|相机|camera|screen/i.test(text) ? 'camera_unavailable'
    : /世界|全局|world/i.test(text) ? 'world'
    : /面对(?:这|该|这张|这个)?(?:沙发|家具|椅|桌)|站在.*正面|面向.*正面|从.*正面看|facing.front/i.test(text) ? 'facing_front' : 'use_direction'
  const namedRooms=Object.values(nodes).filter(n=>n.type==='zone' && (!n.spaceRole || n.spaceRole==='room') && (text.includes(n.id) || (n.name && n.name.length>1 && text.toLowerCase().includes(n.name.toLowerCase()))))
  const expectedTools=/门|\bdoor\b/i.test(text) ? ['add_door'] : /窗|\bwindow\b/i.test(text) ? ['add_window'] : []
  if (/门.*窗|窗.*门|door.*window|window.*door/i.test(text)) expectedTools.push(...['add_door','add_window'].filter(n=>!expectedTools.includes(n)))
  return {roomId:namedRooms.length===1?namedRooms[0].id:null,subjectId:candidates.length===1?candidates[0].id:null,candidates:candidates.map(n=>({id:n.id,name:n.name||n.asset.name})),
    relations,referenceFrame,expectedTools,
    readOnly:/^\s*(只读|仅查看|仅检查|请只读|请仅|read.only)/i.test(text)||/(?:不要|不得|不)(?:修改|编辑)(?:任何)?(?:场景|项目|模型)/.test(text),
    referenceDescription:referenceFrame==='use_direction'?'默认采用沿家具使用方向（座椅坐姿），不是站在家具正面看':referenceFrame==='facing_front'?'采用站在家具正面、面向家具的观察者方向':referenceFrame==='world'?'采用明确的世界轴：右+X、前-Z':referenceFrame==='ambiguous_reference_frame'?'请求包含多个参照系标识，请明确本次采用哪一个':'当前没有相机证据，不能猜测屏幕相对方向',
  }
}

function reject(code,message,decision) {
  const error=Object.assign(Error(message),{code,spatialDecision:decision})
  throw error
}
export function checkCalibrationRequest(text,args) {
  const quote=args.evidenceQuote||''
  const normalized=quote.replace(/＋/g,'+').replace(/−|－/g,'-').toUpperCase()
  const axes=[...new Set(normalized.match(/[+-][XZ]/g)||[])]
  if (/^\s*(只读|仅查看|仅检查|请只读|请仅)/.test(text) || /(?:不要|不得|别)(?:再)?(?:修改|标定|设置|保存)/.test(text) ||
      axes.length!==1 || axes[0]!==args.frontAxis || !quote || !text.includes(quote) || !/正面|前向|朝向|FRONT/.test(normalized) ||
      !/本地|模型|LOCAL|MODEL/.test(normalized) || !normalized.includes(args.frontAxis))
    reject('front_confirmation_required','正面标定必须引用本条用户消息中明确的模型本地轴；不能把模型猜测或历史助手说法当成用户确认。')
}
export function acceptSpatialResolution(policy,result) {
  if (!policy) return
  if (!policy.subjectId) reject('ambiguous_subject','参照家具不唯一，请先让用户指定哪件家具。',result)
  if (result.subject?.id!==policy.subjectId || result.referenceFrame!==policy.referenceFrame || !policy.relations.includes(result.relation))
    reject('reference_frame_mismatch','解析必须使用当前请求明确的参照家具、方位和参照系，不能换成另一种“右边”。',result)
}

export function assertRelativeWallEdit(name,args,policy,resolutions,nodes) {
  if (!policy) return []
  if (policy.readOnly) reject('read_only_relative_request','本条请求为只读方位检查，不允许编辑场景。')
  if (!policy.subjectId) reject('ambiguous_subject','参照家具不唯一，请先指定家具实例；当前没有执行编辑。')
  if (policy.relations.length !== 1) reject('ambiguous_edit_relation','本条请求包含多个相对方向，请明确本次编辑对应的单一方向；可以先只读检查前后左右。')
  if (policy.referenceFrame==='camera_unavailable') reject('camera_reference_unavailable','没有当前相机参照，不能把屏幕左右转换成家具左右。')
  const calls=name==='run_batch' ? args.calls||[] : [{tool:name,input:args}]
  const receipts=[]
  const hash=spatialSceneHash(nodes)
  for (const call of calls) {
    if (call.tool==='run_batch') reject('relative_batch_nested','相对墙体编辑不支持嵌套批处理。')
    if (!policy.expectedTools.includes(call.tool)) reject('relative_edit_tool_required','本请求的相对墙编辑必须使用对应的门窗工具；不能用补丁、建房或代码绕过目标墙核验。')
    const input=call.input||{}
    const approved=resolutions.filter(r=>r.status==='resolved' && r.subject?.id===policy.subjectId && r.referenceFrame===policy.referenceFrame && policy.relations.includes(r.relation))
    const fresh=approved.filter(r=>r.sceneHash===hash)
    if (!fresh.length) {
      if (approved.length) reject('scene_conflict','方位解析后场景已变化，证据失效。本轮停止，请从最新场景重新解析。',{...approved.at(-1),status:'stale_resolution'})
      reject('spatial_resolution_required',`编辑前必须调用 spatial_resolve_relative_wall；subjectId=${policy.subjectId}，referenceFrame=${policy.referenceFrame}，relation=${policy.relations.join('/')}。`)
    }
    const decision=fresh.find(r=>r.selection?.wallId===input.wallId)
    if (!decision) reject('relative_wall_mismatch',`工具提出的墙与方位解析不一致；当前可选墙为 ${fresh.map(r=>r.selection?.name).join('、')}，不执行该编辑。`,fresh.at(-1))
    const unqualified=relativeWallDecision(nodes,{subjectId:policy.subjectId,referenceFrame:policy.referenceFrame,relation:decision.relation})
    if (unqualified.orientation?.recordHash!==decision.orientation?.recordHash || ['needs_calibration','no_unique_front'].includes(unqualified.status))
      reject('scene_conflict','资产朝向证据已变化，请重新解析再编辑。',{...decision,status:'stale_resolution'})
    if ((policy.roomId && decision.room?.id!==policy.roomId) ||
        (unqualified.status==='ambiguous_room' && (!policy.roomId || decision.room?.id!==policy.roomId)))
      reject('room_confirmation_required','多个房间包含参照家具，必须由用户明确房间；不能由模型用 roomId 消除歧义。',decision)
    if (input.nodeId) reject('relative_new_opening_required','相对墙体新开门窗不能借 nodeId 重建其他位置的既有构件。',decision)
    const t=input.t ?? input.position ?? .5
    const width=input.width ?? (call.tool==='add_door'?.9:1.5)
    if (typeof t!=='number' || typeof width!=='number' || !Number.isFinite(t) || !Number.isFinite(width) || width<=0)
      reject('relative_numeric_dimensions','方位核验要求门窗 t 和 width 使用数字（宽度单位米）。',decision)
    const wall=nodes[input.wallId], length=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1])
    const half=width/(2*length)
    if (!decision.selection.roomSpans.some(s=>t-half>=s.t0-1e-6 && t+half<=s.t1+1e-6))
      reject('outside_room_wall_span','门窗中心或宽度越过了当前房间所对应的墙段。',decision)
    receipts.push({...decision,editTool:call.tool,toolParameters:structuredClone(input)})
  }
  return receipts
}
