import { editorFetch, publicUrl } from './connection.mjs'
import { setTimeout as wait } from 'node:timers/promises'

export function createRemoteSceneStore() {
  if (!process.env.PASCAL_SCENE_API_TOKEN) throw Error('Remote scene store requires PASCAL_SCENE_API_TOKEN')
  const call = async (method, args) => {
    let response, result
    for (let attempt = 0; attempt < 6; attempt++) {
      response = await editorFetch('/api/worker-store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, args }), signal: AbortSignal.timeout(60000),
      })
      result = await response.json()
      // 429 explicitly rejected the request before execution. Do not retry
      // ambiguous transport errors/5xx writes: they may already have committed.
      if (response.status !== 429 || attempt === 5) break
      const seconds = Number(response.headers.get('Retry-After') ?? NaN)
      await wait(Math.min(30000, Math.max(500, Number.isFinite(seconds) ? seconds * 1000 : 1000 * 2 ** attempt)))
    }
    if (!response.ok) {
      const detail = result.message || result.error || result.ErrorMessage || 'Cloud scene store unavailable'
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      throw Object.assign(Error(`Scene store ${method} HTTP ${response.status}: ${message}`), { code: result.error, status: response.status })
    }
    const value = result.value
    if (value?.id && typeof value.editorUrl === 'string') {
      const url = publicUrl('/project/' + encodeURIComponent(value.id))
      return { ...value, editorUrl: url, url }
    }
    return value
  }
  return {
    // Describes the authoritative cloud database, not a second local database.
    backend: 'sqlite',
    createProject: (opts) => call('createProject', [opts]),
    getProjectStatus: (id) => call('getProjectStatus', [id]),
    save: (opts) => call('save', [opts]),
    load: (id) => call('load', [id]),
    list: (opts) => call('list', [opts || {}]),
    delete: (id, opts) => call('delete', [id, opts || {}]),
    rename: (id, name, opts) => call('rename', [id, name, opts || {}]),
    appendSceneEvent: (opts) => call('appendSceneEvent', [opts]),
    listSceneEvents: (id, opts) => call('listSceneEvents', [id, opts || {}]),
  }
}

export function remoteArtifacts() {
  const artifactPath = (sha256) => {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error('Invalid artifact hash')
    return '/api/artifacts/' + sha256
  }
  return {
    async storeArtifact({ sha256, bytes, signal }) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await editorFetch(artifactPath(sha256), { method: 'PUT', body: bytes,
          ...(signal ? { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) } : {}) })
        if (response.ok) { await response.arrayBuffer(); return sha256 }
        if (![429, 503].includes(response.status) || attempt === 4)
          throw Error('Cloud artifact upload failed: ' + response.status)
        const retry = Number(response.headers.get('Retry-After') ?? NaN)
        await response.arrayBuffer()
        await wait(Math.min(30000, Math.max(100, Number.isFinite(retry) ? retry * 1000 : 1000 * 2 ** attempt)), undefined, { signal })
      }
    },
    async readArtifact({ sha256 }) {
      const response = await editorFetch(artifactPath(sha256))
      if (response.status === 404) return null
      if (!response.ok) throw Error('Cloud artifact download failed: ' + response.status)
      return new Uint8Array(await response.arrayBuffer())
    },
  }
}
