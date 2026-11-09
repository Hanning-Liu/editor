import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const p = JSON.parse(await readFile('hierarchy-tests/qwen-project.json'))
const api = 'http://127.0.0.1:3002/api/scenes/' + p.id,
  url = 'http://127.0.0.1:3002/api/local-chat?sceneId=' + p.id
const scene = () => fetch(api).then((r) => r.json())
const before = await scene()
const group = Object.values(before.graph.nodes).find(
    (n) => n.type === 'furniture-group',
  ),
  items = Object.values(before.graph.nodes).filter((n) => n.type === 'item'),
  toy = items.find((n) => n.asset.id === 'toy'),
  table = items.find((n) => n.asset.id === 'bedside-table'),
  chair = items.find((n) => n.asset.id === 'livingroom-chair')
assert.ok(group && toy && table && chair)
async function ask(message, label) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      preferences: { modelId: 'qwen38', effort: 'fast' },
    }),
  })
  assert.ok(r.ok)
  let all = ''
  const reader = r.body.getReader(),
    d = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const t = d.decode(value)
    all += t
    await writeFile('hierarchy-tests/' + label + '.ndjson', all)
    for (const line of t.split('\n'))
      try {
        const e = JSON.parse(line)
        if (e.type === 'tool' && e.state === 'done') console.log(label, e.name)
      } catch {}
  }
  const h = await (await fetch(url)).json()
  assert.equal(h.run.status, 'completed', JSON.stringify(h.run))
  await writeFile(
    'hierarchy-tests/' + label + '-history.json',
    JSON.stringify(h, null, 2),
  )
  return all
}
const createHistory = JSON.parse(
  await readFile('hierarchy-tests/qwen-create-history.json'),
)
assert.equal(createHistory.run.status, 'completed')
let source = JSON.parse(await readFile('hierarchy-tests/fixture-before.json'))
for (const current of items) {
  const old = Object.values(source.graph.nodes).find(
    (n) => n.type === 'item' && n.asset.id === current.asset.id,
  )
  assert.deepEqual(current.position, old.position)
  assert.deepEqual(current.rotation, old.rotation)
}
const changes = await ask(
  '请实际执行两步，按顺序且只执行一次：1. 使用 edit_furniture_group 将现有“Qwen阅读组”改名为“Qwen阅读组已编辑”，用途改为“阅读与展示”，保持成员和锚点不变。2. 使用 transform_furniture_group，把该组整体绕现有锚点旋转30度，然后沿X正向平移0.3米、Z正向平移0.2米。不要逐件调用move_node，不要新建任何对象。完成后查询层级检查并简要报告。',
  'qwen-transform',
)
assert.ok(changes.includes('transform_furniture_group'))
const after = await scene()
assert.equal(after.graph.nodes[group.id].name, 'Qwen阅读组已编辑')
assert.deepEqual(after.graph.nodes[toy.id], before.graph.nodes[toy.id])
assert.ok(Math.abs(after.graph.nodes[table.id].position[0] - 2.3) < 1e-6)
assert.ok(Math.abs(after.graph.nodes[table.id].position[2] - 2.2) < 1e-6)
assert.ok(
  Math.abs(after.graph.nodes[chair.id].rotation[1] - Math.PI / 6) < 1e-6,
)
const undo = await ask(
  '现在请实际调用 undo，steps=1，只撤销上一条中的组团整体变换。保留已创建的功能分区、家具组团和刚修改的组团名称及用途。然后读取层级确认。不要通过反向移动或重新创建来模拟撤销。',
  'qwen-undo',
)
assert.ok(undo.includes('undo'))
const restored = await scene()
for (const item of items)
  assert.deepEqual(restored.graph.nodes[item.id], before.graph.nodes[item.id])
assert.equal(restored.graph.nodes[group.id].name, 'Qwen阅读组已编辑')
await writeFile(
  'hierarchy-tests/qwen-report.json',
  JSON.stringify(
    {
      passed: true,
      projectId: p.id,
      actualModel: 'local Qwen3.8 27B',
      createdFunctionalZone: true,
      createdFurnitureGroup: true,
      edited: true,
      transformed: true,
      undo: true,
      originalPoseRestored: true,
      toyLocalPoseAndParentPreserved: true,
      groupId: group.id,
    },
    null,
    2,
  ),
)
console.log('Qwen create/edit/transform/undo acceptance passed')
