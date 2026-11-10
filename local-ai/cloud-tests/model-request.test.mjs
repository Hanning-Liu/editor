import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { Agent } from 'undici'
import { modelFetch, isModelTimeout, errorDetails } from '../model-request.mjs'

async function withServer(handler, run) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('slow response headers use the caller deadline instead of an HTTP header deadline', async () => {
  const legacy = new Agent({ headersTimeout: 50 })
  try {
    await withServer((_req, res) => setTimeout(() => res.end('{"ok":true}'), 1300), async url => {
      await assert.rejects(fetch(url, { dispatcher: legacy }), e => e.cause?.code === 'UND_ERR_HEADERS_TIMEOUT')
      const response = await modelFetch(url, { signal: AbortSignal.timeout(5000) })
      assert.deepEqual(await response.json(), { ok: true })
    })
  } finally { await legacy.close() }
})

test('deadline cancels slow headers and slow bodies', async () => {
  for (const headersSent of [false, true]) {
    await withServer((_req, res) => {
      if (headersSent) { res.writeHead(200); res.flushHeaders() }
      setTimeout(() => res.end('{}'), 150)
    }, async url => {
      await assert.rejects((async () => {
        const response = await modelFetch(url, { signal: AbortSignal.timeout(50) })
        await response.json()
      })(), e => isModelTimeout(e))
    })
  }
})

test('user cancellation propagates without retrying a model request', async () => {
  let requests = 0
  await withServer((_req, res) => { requests++; setTimeout(() => res.end('{}'), 150) }, async url => {
    const controller = new AbortController()
    const reason = { kind: 'user' }
    setTimeout(() => controller.abort(reason), 40)
    await assert.rejects(modelFetch(url, { signal: controller.signal }), e => e === reason)
    assert.equal(requests, 1)
  })
})

test('HTTP failures remain inspectable and are not automatically replayed', async () => {
  let requests = 0
  await withServer((_req, res) => { requests++; res.writeHead(503); res.end('busy') }, async url => {
    const response = await modelFetch(url, { signal: AbortSignal.timeout(1000) })
    assert.equal(response.status, 503)
    assert.equal(await response.text(), 'busy')
    assert.equal(requests, 1)
  })
  assert.throws(() => modelFetch('http://127.0.0.1:1', {}), /requires/)
  const error = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' }) })
  assert.equal(isModelTimeout(error), true)
  assert.match(errorDetails(error), /UND_ERR_HEADERS_TIMEOUT: Headers Timeout Error/)
})

test('real five-minute Node fetch limit is bypassed while keeping a six-minute deadline', {
  skip: process.env.PASCAL_TEST_SLOW_HEADERS !== '1',
}, async () => {
  await withServer((_req, res) => setTimeout(() => res.end('{"ok":true}'), 310000), async url => {
    const results = await Promise.allSettled([
      fetch(url, { signal: AbortSignal.timeout(360000) }),
      modelFetch(url, { signal: AbortSignal.timeout(360000) }).then(r => r.json()),
    ])
    assert.equal(results[0].status, 'rejected')
    assert.equal(results[0].reason.cause?.code, 'UND_ERR_HEADERS_TIMEOUT')
    assert.equal(results[1].status, 'fulfilled')
    assert.deepEqual(results[1].value, { ok: true })
  })
})
