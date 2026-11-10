import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { remoteArtifacts } from '../remote-scene-store.mjs'
import { dir, fileUrl, save } from './store.mjs'

// Publish completed immutable files beside the authoritative cloud scene.
// Preview/download traffic then stays in the cloud instead of occupying AI
// gateway connections. A failed upload resumes without repeating inference.
export async function publishCloudAssets(job, signal) {
  if (process.env.PASCAL_REMOTE_STORE !== '1') return
  const result = job.result
  if (!result) throw Error('No generated result to publish')
  const store = remoteArtifacts()
  job.cloudArtifacts ||= {}
  async function upload(name, bytes) {
    signal?.throwIfAborted()
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (job.cloudArtifacts[name] !== sha256) {
      await store.storeArtifact({ sha256, bytes, signal })
      job.cloudArtifacts[name] = sha256
      await save(job)
    }
  }
  const names = new Set([result.preview, ...result.files, ...Object.values(result.maps || {})])
  for (const name of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(name)) throw Error('Invalid generated asset filename')
    await upload(name, await readFile(path.join(dir(job.id), name)))
  }
  result.previewUrl = fileUrl(job, result.preview)
  if (result.floorPlan) result.floorPlanUrl = fileUrl(job, result.floorPlan)
  if (result.maps) result.mapUrls = Object.fromEntries(Object.entries(result.maps).map(([key, name]) => [key, fileUrl(job, name)]))
  result.downloads = result.files.map(name => ({ name, url: fileUrl(job, name) }))
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, id: job.id, sceneId: job.sceneId, sceneVersion: job.sceneVersion, name: job.name, type: job.type, prompt: job.prompt, settings: job.settings, createdAt: job.createdAt, sourceJobId: job.sourceJobId, capture: job.capture, result }, null, 2))
  await upload('manifest.json', manifest)
  result.downloads.push({ name: 'manifest.json', url: fileUrl(job, 'manifest.json') })
  await save(job)
}
