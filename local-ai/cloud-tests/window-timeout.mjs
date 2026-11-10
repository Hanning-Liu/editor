import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { editorFetch } from '../connection.mjs'
import { createRemoteSceneStore } from '../remote-scene-store.mjs'

const [out, sourceId, mode = 'submit'] = process.argv.slice(2)
assert.ok(out && sourceId && process.env.PASCAL_REMOTE_STORE === '1')
assert.ok(['submit', 'audit'].includes(mode))
await mkdir(out, { recursive: true })
const load = async id => {
  const response = await editorFetch('/api/scenes/' + id)
  assert.ok(response.ok, 'Scene read HTTP ' + response.status)
  return response.json()
}
const original = await load(sourceId)
const store = createRemoteSceneStore()
const receipt = path.join(out, 'window-project.json')
let project
try { project = JSON.parse(await readFile(receipt, 'utf8')) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  project = await store.createProject({ name: 'Chat 加窗超时修复验收-20261110' })
  await writeFile(receipt, JSON.stringify(project, null, 2), { flag: 'wx' })
}
const status = await store.getProjectStatus(project.id)
if (status.isEmpty) await store.save({ id: project.id, name: 'Chat 加窗超时修复验收-20261110', graph: original.graph, expectedVersion: status.version })
const before = mode === 'audit' ? JSON.parse(await readFile(path.join(out, 'window-before.json'), 'utf8')) : await load(project.id)
assert.equal(Object.values(before.graph.nodes).filter(n => n.type === 'window').length, 0)
if (mode === 'submit') {
await writeFile(path.join(out, 'window-before.json'), JSON.stringify(before, null, 2))
await writeFile(path.join(out, 'window-submit-intent.json'), JSON.stringify({ sceneId: project.id, at: new Date().toISOString() }), { flag: 'wx' })
const response = await editorFetch('/api/local-chat?sceneId=' + project.id, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '在客厅沙发正对的墙上加一扇窗。只新增一扇窗，不修改既有家具、材质和布局。完成后检查。', preferences: { effort: process.env.PASCAL_TEST_EFFORT || 'deep' } }),
  signal: AbortSignal.timeout(1800000),
})
assert.ok(response.ok, 'Cloud Chat HTTP ' + response.status)
let stream = '', pending = ''
try {
for await (const chunk of response.body) {
  const text = Buffer.from(chunk).toString()
  stream += text; pending += text
  let at
  while ((at = pending.indexOf('\n')) !== -1) {
    const line = pending.slice(0, at); pending = pending.slice(at + 1)
    if (!line.trim()) continue
    const event = JSON.parse(line)
    if (event.type === 'tool') console.log('tool', event.name, event.state)
    else if (['status', 'error', 'reply'].includes(event.type)) console.log(event.type, event.text)
  }
  await writeFile(path.join(out, 'window-chat.ndjson'), stream)
}
} catch (error) {
  await writeFile(path.join(out, 'window-stream-interruption.json'), JSON.stringify({ message: error.message, code: error.cause?.code }))
  console.log('Stream interrupted; inspecting the existing background run without resubmitting')
}
}
let history
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await editorFetch('/api/local-chat?sceneId=' + project.id, { signal: AbortSignal.timeout(60000) })
    assert.ok(response.ok, 'History read HTTP ' + response.status)
    history = await response.json()
  } catch (error) {
    console.log('History read interrupted; retrying only this read:', error.name)
    await wait(10000)
    continue
  }
  if (!history.running) break
  console.log('Existing run still active:', history.currentEvents.at(-1)?.text || history.run.status)
  await wait(10000)
}
assert.ok(history, 'Background history must be readable')
await writeFile(path.join(out, 'window-chat-history.json'), JSON.stringify(history, null, 2))
assert.equal(history.run.status, 'completed')
const after = await load(project.id), sourceAfter = await load(sourceId)
await writeFile(path.join(out, 'window-after.json'), JSON.stringify(after, null, 2))
assert.deepEqual(sourceAfter.graph, original.graph, 'Original scene must remain unchanged')
assert.equal(sourceAfter.version, original.version)
const windows = Object.values(after.graph.nodes).filter(n => n.type === 'window')
assert.equal(windows.length, 1)
for (const item of Object.values(before.graph.nodes).filter(n => n.type === 'item'))
  assert.deepEqual(after.graph.nodes[item.id], item, 'Furniture and support relations must stay unchanged')
for (const wall of Object.values(before.graph.nodes).filter(n => n.type === 'wall')) {
  const { children: beforeChildren, ...beforeFields } = wall
  const { children: afterChildren, ...afterFields } = after.graph.nodes[wall.id]
  assert.deepEqual(afterFields, beforeFields, 'Existing wall geometry and finishes must stay unchanged')
}
const report = { sourceId, sceneId: project.id, elapsedSeconds: Math.round((Date.parse(history.run.finishedAt) - Date.parse(history.run.startedAt)) / 1000),
  sourceVersionUnchanged: sourceAfter.version, run: history.run, effort: history.preferences.effort, window: windows[0], furnitureUnchanged: true, wallGeometryAndFinishesUnchanged: true,
  tools: history.currentEvents.filter(e => e.type === 'tool' && e.state === 'done').map(e => e.name), reply: history.messages.at(-1)?.content }
await writeFile(path.join(out, 'window-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
