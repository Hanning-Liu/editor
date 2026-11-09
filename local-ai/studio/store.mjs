import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises'
import path from 'node:path'
import { DATA } from './config.mjs'
export const validId = (id) =>
  typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)
export const dir = (id) => {
  if (!validId(id)) throw Error('无效任务ID')
  return path.join(DATA, 'jobs', id)
}
const tails = new Map()
export async function save(j) {
  j.updatedAt = new Date().toISOString()
  const bytes = JSON.stringify(j, null, 2)
  const task = (tails.get(j.id) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await mkdir(dir(j.id), { recursive: true })
      const p = path.join(dir(j.id), 'job.json')
      await writeFile(p + '.tmp', bytes)
      await rename(p + '.tmp', p)
    })
  tails.set(j.id, task)
  await task
  return j
}
export async function get(id) {
  return JSON.parse(await readFile(path.join(dir(id), 'job.json'), 'utf8'))
}
export async function list() {
  await mkdir(path.join(DATA, 'jobs'), { recursive: true })
  const out = []
  for (const id of await readdir(path.join(DATA, 'jobs'))) {
    if (!validId(id)) continue
    try {
      out.push(await get(id))
    } catch {}
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export const fileUrl = (j, name) =>
  `/api/local-studio?sceneId=${j.sceneId}&action=file&jobId=${j.id}&name=${encodeURIComponent(name)}`
export async function generatedAssets() {
  return (await list())
    .filter((j) => j.status === 'succeeded' && j.result?.kind === 'model')
    .map((j) => ({
      id: 'studio-' + j.id,
      category: 'furniture',
      name: j.name,
      src: 'http://127.0.0.1:3002' + fileUrl(j, 'model.glb'),
      thumbnail: 'http://127.0.0.1:3002' + fileUrl(j, 'preview.png'),
      dimensions: j.result.dimensions,
      ...(j.result.floorPlanUrl
        ? { floorPlanUrl: 'http://127.0.0.1:3002' + j.result.floorPlanUrl }
        : {}),
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      offset: [0, 0, 0],
      tags: ['studio', 'local', 'generated'],
      functionTags: ['studio-generated'],
    }))
}
