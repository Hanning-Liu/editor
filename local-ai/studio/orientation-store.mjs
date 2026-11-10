import{readFileSync,statSync}from'node:fs'
import path from'node:path'
import{DATA}from'./config.mjs'
import{publicUrl}from'../connection.mjs'
import{fileDigest,validRecord,snapshot}from'./orientation-policy.mjs'
const hashes=new Map()
export function modelHash(file){const s=statSync(file),key=s.size+':'+s.mtimeMs+':'+s.ctimeMs;let old=hashes.get(file);if(!old||old.key!==key){old={key,hash:fileDigest(readFileSync(file))};hashes.set(file,old)}return old.hash}
export function generatedOrientation(item){
 const id=item.asset?.id?.match(/^studio-([a-f0-9-]{36})$/)?.[1]
 if(!id)return null
 const folder=path.join(DATA,'jobs',id)
 try{
  const job=JSON.parse(readFileSync(path.join(folder,'job.json'),'utf8'))
  const relative=job.cloudArtifacts?.['model.glb']?'/api/artifacts/'+job.cloudArtifacts['model.glb']+'?name=model.glb':`/api/local-studio?sceneId=${job.sceneId}&action=file&jobId=${id}&name=model.glb`
  const src=publicUrl(relative)
  if(item.asset.src!==src&&item.asset.src!==relative)return {status:'needs_review',reason:'资产模型地址已替换，请重新识别。'}
  const hash=modelHash(path.join(folder,'model.glb')),record=JSON.parse(readFileSync(path.join(folder,'orientation.json'),'utf8'))
  if(!validRecord(record,hash))return {status:'needs_review',reason:'资产朝向证据失效，请重新识别。'}
  return snapshot(record,item.asset.id,item.asset.src)
 }catch{
  // An embedded snapshot remains usable for a copied scene if its original
  // immutable artifact URL still binds it to the exact model.
  const cached=item.asset.orientation
  if(cached?.assetId===item.asset.id&&cached.assetSrc===item.asset.src&&/^https?:/.test(item.asset.src)&&item.asset.src.includes('/api/artifacts/'+cached.modelSha256+'?'))return cached
  return {status:'needs_review',reason:'此生成资产尚未识别正面，请在 Studio 识别或复核。'}
 }
}
