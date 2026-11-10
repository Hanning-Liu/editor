import { createMcpSession } from '../mcp-session.mjs'
import { editorFetch } from '../connection.mjs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const out = process.argv[2]
assert.ok(out && process.env.PASCAL_REMOTE_STORE === '1', 'Use an isolated remote-store worker and evidence directory')
await mkdir(out, { recursive: true })
const file = path.join(out, 'project.json')
try {
  const prior = JSON.parse(await readFile(file, 'utf8'))
  const check = await editorFetch('/api/scenes/' + prior.id)
  assert.ok(check.ok, 'An existing project receipt cannot be replayed after a read failure: ' + check.status)
  console.log('Existing isolated acceptance project', prior.id)
  process.exit(0)
} catch (e) { if (e.code !== 'ENOENT') throw e }
const { client, transport } = createMcpSession()
try {
  await client.connect(transport)
  const result = await client.callTool({ name: 'create_project', arguments: { name: '云网关 Chat 与 Studio 验收-20261110' } })
  assert.ok(!result.isError, JSON.stringify(result))
  const project = result.structuredContent || JSON.parse(result.content.find(c => c.type === 'text').text)
  assert.ok(project.id && project.defaultLevelId)
  await writeFile(file, JSON.stringify(project, null, 2))
  const response = await editorFetch('/api/scenes/' + project.id)
  assert.equal(response.status, 200)
  const scene = await response.json()
  assert.ok(scene.graph.nodes[project.defaultLevelId])
  console.log(JSON.stringify({ projectId: project.id, levelId: project.defaultLevelId, cloudSceneVersion: scene.version, remoteStoreVerified: true }))
} finally { await client.close() }
