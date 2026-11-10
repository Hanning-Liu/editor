import { afterEach, expect, test } from 'bun:test'
import { GET as networkStatus } from '../app/api/worker-network/route'
import { aiUpstream, isAIRequestOriginAllowed } from './ai-upstream'
import { limitedBody } from './limited-body'
import { hasWorkerToken } from './worker-token'

const original = { ...process.env }
afterEach(() => {
  for (const k of [
    'PASCAL_CHAT_URL',
    'PASCAL_STUDIO_URL',
    'PASCAL_GATEWAY_TOKEN',
    'PASCAL_SCENE_API_TOKEN',
    'PASCAL_TAILNET_CONTROL',
    'PASCAL_PUBLIC_URL',
  ]) {
    if (original[k] === undefined) delete process.env[k]
    else process.env[k] = original[k]
  }
})

test('reverse-proxy chat accepts only the configured public origin when Host is rewritten', () => {
  process.env.PASCAL_PUBLIC_URL = 'https://example.ms.show'
  const request = (origin: string) =>
    new Request('http://internal.fcapp.run/api/local-chat', {
      headers: { host: 'internal.fcapp.run', origin, 'x-forwarded-host': 'evil.test' },
    })
  expect(isAIRequestOriginAllowed(request('https://example.ms.show'))).toBe(true)
  expect(isAIRequestOriginAllowed(request('https://evil.test'))).toBe(false)
  expect(isAIRequestOriginAllowed(request('https://example.ms.show.evil.test'))).toBe(false)
})

test('network enrollment status is available only to the explicit worker credential', async () => {
  process.env.PASCAL_SCENE_API_TOKEN = 'network-operator-token'
  delete process.env.PASCAL_TAILNET_CONTROL
  const cookieOnly = new Request('https://app.test/api/worker-network', {
    headers: { cookie: 'pascal_session=anything' },
  })
  expect((await networkStatus(cookieOnly)).status).toBe(401)
  const worker = new Request('https://app.test/api/worker-network', {
    headers: { 'x-pascal-scene-token': 'network-operator-token' },
  })
  expect((await networkStatus(worker)).status).toBe(404)
})

test('default remains local while cloud forwarding needs TLS and a service token', () => {
  delete process.env.PASCAL_CHAT_URL
  delete process.env.PASCAL_GATEWAY_TOKEN
  expect(aiUpstream('chat', new URLSearchParams('action=context')).url.href).toBe(
    'http://127.0.0.1:18081/?action=context',
  )
  process.env.PASCAL_CHAT_URL = 'http://gateway.test/chat'
  expect(() => aiUpstream('chat', new URLSearchParams())).toThrow('HTTPS')
  process.env.PASCAL_CHAT_URL = 'https://gateway.test/chat'
  expect(() => aiUpstream('chat', new URLSearchParams())).toThrow('token')
  process.env.PASCAL_GATEWAY_TOKEN = 'a'.repeat(48)
  const forwarded = aiUpstream(
    'chat',
    new URLSearchParams({ sceneId: 'cloud-test', action: 'chat' }),
  )
  expect(forwarded.url.pathname).toBe('/chat')
  expect(forwarded.url.searchParams.get('sceneId')).toBe('cloud-test')
  expect(forwarded.headers['x-pascal-gateway-token']).toBe('a'.repeat(48))
})

test('worker token is explicit and does not accept browser cookies', () => {
  const env = { PASCAL_SCENE_API_TOKEN: 'worker-secret' }
  expect(
    hasWorkerToken(
      new Request('https://app.test', { headers: { cookie: 'pascal_session=anything' } }),
      env,
    ),
  ).toBe(false)
  expect(
    hasWorkerToken(
      new Request('https://app.test', { headers: { 'x-pascal-scene-token': 'worker-secret' } }),
      env,
    ),
  ).toBe(true)
  expect(
    hasWorkerToken(
      new Request('https://app.test', { headers: { 'x-pascal-scene-token': 'worker-secrex' } }),
      env,
    ),
  ).toBe(false)
})

test('streamed bodies without content length cannot bypass the upload cap', async () => {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('123'))
      c.enqueue(new TextEncoder().encode('456'))
      c.close()
    },
  })
  const request = new Request('http://localhost', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit)
  await expect(limitedBody(request, 5)).rejects.toMatchObject({ status: 413 })
  expect(
    await limitedBody(new Request('http://localhost', { method: 'POST', body: '图纸' }), 6),
  ).toBe('图纸')
})
