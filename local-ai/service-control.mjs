import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.dirname(fileURLToPath(import.meta.url))
const service = process.argv[2],
  action = process.argv[3] || 'start'
if (!['editor', 'chat', 'studio', 'qwen'].includes(service))
  throw Error('Unknown service')
if (!['start', 'stop', 'restart'].includes(action))
  throw Error('Unknown service action')
const label = 'org.jia.localpascal.' + service
const urls = {
  editor: 'http://127.0.0.1:3002/api/health',
  chat: 'http://127.0.0.1:18081/health',
  studio: 'http://127.0.0.1:18082/health',
  qwen: 'http://127.0.0.1:18080/v1/models',
}
if (action === 'start') {
  try {
    const r = await fetch(urls[service], { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      console.log(service + ' already running')
      process.exit(0)
    }
  } catch {}
}
if (action === 'stop') {
  try {
    execFileSync('/bin/launchctl', ['remove', label])
  } catch {}
  process.exit(0)
}
try {
  execFileSync('/bin/launchctl', ['remove', label], { stdio: 'ignore' })
} catch {}
const unloadDeadline = Date.now() + 10000
while (Date.now() < unloadDeadline) {
  try {
    execFileSync('/bin/launchctl', ['list', label], { stdio: 'ignore' })
  } catch {
    break
  }
  await new Promise((r) => setTimeout(r, 150))
}
const bun = execFileSync('/usr/bin/which', ['bun'], { encoding: 'utf8' }).trim()
execFileSync(
  '/bin/launchctl',
  [
    'submit',
    '-l',
    label,
    '-o',
    path.join(root, service + '-server.log'),
    '-e',
    path.join(root, service + '-server.log'),
    '--',
    '/usr/bin/env',
    'PATH=' + process.env.PATH,
    'PASCAL_DATA_DIR=' + path.join(root, 'pascal-home/data'),
    'LOCAL_NODE=' + process.execPath,
    'LOCAL_BUN=' + bun,
    '/bin/bash',
    path.join(root, 'run-local-service.sh'),
    service,
  ],
  { stdio: 'inherit' },
)
const deadline = Date.now() + 30000
let ready = false
while (Date.now() < deadline) {
  try {
    const r = await fetch(urls[service], { signal: AbortSignal.timeout(2000) })
    if (r.ok) {
      ready = true
      break
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 300))
}
if (!ready)
  throw Error(
    'Service startup not ready: ' +
      label +
      '; see ' +
      path.join(root, service + '-server.log'),
  )
console.log('Started ' + label)
