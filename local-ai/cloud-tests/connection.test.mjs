import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const moduleUrl = new URL('../connection.mjs', import.meta.url).href

test('worker credentials are scoped to API callbacks and public assets use the API ingress', async () => {
  process.env.PASCAL_EDITOR_URL = 'https://studio-example.api-inference.modelscope.net'
  process.env.PASCAL_PUBLIC_URL = 'https://example.ms.show'
  process.env.PASCAL_MODELSCOPE_TOKEN = 'unit-platform-token'
  process.env.PASCAL_SCENE_API_TOKEN = 'unit-scene-token'
  const { editorFetch, assetFetch, editorAssetUrl } = await import(moduleUrl)
  const calls = [], originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}')
  }
  try {
    await editorFetch('/api/worker-store', { method: 'POST', body: '{}' })
    assert.equal(calls[0].url, process.env.PASCAL_EDITOR_URL + '/api/worker-store')
    assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer unit-platform-token')
    assert.equal(calls[0].init.headers.get('x-pascal-scene-token'), 'unit-scene-token')
    assert.equal(calls[0].init.redirect, 'error')
    await assetFetch('https://example.ms.show/api/local-studio?action=file&name=model.glb')
    assert.equal(calls[1].url, process.env.PASCAL_EDITOR_URL + '/api/local-studio?action=file&name=model.glb')
    assert.equal(calls[1].init.headers.get('Authorization'), 'Bearer unit-platform-token')
    await assetFetch('https://catalog.example.org/model.glb')
    assert.equal(calls[2].url, 'https://catalog.example.org/model.glb')
    assert.equal(calls[2].init, undefined)
    assert.equal(editorAssetUrl('https://example.ms.show.evil.test/asset'), null)
    await assert.rejects(editorFetch('https://catalog.example.org/private'), /Cross-origin/)
    assert.equal(calls.length, 3)
  } finally { globalThis.fetch = originalFetch }
})

test('a platform token cannot be configured for a foreign callback origin', () => {
  const child = `import(${JSON.stringify(moduleUrl)}).then(()=>process.exit(1)).catch(e=>{if(!/dedicated ModelScope API origin/.test(e.message))process.exit(2)})`
  execFileSync(process.execPath, ['--input-type=module', '-e', child], {
    env: { ...process.env, PASCAL_EDITOR_URL: 'https://foreign.example.org', PASCAL_MODELSCOPE_TOKEN: 'unit-token' },
    stdio: 'pipe',
  })
})

test('Blender and image model child processes do not inherit service credentials', async () => {
  const { modelProcessEnv } = await import(moduleUrl)
  const input = { PATH: process.env.PATH, HOME: process.env.HOME, HF_HUB_OFFLINE: '1',
    PASCAL_SCENE_API_TOKEN: 'test-only', PASCAL_GATEWAY_TOKEN: 'test-only',
    PASCAL_MODELSCOPE_TOKEN: 'test-only', PASCAL_ADMIN_PASSWORD: 'test-only', PASCAL_TAILSCALE_AUTHKEY: 'test-only' }
  const stdout = execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env)))'], {
    env: modelProcessEnv(input), encoding: 'utf8',
  })
  const keys = JSON.parse(stdout)
  assert.ok(keys.includes('HF_HUB_OFFLINE'))
  assert.ok(!keys.some(key => key.startsWith('PASCAL_')))
})
