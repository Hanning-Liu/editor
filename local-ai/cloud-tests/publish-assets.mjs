import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { get } from '../studio/store.mjs'
import { publishCloudAssets } from '../studio/cloud-assets.mjs'

const out = process.argv[2]
assert.equal(process.env.PASCAL_REMOTE_STORE, '1')
const project = JSON.parse(await readFile(path.join(out, 'project.json')))
const jobs = JSON.parse(await readFile(path.join(out, 'studio-jobs.json')))
const report = []
for (const [type, receipt] of Object.entries(jobs)) {
  const job = await get(receipt.id)
  assert.equal(job.sceneId, project.id)
  assert.equal(job.status, 'succeeded')
  const start = Date.now()
  await publishCloudAssets(job)
  const entry = { type, id: job.id, artifacts: Object.keys(job.cloudArtifacts).length, elapsedMs: Date.now() - start }
  report.push(entry)
  await writeFile(path.join(out, 'cloud-publication-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(entry))
}
