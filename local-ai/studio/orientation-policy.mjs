import { createHash } from 'node:crypto'
export const ORIENTATION_VERSION = 1
export const ORIENTATION_POLICY = 'multiview-consensus-v2'
export const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v
export const digest = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
export const fileDigest = bytes => createHash('sha256').update(bytes).digest('hex')
export function seal(record) { const {recordHash,...data}=record;return {...data,recordHash:digest(data)} }
export function validRecord(r,hash) {
  if (!r || r.coordinateFrame!=='glb-local' || !['vlm_inferred','asset_user_confirmed','generator_verified'].includes(r.source) || r.version!==1 || r.modelSha256!==hash || !['accepted','needs_review','symmetric'].includes(r.status)) return false
  const {recordHash,...data}=r
  if (digest(data)!==recordHash) return false
  return r.status!=='accepted' || (Array.isArray(r.frontLocal)&&r.frontLocal.length===3&&r.frontLocal.every(Number.isFinite)&&Math.abs(r.frontLocal[1])<1e-6&&Math.abs(Math.hypot(...r.frontLocal)-1)<1e-5)
}
export function snapshot(record,assetId,assetSrc) {
  if (!validRecord(record,record?.modelSha256)) return undefined
  const {version,modelSha256,recordHash,status,source,frontLocal,frontRole,category,reason}=record
  return {version,modelSha256,recordHash,status,source,...(frontLocal?{frontLocal}:{}),frontRole,category,reason,assetId,assetSrc}
}
export function assess(first,second,views) {
  const base={category:String(first?.category||'other').slice(0,60),frontRole:String(first?.frontRole||'unknown').slice(0,60)}
  const reason=[first?.reason,second?.reason].filter(x=>typeof x==='string').join('；').slice(0,1500)
  const allowed=['chair','sofa','bed','cabinet','desk','table','stool','bench']
  const roles={chair:'seated_forward',sofa:'seated_forward',bed:'foot_side',cabinet:'operating_face',desk:'operating_face',table:'operating_face',stool:'seated_forward',bench:'seated_forward'}
  const evidence = p => Array.isArray(p?.observations)&&p.observations.filter(o=>Number.isInteger(o.viewId)&&views.some(v=>v.id===o.viewId)&&typeof o.feature==='string'&&o.feature.length>=4).length>=2
  // A backed bench has a seated direction even though its category can also
  // contain backless, multi-sided benches. Never infer symmetry from its name.
  if (first?.hasUniqueFront===false && second?.hasUniqueFront===false && first.hasBackrest===false && second.hasBackrest===false && first.category===second.category && ['table','stool','bench'].includes(base.category) && first.frontRole==='none' && second.frontRole==='none' && Number(first.confidence)>=.85 && Number(second.confidence)>=.85 && ['radial','multi_side'].includes(first.symmetry) && first.symmetry===second.symmetry && evidence(first)&&evidence(second))
    return {...base,status:'symmetric',frontRole:'none',reason:reason||'多视图显示物体没有唯一的语义正面。'}
  const view=views.find(v=>v.id===first?.frontViewId)
  if (first?.hasUniqueFront===true && second?.hasUniqueFront===true && view && first.frontViewId===second.frontViewId && first.category===second.category && first.frontRole===second.frontRole && allowed.includes(base.category) && first.frontRole===roles[base.category] && Number(first.confidence)>=.85 && Number(second.confidence)>=.85 && evidence(first)&&evidence(second))
    return {...base,status:'accepted',frontLocal:view.frontLocal,reason:reason||'两组观察对语义正面一致。'}
  return {...base,status:'needs_review',...(view?{candidateFrontLocal:view.frontLocal,candidateViewId:view.id}:{}),reason:reason||'多视图证据不足或两次观察不一致，请复核。'}
}
