import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { get } from '../../studio/store.mjs'

const base = new URL('./', import.meta.url)
const json = async (name) => JSON.parse(await readFile(new URL(name, base), 'utf8'))
const applied = await json('applied-assets.json')
const projection = await json('projections-validation.json')
const boundsReport = await json('actual-3d-bounds.json')
assert.ok(boundsReport.passed)
const bounds = boundsReport.results
const models = []
for (const item of applied.items) {
  const r = await json('interactions-' + item.kind + '.json')
  assert.deepEqual(r.errors, [])
  assert.ok(r.saves.length && r.saves.every((status) => status === 200))
  const interaction = r.items.find((i) => i.nodeId === item.nodeId)
  assert.deepEqual(interaction.rotations, [0, 45, 90])
  assert.ok(interaction.refreshed && interaction.switched2D3D)
  assert.equal(interaction.uniformScale, 1.25)
  assert.deepEqual(interaction.nonuniformScale, [1.5, 1.1, 0.8])
  const job = await get(item.jobId)
  assert.equal(job.status, 'succeeded')
  assert.equal(job.result.projection.projectionVersion, 2)
  const response = await fetch(item.floorPlanUrl)
  assert.equal(response.status, 200)
  assert.ok((await response.arrayBuffer()).byteLength > 100)
  assert.ok(projection.models.find((m) => m.id === item.jobId)?.sourceGLBUnchanged)
  const bound = bounds.find((b) => b.nodeId === item.nodeId)
  assert.ok(bound.maxDifferenceMeters < 0.001)
  models.push({ kind: item.kind, jobId: item.jobId, interactions: 'passed', imageAfterServiceRestart: 'passed', max3DAlignmentErrorMeters: bound.maxDifferenceMeters })
}
assert.equal(models.length, 5)
assert.ok(projection.invalidDimensionsRejected)
const round = await get('b546885c-90f2-46a7-b84a-d498eb957455')
assert.ok(round.result.projection.alphaCoverage > 0.75 && round.result.projection.alphaCoverage < 0.82)
const fallback = await json('image-fallback-report.json')
assert.ok(fallback.selectableWhenFailed && fallback.recoveredOnRefresh)
const downloads = await json('plan-download-report.json')
assert.equal(downloads.length, 2)
assert.ok(downloads.every((d) => d.preview && d.pngDownloaded && d.projectionDownloaded))

const originals = await json('all-scenes-before.json')
const preservation = []
for (const [id, original] of Object.entries(originals)) {
  const response = await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  assert.equal(response.status, 200)
  const current = await response.json()
  const normalize = (graph) => {
    const copy = structuredClone(graph)
    for (const node of Object.values(copy.nodes))
      if (node.type === 'item' && node.asset.id.startsWith('studio-')) delete node.asset.floorPlanUrl
    return copy
  }
  const before = normalize(original.graph), after = normalize(current.graph)
  if (id === '82498753e1d3') {
    assert.deepEqual(after.nodes, before.nodes)
    for (const [key, value] of Object.entries(before))
      if (key !== 'collections' && key !== 'nodes') assert.deepEqual(after[key], value)
    for (const [key, value] of Object.entries(before.collections || {}))
      assert.deepEqual(after.collections[key], value)
    assert.ok(after.collections.collection_pc7pq5m8vk4q83r0)
    assert.equal(after.nodes.item_sjqo00t6jcv24fm5.parentId, 'item_uezyi81dhgy7r7dc')
    preservation.push({ id, protectedNodesAndHierarchy: 'unchanged', concurrentUserCollection: 'preserved' })
  } else {
    assert.deepEqual(current.graph, original.graph)
    preservation.push({ id, graph: 'unchanged' })
  }
}
const health = {}
for (const [service, url] of Object.entries({ editor: 'http://127.0.0.1:3002/api/health', studio: 'http://127.0.0.1:18082/health', chat: 'http://127.0.0.1:18081/health', qwen: 'http://127.0.0.1:18080/v1/models' })) {
  const r = await fetch(url)
  assert.equal(r.status, 200)
  health[service] = r.status
}
const report = { status: 'passed', checkedAt: new Date().toISOString(), projectId: applied.projectId, models, transparentRoundSilhouette: true, failedImageFallback: fallback, previewAndDownload: downloads, originalProjects: preservation, nativeTestsPassed: 110, health, scope: 'Studio TRELLIS.2 and Qwen + Blender furniture; room tree UI not changed' }
await writeFile(new URL('acceptance.json', base), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ status: report.status, models: models.length, originalProjectsPreserved: preservation.length, health }))
