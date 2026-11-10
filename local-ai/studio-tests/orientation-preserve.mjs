import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {editorFetch} from '../connection.mjs'
import {validRecord} from '../studio/orientation-policy.mjs'

const [out,mode='local']=process.argv.slice(2)
const before=JSON.parse(await readFile(out+'/'+mode+'-scenes-before.json'))
for(const scene of before){
  const r=await editorFetch('/api/scenes/'+scene.id)
  assert.equal(r.status,200)
  assert.deepEqual((await r.json()).graph,scene.graph,'Original scene changed: '+scene.id)
}
const root=mode==='local'?'/Users/Bill_Admin/Research/pascal-local-qwen38/studio-data/jobs':'/Users/Bill_Admin/Research/pascal-cloud-worker/cloud-production/studio-data/jobs'
const originals=JSON.parse(await readFile(out+'/original-assets.json')).filter(x=>x.name===mode)
for(const a of originals){
  const hash=createHash('sha256').update(await readFile(root+'/'+a.id+'/'+a.file)).digest('hex')
  assert.equal(hash,a.sha256,'Original model/projection changed: '+a.id+'/'+a.file)
}
const r=await editorFetch('/api/local-studio?sceneId='+(mode==='local'?'6cca44a4427a':'73b440acd32a')+'&library=1')
assert.equal(r.status,200)
const jobs=(await r.json()).jobs.filter(j=>j.status==='succeeded'&&j.result?.kind==='model')
const models=[]
for(const j of jobs){
  const record=JSON.parse(await readFile(root+'/'+j.id+'/orientation.json'))
  const hash=createHash('sha256').update(await readFile(root+'/'+j.id+'/model.glb')).digest('hex')
  assert.ok(validRecord(record,hash),j.id)
  assert.equal(j.result.orientation.recordHash,record.recordHash)
  if(mode==='cloud')for(const name of ['orientation.json','orientation-sheet-a.png','orientation-v2.png'])assert.match(j.cloudArtifacts[name],/^[a-f0-9]{64}$/)
  models.push({id:j.id,name:j.name,type:j.type,status:record.status,source:record.source,policy:record.policyVersion,modelSha256:hash,orientationRecordHash:record.recordHash,front:record.frontLocal,cloudPublished:mode==='cloud'})
}
await writeFile(out+'/'+mode+'/preservation-report.json',JSON.stringify({passed:true,originalScenesUnchanged:before.length,originalAssetFilesUnchanged:originals.length,models},null,2))
console.log(JSON.stringify({mode,originalScenes:before.length,originalAssetFiles:originals.length,models:models.length,allPreserved:true}))
