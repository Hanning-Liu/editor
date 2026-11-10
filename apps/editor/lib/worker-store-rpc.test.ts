import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GET as getArtifact, PUT as putArtifact } from '../app/api/artifacts/[sha256]/route'
import { POST } from '../app/api/worker-store/route'
import { __resetSceneStoreForTests, getSceneStore } from './scene-store-server'

const savedEnv = { ...process.env }
let server: ReturnType<typeof Bun.serve>
let root: string
let remote: any
let artifacts: any
let callbacks: any

beforeAll(async () => {
  process.env.PASCAL_SCENE_API_TOKEN = 'rpc-transport-test-' + 'a'.repeat(32)
  process.env.PASCAL_ADMIN_PASSWORD = 'test-private-workspace'
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path === '/api/worker-store') return POST(request)
      if (path.startsWith('/api/artifacts/')) {
        const context = { params: Promise.resolve({ sha256: path.split('/').at(-1)! }) }
        return request.method === 'PUT'
          ? putArtifact(request, context)
          : getArtifact(request, context)
      }
      return new Response(null, { status: 404 })
    },
  })
  process.env.PASCAL_EDITOR_URL = server.url.origin
  process.env.PASCAL_PUBLIC_URL = server.url.origin
  const mod = await import('../../../local-ai/remote-scene-store.mjs')
  remote = mod.createRemoteSceneStore()
  artifacts = mod.remoteArtifacts()
  callbacks = await import('../../../local-ai/connection.mjs')
})
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pascal-cloud-store-'))
  process.env.PASCAL_DATA_DIR = root
  __resetSceneStoreForTests()
})
afterEach(async () => {
  const store = await getSceneStore()
  ;(store as { close?: () => void }).close?.()
  __resetSceneStoreForTests()
  await rm(root, { recursive: true, force: true })
})
afterAll(() => {
  server?.stop(true)
  for (const key of [
    'PASCAL_SCENE_API_TOKEN',
    'PASCAL_ADMIN_PASSWORD',
    'PASCAL_EDITOR_URL',
    'PASCAL_PUBLIC_URL',
    'PASCAL_DATA_DIR',
  ]) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

function graph() {
  return {
    nodes: {
      table_abc: {
        object: 'node',
        id: 'table_abc',
        type: 'example:furniture',
        parentId: null,
        children: ['toy_abc'],
        position: [2, 0, 3],
        rotation: [0, 0.4, 0],
        metadata: { roomId: 'room_abc' },
      },
      toy_abc: {
        object: 'node',
        id: 'toy_abc',
        type: 'example:furniture',
        parentId: 'table_abc',
        position: [0.1, 0.8, 0.2],
        metadata: {},
      },
    },
    rootNodeIds: ['table_abc'],
  }
}

test('real HTTP RPC persists graphs, layout/support relations, events and rename in the cloud store', async () => {
  const project = await remote.createProject({ name: 'Cloud transport acceptance' })
  const initial = await remote.save({ id: project.id, name: project.name, graph: graph() })
  expect((await remote.load(project.id)).graph).toEqual(graph())
  expect((await remote.getProjectStatus(project.id)).version).toBe(initial.version)
  expect((await remote.list({})).map((s: any) => s.id)).toContain(project.id)
  const renamed = await remote.rename(project.id, 'Renamed', { expectedVersion: initial.version })
  const event = await remote.appendSceneEvent({
    sceneId: project.id,
    version: renamed.version,
    kind: 'acceptance',
    graph: graph(),
  })
  expect((await remote.listSceneEvents(project.id, {}))[0].eventId).toBe(event.eventId)
  expect((await remote.load(project.id)).graph.nodes.toy_abc.parentId).toBe('table_abc')
  expect(await remote.delete(project.id, { expectedVersion: renamed.version })).toMatchObject({
    deleted: true,
  })
  expect(await remote.load(project.id)).toBeNull()
})

test('a stale worker write fails rather than replacing a browser edit', async () => {
  const meta = await remote.save({ name: 'Conflict test', graph: graph() })
  const next = graph()
  next.nodes.table_abc.position = [4, 0, 5]
  const newer = await remote.save({
    id: meta.id,
    name: meta.name,
    graph: next,
    expectedVersion: meta.version,
  })
  await expect(
    remote.save({ id: meta.id, name: meta.name, graph: graph(), expectedVersion: meta.version }),
  ).rejects.toMatchObject({ code: 'version_conflict', status: 409 })
  await expect(
    remote.save({
      id: meta.id,
      name: meta.name,
      graph: graph(),
      expectedVersion: newer.version,
      expectedGraphHash: meta.graphHash,
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' })
  await expect(
    remote.save({
      id: meta.id,
      name: meta.name,
      graph: { nodes: {}, rootNodeIds: [] },
      expectedVersion: newer.version,
    }),
  ).rejects.toMatchObject({ code: 'invalid' })
  expect((await remote.load(meta.id)).graph).toEqual(next)
})

test('browser cookies cannot call worker RPC, and unknown methods cannot dispatch store internals', async () => {
  const unauthenticated = await fetch(new URL('/api/worker-store', server.url), {
    method: 'POST',
    headers: { cookie: 'pascal_session=fake' },
    body: '{}',
  })
  expect(unauthenticated.status).toBe(401)
  const badMethod = await callbacks.editorFetch('/api/worker-store', {
    method: 'POST',
    body: JSON.stringify({ method: '__proto__', args: [] }),
  })
  expect(badMethod.status).toBe(400)
  await expect(callbacks.editorFetch('https://external.test/steal')).rejects.toThrow('Cross-origin')
})

test('generated geometry artifacts upload to cloud and survive a byte-exact read', async () => {
  const bytes = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0])
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  expect(await artifacts.storeArtifact({ sha256, bytes })).toBe(sha256)
  expect(await artifacts.readArtifact({ sha256 })).toEqual(bytes)
  await expect(artifacts.storeArtifact({ sha256, bytes: new Uint8Array([1]) })).rejects.toThrow(
    'upload failed: 400',
  )
})
