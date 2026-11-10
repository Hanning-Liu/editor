import { editorFetch, publicUrl } from './connection.mjs'

export function createRemoteSceneStore() {
  if (!process.env.PASCAL_SCENE_API_TOKEN) throw Error('Remote scene store requires PASCAL_SCENE_API_TOKEN')
  const call = async (method, args) => {
    const response = await editorFetch('/api/worker-store', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args }), signal: AbortSignal.timeout(60000),
    })
    const result = await response.json()
    if (!response.ok) throw Object.assign(Error(result.message || result.error || 'Cloud scene store unavailable'), { code: result.error, status: response.status })
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
    async storeArtifact({ sha256, bytes }) {
      const response = await editorFetch(artifactPath(sha256), { method: 'PUT', body: bytes })
      if (!response.ok) throw Error('Cloud artifact upload failed: ' + response.status)
      return sha256
    },
    async readArtifact({ sha256 }) {
      const response = await editorFetch(artifactPath(sha256))
      if (response.status === 404) return null
      if (!response.ok) throw Error('Cloud artifact download failed: ' + response.status)
      return new Uint8Array(await response.arrayBuffer())
    },
  }
}
