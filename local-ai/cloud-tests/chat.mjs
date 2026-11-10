import { editorFetch } from '../connection.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const out = process.argv[2], command = process.argv[3] || 'submit'
const project = JSON.parse(await readFile(path.join(out, 'project.json'), 'utf8'))
const api = '/api/local-chat?sceneId=' + project.id
const started = performance.now()
let firstChunkMs = null
if (command === 'submit') {
const beforeResponse = await editorFetch('/api/scenes/' + project.id)
assert.ok(beforeResponse.ok, 'Scene read must succeed before submitting a chat')
const previous = await beforeResponse.json()
const rooms = Object.values(previous.graph.nodes).filter(n => n.type === 'zone')
assert.equal(rooms.length, 0, 'Use a fresh acceptance project; do not replay this write')
await writeFile(path.join(out, 'chat-submit-intent.json'), JSON.stringify({ sceneId: project.id, at: new Date().toISOString() }), { flag: 'wx' })
const response = await editorFetch(api, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '在当前空白项目创建一个4米乘3米的客厅，墙高2.6米。再从目录搜索 sofa，选择一个真实沙发放在客厅中心 x=2、z=1.5。只建一个房间和一张沙发，不增加其他家具。完成后检查，不要重复创建。', preferences: { effort: 'fast' } }),
  signal: AbortSignal.timeout(900000),
})
if (!response.ok) throw Error(await response.text())
const file = path.join(out, 'chat.ndjson')
const chunks = []
let byteCount = 0, lastLog = 0
for await (const bytes of response.body) {
  if (firstChunkMs === null) firstChunkMs = Math.round(performance.now() - started)
  chunks.push(Buffer.from(bytes)); byteCount += bytes.length
  await writeFile(file, Buffer.concat(chunks))
  if (Date.now() - lastLog > 3000) { console.log('Chat stream bytes', byteCount); lastLog = Date.now() }
}
} else assert.equal(command, 'audit', 'Use submit or audit; audit never sends another message')
const history = await (await editorFetch(api)).json()
await writeFile(path.join(out, 'chat-history.json'), JSON.stringify(history, null, 2))
const scene = await (await editorFetch('/api/scenes/' + project.id)).json()
const nodes = Object.values(scene.graph.nodes)
assert.equal(history.run?.status, 'completed', 'Chat must finish normally: ' + history.run?.status)
assert.equal(nodes.filter(n => n.type === 'zone').length, 1)
assert.equal(nodes.filter(n => n.type === 'wall').length, 4)
assert.equal(nodes.filter(n => n.type === 'item').length, 1)
const room = nodes.find(n => n.type === 'zone'), polygon = room.polygon
const area = Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
assert.ok(Math.abs(area - 12) < 1e-5, 'Room must measure 12 square meters')
for (const wall of nodes.filter(n => n.type === 'wall')) assert.ok(Math.abs(wall.height - 2.6) < 1e-5)
const sofa = nodes.find(n => n.type === 'item')
assert.ok(sofa.asset?.src)
assert.ok(Math.abs(sofa.position[0] - 2) < 1e-5 && Math.abs(sofa.position[2] - 1.5) < 1e-5)
const report = { sceneId: project.id, version: scene.version, walls: 4, rooms: 1, furniture: 1, run: history.run,
  area, firstChunkMs, elapsedMs: Math.round(performance.now() - started),
  tools: (history.currentEvents || []).filter(e => e.type === 'tool' && e.state !== 'running').map(e => ({ name: e.name, state: e.state })), reply: history.messages.at(-1)?.content }
await writeFile(path.join(out, 'chat-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
