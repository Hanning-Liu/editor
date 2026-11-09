import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const project = JSON.parse(await readFile('hierarchy-tests/qwen-project.json'))
const api = 'http://127.0.0.1:3002/api/scenes/' + project.id,
  before = await (await fetch(api)).json()
const area = Object.values(before.graph.nodes).find(
    (n) => n.type === 'functional-zone',
  ),
  group = Object.values(before.graph.nodes).find(
    (n) => n.type === 'furniture-group',
  )
assert.equal(group.name, 'Qwen阅读组已编辑')
const b = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
})
const p = await b.newPage({ viewport: { width: 1700, height: 1150 } }),
  errors = [],
  consoleErrors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
try {
  await p.goto(
    'http://127.0.0.1:3002/project/' + project.id + '?local-render=1',
    { timeout: 120000, waitUntil: 'domcontentloaded' },
  )
  await p.waitForFunction(
    () => window.pascalLocalReady?.(),
    {},
    { timeout: 60000 },
  )
  const room = p.locator('[data-room-hierarchy="' + area.roomId + '"]')
  if (!(await room.isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await room.waitFor()
  await p
    .locator('[data-furniture-group="' + group.id + '"]')
    .getByText('验收Toy', { exact: true })
    .waitFor()
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  const outline = p.locator(
    '[data-functional-zone-outline="' + area.id + '"] polygon',
  )
  await outline.waitFor()
  const box = await outline.boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.wheel(0, -650)
  await p.waitForTimeout(700)
  await p.screenshot({
    path: 'hierarchy-tests/qwen-refreshed-2d.png',
    fullPage: true,
  })
  await p.getByRole('tab', { name: '3D', exact: true }).click()
  await p.waitForFunction(
    () => window.pascalLocalReady?.(),
    {},
    { timeout: 60000 },
  )
  await p.waitForTimeout(1000)
  await p.screenshot({
    path: 'hierarchy-tests/qwen-refreshed-3d.png',
    fullPage: true,
  })
  const after = await (await fetch(api)).json()
  assert.deepEqual(after.graph, before.graph)
  assert.deepEqual(errors, [])
  await writeFile(
    'hierarchy-tests/qwen-refresh-report.json',
    JSON.stringify(
      {
        passed: true,
        projectId: project.id,
        semanticTreeReloaded: true,
        hostedToyNested: true,
        switched2D3D: true,
        graphUnchanged: true,
        errors,
        consoleErrors,
      },
      null,
      2,
    ),
  )
  console.log('Qwen persisted graph and browser tree passed')
} finally {
  await b.close()
}
