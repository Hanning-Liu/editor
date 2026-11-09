import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = 'hierarchy-ux-tests/',
  project = JSON.parse(await readFile(base + 'project.json')),
  api = 'http://127.0.0.1:3002/api/scenes/' + project.id,
  before = await fetch(api).then((r) => r.json())
const response = await fetch(
  'http://127.0.0.1:3002/api/local-chat?sceneId=' + project.id,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message:
        '请实际调用 get_spatial_hierarchy 读取当前场景的房间、功能分区、家具组团和家具承托包含关系，然后用中文简要概括。仅查询，不要新增、删除或移动任何对象，不要重建房间。',
      preferences: { modelId: 'qwen38', effort: 'fast' },
    }),
  },
)
assert.ok(response.ok)
const text = await response.text()
await writeFile(base + 'qwen-read.ndjson', text)
const events = text
  .trim()
  .split('\n')
  .map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  })
  .filter(Boolean)
const tools = events.filter((e) => e.type === 'tool' && e.state === 'done')
assert.ok(
  tools.some((e) => e.name === 'get_spatial_hierarchy'),
  JSON.stringify(events).slice(-1800),
)
const after = await fetch(api).then((r) => r.json())
assert.deepEqual(after.graph, before.graph)
const report = {
  passed: true,
  projectId: project.id,
  realLocalQwen: true,
  tools: tools.map((t) => t.name),
  graphUnchanged: true,
}
await writeFile(base + 'qwen-report.json', JSON.stringify(report, null, 2))
console.log(report)
