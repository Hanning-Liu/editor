// ModelScope's container needs no TUN device, elevated capability, or public AI port.
import { spawn, execFile } from 'node:child_process'
import { mkdir, access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
const run = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const state = '/mnt/workspace/pascal/.tailnet'
const socket = '/tmp/pascal-tailnet/tailscaled.sock'
const target = process.env.PASCAL_TAILNET_GATEWAY
if (!/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?:\d{1,3})\.(?:\d{1,3}):9080$/.test(target || '') ||
    target.split(':')[0].split('.').some(n => Number(n) > 255))
  throw Error('PASCAL_TAILNET_GATEWAY must be a Tailscale IPv4 address on port 9080')
if ((process.env.PASCAL_GATEWAY_TOKEN || '').length < 32)
  throw Error('Gateway service credential is missing')

await mkdir(state, { recursive: true, mode: 0o700 })
await mkdir('/tmp/pascal-tailnet', { recursive: true, mode: 0o700 })
const children = [], env = { ...process.env }
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 1000).unref()
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop())
function start(command, args, childEnv = env, quiet = false) {
  const child = spawn(command, args, { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
    if (quiet) return
    // The enrollment URL is available only through the authenticated control API.
    process.stdout.write(bytes.toString().replace(/https:\/\/login\.tailscale\.com\/a\/\S+/g, '[private device authorization URL]'))
  })
  child.on('error', () => { console.error('A cloud transport process failed to start'); stop(1) })
  child.on('exit', code => { if (!stopping) { console.error('A cloud transport process stopped:', code); stop(1) } })
  return child
}
start('/usr/local/bin/tailscaled', [
  '--tun=userspace-networking', '--state=' + state + '/tailscale.state', '--socket=' + socket,
  '--outbound-http-proxy-listen=127.0.0.1:1055', '--port=0',
], env, true)
let ready = false
for (let attempt = 0; attempt < 100; attempt++) {
  try { await access(socket); ready = true; break } catch { await new Promise(r => setTimeout(r, 100)) }
}
if (!ready) { stop(1); throw Error('Private transport did not start') }
try {
  await run('/usr/local/bin/tailscale', [
    '--socket=' + socket, 'up', '--accept-dns=false', '--accept-routes=false',
    '--hostname=pascal-modelscope', '--timeout=5s',
  ], { timeout: 10000, maxBuffer: 65536 })
  console.log('Private Tailscale transport connected')
} catch {
  console.log('Private transport awaits device authorization; inspect the authenticated worker-network endpoint')
}
start('/usr/bin/python3', [root + 'deploy/cloud/gateway.py'], {
  ...env, PASCAL_GATEWAY_PORT: '19080', PASCAL_CHAT_WORKER: 'http://' + target,
  PASCAL_STUDIO_WORKER: 'http://' + target, PASCAL_GATEWAY_PROXY: 'http://127.0.0.1:1055',
  PASCAL_GATEWAY_PRESERVE_ROUTE: '1',
})
start(process.execPath, [root + 'apps/editor/server.js'], {
  ...env, PASCAL_CHAT_URL: 'http://127.0.0.1:19080/chat',
  PASCAL_STUDIO_URL: 'http://127.0.0.1:19080/studio', PASCAL_TAILNET_CONTROL: '1',
  PASCAL_SCENE_API_ORIGINS: env.PASCAL_PUBLIC_URL,
})
