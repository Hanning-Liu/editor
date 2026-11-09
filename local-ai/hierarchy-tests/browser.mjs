import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = 'hierarchy-tests/',
  project = JSON.parse(await readFile(base + 'project.json'))
const api = 'http://127.0.0.1:3002/api/scenes/' + project.id
const scene = () => fetch(api).then((r) => r.json())
async function until(fn, label) {
  for (let i = 0; i < 100; i++) {
    let s = await scene()
    if (fn(s)) return s
    await new Promise((r) => setTimeout(r, 200))
  }
  throw Error('Persist timeout: ' + label)
}
const before = await scene()
const b = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
})
const p = await b.newPage({ viewport: { width: 1700, height: 1150 } }),
  errors = [],
  saves = []
p.on('pageerror', (e) => {
  errors.push(e.message)
  console.log('PAGEERROR', e.message)
})
p.on('response', (r) => {
  if (r.url() === api && r.request().method() === 'PUT') saves.push(r.status())
})
const room = p.locator('[data-room-hierarchy="' + project.roomId + '"]')
let areaId, groupId
try {
  await p.goto('http://127.0.0.1:3002/project/' + project.id, {
    timeout: 120000,
    waitUntil: 'domcontentloaded',
  })
  await p.waitForFunction(() => {
    const b = document.querySelector('button[aria-label=Scene]')
    return b && Object.keys(b).some((k) => k.startsWith('__reactProps'))
  })
  await p.waitForTimeout(1500)
  if (!(await room.isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await room.waitFor({ timeout: 60000 })
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  await p.waitForTimeout(1000)
  await room
    .getByRole('button', { name: 'Add functional zone', exact: true })
    .click()
  await room.getByLabel('Hierarchy name', { exact: true }).fill('网页会客区')
  await room.getByLabel('Zone functions', { exact: true }).fill('会客')
  const polygon = [
    [0.2, 0.2],
    [7.8, 0.2],
    [7.8, 5.8],
    [0.2, 5.8],
  ]
  for (let i = 0; i < polygon.length; i++) {
    await room
      .getByLabel('Boundary point ' + (i + 1) + ' X', { exact: true })
      .fill(String(polygon[i][0]))
    await room
      .getByLabel('Boundary point ' + (i + 1) + ' Z', { exact: true })
      .fill(String(polygon[i][1]))
  }
  await room
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  let s = await until(
    (s) =>
      Object.values(s.graph.nodes).some(
        (n) => n.type === 'functional-zone' && n.name === '网页会客区',
      ),
    'create zone',
  )
  areaId = Object.values(s.graph.nodes).find(
    (n) => n.type === 'functional-zone',
  ).id
  for (const id of [project.tableId, project.chairId, project.toyId])
    assert.deepEqual(s.graph.nodes[id], before.graph.nodes[id])
  await room
    .getByRole('button', {
      name: 'Edit functional zone 网页会客区',
      exact: true,
    })
    .click()
  await room.getByLabel('Hierarchy name', { exact: true }).fill('网页会客区改')
  await room.getByLabel('Zone functions', { exact: true }).fill('会客、阅读')
  await room
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) => s.graph.nodes[areaId]?.name === '网页会客区改',
    'edit zone',
  )
  await room
    .getByRole('button', {
      name: 'Add furniture group 网页会客区改',
      exact: true,
    })
    .click()
  await room.getByLabel('Hierarchy name', { exact: true }).fill('网页桌椅组')
  await room.getByLabel('Group purpose', { exact: true }).fill('阅读与桌面展示')
  await room.getByLabel('Group member Bedside Table', { exact: true }).check()
  await room
    .getByLabel('Group member Livingroom Chair', { exact: true })
    .check()
  await room
    .getByLabel('Group anchor', { exact: true })
    .selectOption(project.tableId)
  await room
    .getByLabel('Member role Bedside Table', { exact: true })
    .fill('展示桌')
  await room
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  s = await until(
    (s) =>
      Object.values(s.graph.nodes).some(
        (n) => n.type === 'furniture-group' && n.name === '网页桌椅组',
      ),
    'create group',
  )
  groupId = Object.values(s.graph.nodes).find(
    (n) => n.type === 'furniture-group',
  ).id
  assert.equal(s.graph.nodes[project.toyId].parentId, project.tableId)
  for (const id of [project.tableId, project.chairId, project.toyId])
    assert.deepEqual(s.graph.nodes[id], before.graph.nodes[id])
  const group = p.locator('[data-furniture-group="' + groupId + '"]')
  await group.getByText('验收Toy', { exact: true }).waitFor()
  await group
    .getByRole('button', {
      name: 'Collapse furniture group 网页桌椅组',
      exact: true,
    })
    .click()
  assert.equal(await group.getByText('验收Toy', { exact: true }).count(), 0)
  await group
    .getByRole('button', {
      name: 'Expand furniture group 网页桌椅组',
      exact: true,
    })
    .click()
  await group.getByText('验收Toy', { exact: true }).waitFor()
  await room
    .getByRole('button', {
      name: 'Collapse functional zone 网页会客区改',
      exact: true,
    })
    .click()
  assert.equal(await group.count(), 0)
  await room
    .getByRole('button', {
      name: 'Expand functional zone 网页会客区改',
      exact: true,
    })
    .click()
  await group.waitFor()
  await room
    .getByRole('button', {
      name: 'Edit furniture group 网页桌椅组',
      exact: true,
    })
    .click()
  await room.getByLabel('Hierarchy name', { exact: true }).fill('网页桌椅组改')
  await room
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) => s.graph.nodes[groupId]?.name === '网页桌椅组改',
    'edit group',
  )
  await room
    .getByRole('button', {
      name: 'Edit furniture group 网页桌椅组改',
      exact: true,
    })
    .click()
  await room.getByLabel('Group translation X', { exact: true }).fill('1')
  await room.getByLabel('Group translation Z', { exact: true }).fill('2')
  await room.getByLabel('Group rotation angle', { exact: true }).fill('90')
  await room
    .getByRole('button', { name: 'Apply group transform', exact: true })
    .click()
  const transformed = await until(
    (s) => Math.abs(s.graph.nodes[project.tableId].position[0] - 3) < 1e-6,
    'transform',
  )
  assert.deepEqual(
    transformed.graph.nodes[project.toyId],
    before.graph.nodes[project.toyId],
  )
  assert.ok(
    Math.abs(transformed.graph.nodes[project.chairId].position[0] - 3) < 1e-6,
  )
  assert.ok(
    Math.abs(transformed.graph.nodes[project.chairId].position[2] - 2) < 1e-6,
  )
  assert.ok(
    Math.abs(
      transformed.graph.nodes[project.chairId].rotation[1] - Math.PI / 2,
    ) < 1e-6,
  )
  await room
    .getByRole('button', { name: 'Undo hierarchy edit', exact: true })
    .click()
  const undone = await until(
    (s) => s.graph.nodes[project.tableId].position[0] === 2,
    'undo transform',
  )
  for (const id of [project.tableId, project.chairId, project.toyId])
    assert.deepEqual(undone.graph.nodes[id], before.graph.nodes[id])
  await room
    .getByRole('button', { name: 'Redo hierarchy edit', exact: true })
    .click()
  await until(
    (s) => s.graph.nodes[project.tableId].position[0] === 3,
    'redo transform',
  )
  await room.getByRole('button', { name: 'Close editor', exact: true }).click()
  await p.reload({ timeout: 120000, waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const b = document.querySelector('button[aria-label=Scene]')
    return b && Object.keys(b).some((k) => k.startsWith('__reactProps'))
  })
  await p.waitForTimeout(1500)
  if (!(await room.isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await room.waitFor()
  await p
    .locator('[data-furniture-group="' + groupId + '"]')
    .getByText('验收Toy', { exact: true })
    .waitFor()
  let current = await scene()
  assert.deepEqual(
    current.graph.nodes[groupId],
    transformed.graph.nodes[groupId],
  )
  assert.deepEqual(current.graph.nodes[areaId], transformed.graph.nodes[areaId])
  assert.deepEqual(
    current.graph.nodes[project.toyId],
    before.graph.nodes[project.toyId],
  )
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  await p.locator('[data-functional-zone-outline="' + areaId + '"]').waitFor()
  await p.screenshot({ path: base + 'hierarchy-2d.png', fullPage: true })
  await p.getByRole('tab', { name: '3D', exact: true }).click()
  await p.waitForTimeout(1800)
  await p.screenshot({ path: base + 'hierarchy-3d.png', fullPage: true })
  assert.deepEqual(errors, [])
  assert.ok(saves.length && saves.every((s) => s === 200))
  await writeFile(
    base + 'browser-report.json',
    JSON.stringify(
      {
        passed: true,
        projectId: project.id,
        areaId,
        groupId,
        created: true,
        edited: true,
        treeExpanded: true,
        hostedToyNested: true,
        translated: [1, 2],
        rotatedDegrees: 90,
        undoRedo: true,
        refreshed: true,
        switched2D3D: true,
        toyLocalPosePreserved: true,
        saves,
        errors,
      },
      null,
      2,
    ),
  )
  console.log('browser acceptance passed', areaId, groupId)
} catch (e) {
  console.error('BROWSER FAILURE', e)
  await p
    .screenshot({
      path: base + 'browser-failure.png',
      fullPage: true,
      timeout: 5000,
    })
    .catch(() => {})
  console.log((await p.locator('body').innerText()).slice(-1800))
  throw e
} finally {
  await b.close()
}
