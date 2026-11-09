import { createMcpSession } from '../mcp-session.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { cloneSceneGraph } from '../editor-src/packages/core/dist/utils/clone-scene-graph.js'
import assert from 'node:assert/strict'
const { client, transport } = createMcpSession()
let project
try {
  await client.connect(transport)
  const listed = await client.callTool({ name: 'list_scenes', arguments: {} })
  const old = listed.structuredContent.scenes.find(
    (s) => s.name === 'Qwen空间层级验收-20261109',
  )
  if (old) project = old
  else {
    const r = await client.callTool({
      name: 'create_project',
      arguments: { name: 'Qwen空间层级验收-20261109' },
    })
    project = r.structuredContent
    const original = JSON.parse(
      await readFile('hierarchy-tests/fixture-before.json'),
    )
    const graph = cloneSceneGraph(original.graph)
    const response = await fetch(
      'http://127.0.0.1:3002/api/scenes/' + project.id,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ graph, expectedVersion: project.version }),
      },
    )
    assert.ok(response.ok, await response.text())
  }
  await writeFile(
    'hierarchy-tests/qwen-project.json',
    JSON.stringify(project, null, 2),
  )
} finally {
  await client.close()
}
const url = 'http://127.0.0.1:3002/api/local-chat?sceneId=' + project.id
const r = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    message:
      '请实际执行：在现有房间“层级验收客厅”内创建独立功能分区“Qwen阅读区”，功能为阅读，边界点为[[0.2,0.2],[7.8,0.2],[7.8,5.8],[0.2,5.8]]。把当前已有的 Bedside Table 和 Livingroom Chair 组成独立家具组团“Qwen阅读组”，所属该分区，Bedside Table 为锚点。只建立语义关系，不移动家具，不创建家具，不重建房间，不用Collection。先读取当前层级，若同名对象已存在就复用，完成后实际查询层级检查。',
    preferences: { modelId: 'qwen38', effort: 'fast' },
  }),
})
assert.ok(r.ok)
let all = ''
const reader = r.body.getReader(),
  decoder = new TextDecoder()
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  const t = decoder.decode(value)
  all += t
  await writeFile('hierarchy-tests/qwen-create.ndjson', all)
  for (const line of t.split('\n'))
    try {
      const e = JSON.parse(line)
      if (e.type === 'tool' && e.state === 'done') console.log(e.name)
    } catch {}
}
const h = await (await fetch(url)).json()
await writeFile(
  'hierarchy-tests/qwen-create-history.json',
  JSON.stringify(h, null, 2),
)
console.log(JSON.stringify({ run: h.run, last: h.messages.at(-1) }))
