import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const dir = 'hierarchy-ux-tests/'
const old = JSON.parse(await readFile(dir + 'original-scenes.json'))
const changed = []
for (const [id, g] of Object.entries(old)) {
  let r = await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  if (!r.ok) throw Error('Scene HTTP ' + r.status)
  let s = await r.json()
  try {
    assert.deepEqual(s.graph, g)
  } catch {
    changed.push(id)
  }
}
const health = {}
for (const [name, url] of Object.entries({
  editor: 'http://127.0.0.1:3002',
  chat: 'http://127.0.0.1:18081/health',
  studio: 'http://127.0.0.1:18082/health',
  qwen: 'http://127.0.0.1:18080/health',
})) {
  const r = await fetch(url)
  health[name] = r.status
}
assert.deepEqual(changed, [])
assert.ok(Object.values(health).every((x) => x === 200))
const out = {
  passed: true,
  originalProjectsUnchanged: Object.keys(old).length,
  changed,
  health,
}
await writeFile(dir + 'preservation-report.json', JSON.stringify(out, null, 2))
console.log(out)
