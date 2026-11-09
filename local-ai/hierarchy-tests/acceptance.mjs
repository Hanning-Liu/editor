import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = new URL('./', import.meta.url),
  json = async (name) => JSON.parse(await readFile(new URL(name, base), 'utf8'))
const native = await json('native-report.json'),
  browser = await json('browser-report.json'),
  qwen = await json('qwen-report.json'),
  refresh = await json('qwen-refresh-report.json')
for (const r of [native, browser, qwen, refresh]) assert.equal(r.passed, true)
const originals = await json('original-scenes.json')
let count = 0
for (const [id, original] of Object.entries(originals)) {
  const r = await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  assert.ok(r.ok)
  const current = await r.json()
  assert.deepEqual(
    current.graph,
    original.graph,
    'Original scene changed: ' + id,
  )
  count++
}
for (const r of [browser, qwen]) {
  const s = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + r.projectId)
  ).json()
  assert.ok(
    Object.values(s.graph.nodes).some((n) => n.type === 'functional-zone'),
  )
  assert.ok(
    Object.values(s.graph.nodes).some((n) => n.type === 'furniture-group'),
  )
  const toy = Object.values(s.graph.nodes).find(
    (n) => n.type === 'item' && n.asset.id === 'toy',
  )
  assert.ok(toy && s.graph.nodes[toy.parentId]?.type === 'item')
}
const health = {}
for (const [name, url] of Object.entries({
  editor: 'http://127.0.0.1:3002/api/health',
  chat: 'http://127.0.0.1:18081/health',
  studio: 'http://127.0.0.1:18082/health',
  qwen: 'http://127.0.0.1:18080/v1/models',
})) {
  const r = await fetch(url)
  assert.ok(r.ok)
  health[name] = r.status
}
const report = {
  status: 'passed',
  checkedAt: new Date().toISOString(),
  baseline: 'ea96d4aeaf52fde7b31fe280f24fc9dbba33eba9',
  branch: 'codex/spatial-hierarchy',
  originalProjectsUnchanged: count,
  native: {
    created: native.created,
    edited: native.edited,
    transformed: native.movedRotated,
    undoRedo: native.undoRedo,
    deletedSemanticOnly: native.deletedSemanticOnly,
  },
  browser,
  qwen,
  qwenRefresh: {
    passed: refresh.passed,
    semanticTreeReloaded: refresh.semanticTreeReloaded,
    graphUnchanged: refresh.graphUnchanged,
    pageErrors: refresh.errors,
  },
  health,
}
await writeFile(
  new URL('acceptance.json', base),
  JSON.stringify(report, null, 2),
)
console.log(
  JSON.stringify({
    status: report.status,
    originalProjectsUnchanged: count,
    browserProject: browser.projectId,
    qwenProject: qwen.projectId,
    health,
  }),
)
