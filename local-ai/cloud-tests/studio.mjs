import { editorFetch } from '../connection.mjs'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const [out, command, type] = process.argv.slice(2)
const project = JSON.parse(await readFile(path.join(out, 'project.json'), 'utf8'))
const api = '/api/local-studio?sceneId=' + project.id
const file = path.join(out, 'studio-jobs.json')
let jobs
try { jobs = JSON.parse(await readFile(file, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e; jobs = {} }
async function request(action, body, query = '') {
  const response = await editorFetch(api + '&action=' + action + query, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {})
  const data = await response.json()
  assert.ok(response.ok, JSON.stringify(data))
  return data
}
const prompts = {
  render: 'A warm Scandinavian living room with cream walls, pale oak floor and a beige sofa. Preserve the reference room geometry and camera.',
  material: 'Natural pale oak wood grain. Fine straight grain, subtle knots, realistic flat evenly lit surface, seamless repeating texture.',
  blender: 'Create one simple wooden stool with a square seat, four vertical legs and four horizontal support rails. Natural oak material. No extra objects.',
  pbr: 'Derive a complete oak wood PBR material from this base color texture.',
  trellis: 'Reconstruct the single wooden stool in the reference image, retaining its seat, legs and proportions.',
}
if (command === 'submit') {
  assert.ok(prompts[type])
  if (jobs[type]?.id) throw Error('This generation already has an acceptance receipt; inspect it rather than replaying the write')
  const body = { type, name: '云网关验收-' + type, prompt: prompts[type], generationKey: jobs[type]?.generationKey || randomUUID(), settings: { resolution: 512, textureResolution: 512, faceLimit: 5000, width: 0.6, height: 0.55, depth: 0.6, levelId: project.defaultLevelId, view: 'interior', seed: 43 } }
  if (type === 'pbr' || type === 'trellis') {
    const source = jobs[type === 'pbr' ? 'material' : 'blender']
    assert.ok(source, 'Generate and verify the source job first')
    const actual = await request('get', null, '&jobId=' + source.id)
    assert.equal(actual.status, 'succeeded', JSON.stringify(actual))
    body.sourceJobId = source.id
  }
  jobs[type] = { generationKey: body.generationKey }
  await writeFile(file, JSON.stringify(jobs, null, 2))
  await writeFile(path.join(out, 'studio-submit-' + type + '.json'), JSON.stringify(body, null, 2))
  const job = await request('submit', body)
  jobs[type] = { id: job.id, generationKey: job.generationKey }
  await writeFile(file, JSON.stringify(jobs, null, 2))
  console.log(JSON.stringify({ submitted: type, id: job.id, status: job.status }))
} else if (command === 'status') {
  for (const [kind, job] of Object.entries(jobs)) {
    if (!job.id) { console.log(JSON.stringify({ type: kind, submissionPending: true, generationKey: job.generationKey })); continue }
    const actual = await request('get', null, '&jobId=' + job.id)
    await writeFile(path.join(out, 'studio-' + kind + '.json'), JSON.stringify(actual, null, 2))
    console.log(JSON.stringify({ type: kind, id: actual.id, status: actual.status, phase: actual.phase, error: actual.error }))
  }
} else if (command === 'config') {
  const config = await request('config')
  await writeFile(path.join(out, 'studio-config.json'), JSON.stringify(config, null, 2))
  console.log(JSON.stringify(config.types))
} else throw Error('Use: studio.mjs EVIDENCE_DIR submit TYPE | status | config')
