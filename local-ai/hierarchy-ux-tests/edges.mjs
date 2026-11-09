import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = 'hierarchy-ux-tests/',
  pr = JSON.parse(await readFile(base + 'project.json')),
  r = JSON.parse(await readFile(base + 'browser-phase1.json')),
  api = 'http://127.0.0.1:3002/api/scenes/' + pr.id
const scene = async () => {
  const r = await fetch(api)
  assert.ok(r.ok)
  return r.json()
}
async function until(fn, label) {
  for (let i = 0; i < 25; i++) {
    const s = await scene()
    if (fn(s)) return s
    await new Promise((r) => setTimeout(r, 1100))
  }
  throw Error(label)
}
const before = await scene()
const b = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
})
const p = await b.newPage({ viewport: { width: 1700, height: 1150 } }),
  errors = []
p.on('pageerror', (e) => errors.push(e.message))
const row = (id) => p.locator('[data-spatial-row="' + id + '"]'),
  prop = () =>
    p.getByRole('group', { name: 'Furniture group editor', exact: true })
const undo = async () => {
  await p.evaluate(() => document.activeElement?.blur())
  await p.keyboard.press('Meta+z')
}
try {
  await p.goto('http://127.0.0.1:3002/project/' + pr.id, { timeout: 120000 })
  await p.waitForTimeout(2200)
  if (!(await row(r.groupA).isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  await row(r.groupA).click()
  await prop().waitFor()
  await row(r.groupA).dragTo(row(r.areaB))
  await until(
    (s) => s.graph.nodes[r.groupA]?.functionalZoneId === r.areaB,
    'reassign',
  )
  await prop()
    .getByLabel('Group purpose', { exact: true })
    .fill('保持新归属的编辑')
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) =>
      s.graph.nodes[r.groupA]?.functionalZoneId === r.areaB &&
      s.graph.nodes[r.groupA]?.purpose === '保持新归属的编辑',
    'edit keeps current zone',
  )
  await undo()
  await until(
    (s) => s.graph.nodes[r.groupA]?.purpose !== '保持新归属的编辑',
    'undo edit',
  )
  await undo()
  await until(
    (s) => s.graph.nodes[r.groupA]?.functionalZoneId === r.areaA,
    'undo reassign',
  )
  await row(r.groupA).click()
  await prop()
    .getByLabel('Group member Livingroom Chair', { exact: true })
    .uncheck()
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) => s.graph.nodes[r.groupA]?.memberIds.length === 1,
    'single root group',
  )
  await row(r.groupA).click()
  await p.locator('[data-group-selection-box]').waitFor()
  assert.equal(await p.locator('[data-group-rotate-handle]').count(), 4)
  const box = await p.locator('[data-group-move-handle]').boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.down()
  await p.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, {
    steps: 10,
  })
  await p.mouse.up()
  const moved = await until(
    (s) =>
      JSON.stringify(s.graph.nodes[pr.tableId].position) !==
      JSON.stringify(before.graph.nodes[pr.tableId].position),
    'single-root body drag',
  )
  assert.deepEqual(moved.graph.nodes[pr.toyId], before.graph.nodes[pr.toyId])
  assert.deepEqual(
    moved.graph.nodes[pr.chairId],
    before.graph.nodes[pr.chairId],
  )
  await undo()
  await until(
    (s) =>
      JSON.stringify(s.graph.nodes[pr.tableId]) ===
      JSON.stringify(before.graph.nodes[pr.tableId]),
    'single move undo',
  )
  await undo()
  await until(
    (s) => s.graph.nodes[r.groupA]?.memberIds.length === 2,
    'membership undo',
  )
  assert.deepEqual((await scene()).graph, before.graph)
  await row(r.groupA).focus()
  await p.keyboard.press('F2')
  await row(r.groupA)
    .getByRole('textbox', { name: 'Rename', exact: true })
    .waitFor()
  await p.keyboard.press('Escape')
  await row(r.groupA)
    .getByRole('button', { name: 'More actions', exact: true })
    .focus()
  await p.keyboard.press('Enter')
  await p
    .getByRole('menuitem', { name: 'Spatial properties', exact: true })
    .waitFor()
  await p.keyboard.press('Enter')
  await prop().waitFor()
  await p
    .locator('[data-room-hierarchy]')
    .screenshot({ path: base + 'tree.png' })
  assert.deepEqual((await scene()).graph, before.graph)
  assert.deepEqual(errors, [])
  await writeFile(
    base + 'edge-report.json',
    JSON.stringify(
      {
        passed: true,
        inspectorTracksReassignment: true,
        undoReassignment: true,
        singleRootHandles: true,
        singleRootDrag: true,
        hostedToyPreserved: true,
        unselectedChairUnchanged: true,
        undoRestoresGraph: true,
        keyboardRename: true,
        keyboardMenu: true,
        errors,
      },
      null,
      2,
    ),
  )
  console.log('Edge and keyboard acceptance passed')
} catch (e) {
  console.error(e)
  await p.screenshot({ path: base + 'edge-failure.png' }).catch(() => {})
  throw e
} finally {
  await b.close()
}
