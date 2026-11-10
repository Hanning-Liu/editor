import { timingSafeEqual } from 'node:crypto'

function origin(value, fallback) {
  const u = new URL(value || fallback)
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw Error('Pascal service address must be an HTTP(S) origin')
  if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
    throw Error('Remote Pascal service requires HTTPS')
  return u.origin
}

export const EDITOR_ORIGIN = origin(process.env.PASCAL_EDITOR_URL, 'http://127.0.0.1:3002')
export const PUBLIC_ORIGIN = origin(process.env.PASCAL_PUBLIC_URL, EDITOR_ORIGIN)
if (process.env.PASCAL_MODELSCOPE_TOKEN && !new URL(EDITOR_ORIGIN).hostname.endsWith('.api-inference.modelscope.net'))
  throw Error('ModelScope credential requires the dedicated ModelScope API origin')
export const editorUrl = (path) => new URL(path, EDITOR_ORIGIN).href
export const publicUrl = (path) => new URL(path, PUBLIC_ORIGIN).href

export function editorHeaders(input) {
  const headers = new Headers(input)
  if (process.env.PASCAL_SCENE_API_TOKEN)
    headers.set('x-pascal-scene-token', process.env.PASCAL_SCENE_API_TOKEN)
  if (process.env.PASCAL_MODELSCOPE_TOKEN)
    headers.set('Authorization', 'Bearer ' + process.env.PASCAL_MODELSCOPE_TOKEN)
  return headers
}

// Browser links stay on the public website. Worker downloads use the platform's
// authenticated API ingress for exactly the same application path.
export function editorAssetUrl(input) {
  const url = new URL(input)
  if (![EDITOR_ORIGIN, PUBLIC_ORIGIN].includes(url.origin)) return null
  return new URL(url.pathname + url.search, EDITOR_ORIGIN).href
}

export async function editorFetch(path, init = {}) {
  const target = new URL(path, EDITOR_ORIGIN)
  if (target.origin !== EDITOR_ORIGIN) throw Error('Cross-origin editor callback refused')
  const headers = editorHeaders(init.headers)
  return fetch(target, { signal: AbortSignal.timeout(60000), ...init, headers, redirect: 'error' })
}

export function assetFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url || input.href)
  const callback = editorAssetUrl(url.href)
  return callback ? editorFetch(callback, init) : fetch(input, init)
}

export function modelProcessEnv(input = process.env) {
  const env = { ...input }
  for (const key of ['PASCAL_SCENE_API_TOKEN', 'PASCAL_GATEWAY_TOKEN', 'PASCAL_MODELSCOPE_TOKEN', 'PASCAL_ADMIN_PASSWORD', 'PASCAL_TAILSCALE_AUTHKEY'])
    delete env[key]
  return env
}

// Independent cloud workers require the same service token as the gateway.
// Existing loopback-only local services retain their current behavior.
export function guardWorkerRequest(req, res) {
  const token = process.env.PASCAL_GATEWAY_TOKEN
  if (!token) return false
  const supplied = req.headers['x-pascal-gateway-token']
  const a = Buffer.from(typeof supplied === 'string' ? supplied : '')
  const b = Buffer.from(token)
  if (a.length === b.length && timingSafeEqual(a, b)) return false
  res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ error: 'unauthorized' }))
  return true
}
