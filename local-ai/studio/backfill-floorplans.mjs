import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { list, save, dir, fileUrl } from './store.mjs'
import { ensureFloorplan } from './floorplan.mjs'
import { processRun } from './engine.mjs'
import { ROOT } from './config.mjs'
import { createMcpSession } from '../mcp-session.mjs'
const receiptDir = path.join(
  ROOT,
  'studio-tests/floorplan-20261109/backfill-runs',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(receiptDir, { recursive: true })
const { client, transport } = createMcpSession()
let scenes
try {
  await client.connect(transport)
  const r = await client.callTool({ name: 'list_scenes', arguments: {} })
  scenes = r.structuredContent.scenes
} finally {
  await client.close()
}
const before = {}
for (const scene of scenes) {
  const s = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + scene.id)
  ).json()
  before[scene.id] = s
}
await writeFile(
  path.join(receiptDir, 'all-scenes-before.json'),
  JSON.stringify(before, null, 2),
)
const models = (await list()).filter(
  (j) => j.status === 'succeeded' && j.result?.kind === 'model',
)
const assets = new Map(),
  report = { jobs: [], scenes: [] }
for (const j of models) {
  const glb = await readFile(path.join(dir(j.id), 'model.glb'))
  const sha = createHash('sha256').update(glb).digest('hex')
  await copyFile(
    path.join(dir(j.id), 'job.json'),
    path.join(receiptDir, j.id + '-job-before.json'),
  )
  const projection = await ensureFloorplan(
    j,
    processRun,
    new AbortController().signal,
    async (phase) => console.log(j.name + ': ' + phase),
  )
  Object.assign(j.result, projection)
  j.result.files = [
    ...new Set([...j.result.files, 'floorplan.png', 'floorplan.json']),
  ]
  j.result.downloads = [...j.result.files, 'manifest.json'].map((name) => ({
    name,
    url: fileUrl(j, name),
  }))
  await writeFile(
    path.join(dir(j.id), 'result.json'),
    JSON.stringify(j.result, null, 2),
  )
  await save(j)
  if (
    sha !==
    createHash('sha256')
      .update(await readFile(path.join(dir(j.id), 'model.glb')))
      .digest('hex')
  )
    throw Error('GLB changed')
  assets.set('studio-' + j.id, 'http://127.0.0.1:3002' + j.result.floorPlanUrl)
  report.jobs.push({
    id: j.id,
    type: j.type,
    sha,
    projection: j.result.projection,
  })
}
function protectedGraph(graph) {
  const clone = structuredClone(graph)
  for (const node of Object.values(clone.nodes))
    if (node.type === 'item' && assets.has(node.asset.id))
      delete node.asset.floorPlanUrl
  return JSON.stringify(clone)
}
for (const scene of scenes) {
  let done = false
  for (let attempt = 0; attempt < 4 && !done; attempt++) {
    const u = 'http://127.0.0.1:3002/api/scenes/' + scene.id,
      s = await (await fetch(u)).json(),
      graph = structuredClone(s.graph)
    let changed = 0
    for (const n of Object.values(graph.nodes))
      if (
        n.type === 'item' &&
        assets.has(n.asset.id) &&
        n.asset.floorPlanUrl !== assets.get(n.asset.id)
      ) {
        n.asset.floorPlanUrl = assets.get(n.asset.id)
        changed++
      }
    if (!changed) {
      report.scenes.push({ id: scene.id, changed: 0 })
      done = true
      break
    }
    if (protectedGraph(graph) !== protectedGraph(s.graph))
      throw Error('Backfill changes protected fields')
    await writeFile(
      path.join(receiptDir, scene.id + '-immediate-before.json'),
      JSON.stringify(s, null, 2),
    )
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graph,
        name: s.name,
        thumbnailUrl: s.thumbnailUrl,
        expectedVersion: s.version,
      }),
    })
    if (r.status === 409) continue
    if (!r.ok) throw Error(await r.text())
    const after = await (await fetch(u)).json()
    if (protectedGraph(after.graph) !== protectedGraph(s.graph))
      throw Error('Readback changed layout or hierarchy')
    for (const n of Object.values(after.graph.nodes))
      if (
        n.type === 'item' &&
        assets.has(n.asset.id) &&
        n.asset.floorPlanUrl !== assets.get(n.asset.id)
      )
        throw Error('Missing persisted floorPlanUrl')
    report.scenes.push({
      id: scene.id,
      changed,
      versionBefore: s.version,
      versionAfter: after.version,
      layoutAndHierarchyPreserved: true,
    })
    done = true
  }
  if (!done) throw Error('Concurrent edits kept changing project ' + scene.id)
}
await writeFile(
  path.join(receiptDir, 'backfill-report.json'),
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report))
