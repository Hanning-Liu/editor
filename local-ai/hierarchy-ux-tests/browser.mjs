import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = 'hierarchy-ux-tests/',
  project = JSON.parse(await readFile(base + 'project.json'))
const api = 'http://127.0.0.1:3002/api/scenes/' + project.id
const scene = async () => {
  const r = await fetch(api)
  if (r.status === 429) {
    await new Promise((r) => setTimeout(r, 1000))
    return scene()
  }
  if (!r.ok) throw Error('Scene HTTP ' + r.status)
  return r.json()
}
const before = await scene()
async function until(fn, label) {
  for (let i = 0; i < 35; i++) {
    let s = await scene()
    if (fn(s)) return s
    await new Promise((r) => setTimeout(r, 1100))
  }
  throw Error('Persist timeout: ' + label)
}
const b = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
})
const p = await b.newPage({ viewport: { width: 1700, height: 1150 } }),
  errors = [],
  saves = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('response', (r) => {
  if (r.url() === api && r.request().method() === 'PUT') saves.push(r.status())
})
const room = p.locator('[data-room-hierarchy="' + project.roomId + '"]')
const row = (id) => p.locator('[data-spatial-row="' + id + '"]')
const prop = () =>
  p.getByRole('group', { name: /^(Functional zone|Furniture group) editor$/ })
async function history(redo = false) {
  await p.evaluate(() => document.activeElement?.blur())
  await p.keyboard.press(redo ? 'Meta+Shift+z' : 'Meta+z')
  await p.waitForTimeout(300)
}
let areaA, areaB, groupA, groupB
try {
  await p.goto('http://127.0.0.1:3002/project/' + project.id, {
    timeout: 120000,
    waitUntil: 'domcontentloaded',
  })
  await p.waitForFunction(() => {
    const el = document.querySelector('button[aria-label=Scene]')
    return el && Object.keys(el).some((k) => k.startsWith('__reactProps'))
  })
  await p.waitForTimeout(1800)
  if (!(await room.isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await room.waitFor()
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  assert.equal(
    await room
      .getByRole('button', { name: 'Undo hierarchy edit', exact: true })
      .count(),
    0,
  )
  assert.equal(
    await room
      .getByRole('button', { name: 'Redo hierarchy edit', exact: true })
      .count(),
    0,
  )
  for (const name of ['会客区', '阅读区']) {
    await room
      .getByText('层级验收客厅', { exact: true })
      .click({ button: 'right' })
    await p
      .getByRole('menuitem', { name: 'Add functional zone', exact: true })
      .click()
    await prop().getByLabel('Hierarchy name', { exact: true }).fill(name)
    await prop()
      .getByLabel('Zone functions', { exact: true })
      .fill(name === '会客区' ? '会客' : '阅读')
    await prop()
      .getByRole('button', { name: 'Save hierarchy', exact: true })
      .click()
    let s = await until(
      (s) =>
        Object.values(s.graph.nodes).some(
          (n) => n.type === 'functional-zone' && n.name === name,
        ),
      'zone ' + name,
    )
    const id = Object.values(s.graph.nodes).find(
      (n) => n.type === 'functional-zone' && n.name === name,
    ).id
    if (name === '会客区') areaA = id
    else areaB = id
  }
  console.log('created areas', areaA, areaB)
  await row(areaA).dblclick()
  await row(areaA)
    .getByRole('textbox', { name: 'Rename', exact: true })
    .fill('会客区改')
  await row(areaA)
    .getByRole('textbox', { name: 'Rename', exact: true })
    .press('Enter')
  await until((s) => s.graph.nodes[areaA].name === '会客区改', 'inline rename')
  await history()
  await until((s) => s.graph.nodes[areaA].name === '会客区', 'rename undo')
  await history(true)
  await until((s) => s.graph.nodes[areaA].name === '会客区改', 'rename redo')
  // Selecting a row opens the real right-side properties card.
  await row(areaA).click()
  await prop().getByLabel('Zone functions', { exact: true }).fill('会客、展示')
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until((s) => s.graph.nodes[areaA].functions.length === 2, 'properties')
  const table = room
      .locator('[data-treenode-id="' + project.tableId + '"] > div')
      .first(),
    chair = room
      .locator('[data-treenode-id="' + project.chairId + '"] > div')
      .first()
  await table.click()
  await chair.click({ modifiers: ['Meta'] })
  await table.click({ button: 'right' })
  await p
    .getByRole('menuitem', {
      name: 'Create furniture group in 会客区改',
      exact: true,
    })
    .click()
  assert.equal(
    await prop()
      .getByLabel('Group member Bedside Table', { exact: true })
      .isChecked(),
    true,
  )
  assert.equal(
    await prop()
      .getByLabel('Group member Livingroom Chair', { exact: true })
      .isChecked(),
    true,
  )
  await prop().getByLabel('Hierarchy name', { exact: true }).fill('桌椅组')
  await prop()
    .getByLabel('Group anchor', { exact: true })
    .selectOption(project.tableId)
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  let s = await until(
    (s) =>
      Object.values(s.graph.nodes).some(
        (n) => n.type === 'furniture-group' && n.name === '桌椅组',
      ),
    'selection creation',
  )
  groupA = Object.values(s.graph.nodes).find(
    (n) => n.type === 'furniture-group' && n.name === '桌椅组',
  ).id
  for (const id of [project.tableId, project.chairId, project.toyId])
    assert.deepEqual(s.graph.nodes[id], before.graph.nodes[id])
  await row(groupA).click({ button: 'right' })
  await p.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await row(groupA)
    .getByRole('textbox', { name: 'Rename', exact: true })
    .fill('桌椅组改')
  await row(groupA)
    .getByRole('textbox', { name: 'Rename', exact: true })
    .press('Enter')
  await until((s) => s.graph.nodes[groupA].name === '桌椅组改', 'group rename')
  await row(groupA).click()
  await prop().getByLabel('Group purpose', { exact: true }).fill('会客展示')
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) => s.graph.nodes[groupA].purpose === '会客展示',
    'group properties',
  )
  // Create another group from the zone's focusable ellipsis menu.
  await row(areaB).hover()
  await row(areaB)
    .getByRole('button', { name: 'More actions', exact: true })
    .click()
  await p
    .getByRole('menuitem', { name: 'Create furniture group', exact: true })
    .click()
  await prop().getByLabel('Hierarchy name', { exact: true }).fill('阅读组')
  // All existing furniture is assigned: first shrink the source through its properties.
  await prop()
    .getByRole('button', { name: 'Close editor', exact: true })
    .click()
  await row(groupA).click()
  await prop()
    .getByLabel('Group member Livingroom Chair', { exact: true })
    .uncheck()
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) => s.graph.nodes[groupA].memberIds.length === 1,
    'source membership edit',
  )
  await row(areaB)
    .getByRole('button', { name: 'Create furniture group', exact: true })
    .click()
  await prop().getByLabel('Hierarchy name', { exact: true }).fill('阅读组')
  await prop()
    .getByLabel('Group member Livingroom Chair', { exact: true })
    .check()
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  s = await until(
    (s) =>
      Object.values(s.graph.nodes).some(
        (n) => n.type === 'furniture-group' && n.name === '阅读组',
      ),
    'second group',
  )
  groupB = Object.values(s.graph.nodes).find(
    (n) => n.type === 'furniture-group' && n.name === '阅读组',
  ).id
  console.log('created groups', groupA, groupB)
  // Reassign a group via an actual HTML drag/drop. No object changes.
  const poses = Object.fromEntries(
    [project.tableId, project.chairId, project.toyId].map((id) => [
      id,
      s.graph.nodes[id],
    ]),
  )
  await row(groupB).dragTo(row(areaA))
  s = await until(
    (s) => s.graph.nodes[groupB]?.functionalZoneId === areaA,
    'group drop',
  )
  for (const [id, n] of Object.entries(poses))
    assert.deepEqual(s.graph.nodes[id], n)
  await row(groupB).click()
  await prop().getByLabel('Group purpose', { exact: true }).fill('拖放后编辑')
  await prop()
    .getByRole('button', { name: 'Save hierarchy', exact: true })
    .click()
  await until(
    (s) =>
      s.graph.nodes[groupB]?.purpose === '拖放后编辑' &&
      s.graph.nodes[groupB]?.functionalZoneId === areaA,
    'edit after reassign',
  )
  await history()
  await until(
    (s) => s.graph.nodes[groupB]?.purpose !== '拖放后编辑',
    'post drop edit undo',
  )
  await history()
  await until(
    (s) => s.graph.nodes[groupB]?.functionalZoneId === areaB,
    'group drop undo',
  )
  await history(true)
  await until(
    (s) => s.graph.nodes[groupB]?.functionalZoneId === areaA,
    'group drop redo',
  )
  // Furniture transfer removes the empty source group and preserves the host family.
  await room.getByText('验收Toy', { exact: true }).click()
  await room.getByText('验收Toy', { exact: true }).dragTo(row(groupB))
  s = await until(
    (s) =>
      !s.graph.nodes[groupA] &&
      s.graph.nodes[groupB]?.memberIds.includes(project.tableId),
    'host family drop',
  )
  for (const [id, n] of Object.entries(poses))
    assert.deepEqual(s.graph.nodes[id], n)
  assert.equal(s.graph.nodes[project.toyId].parentId, project.tableId)
  await history()
  s = await until(
    (s) =>
      !!s.graph.nodes[groupA] && s.graph.nodes[groupB]?.memberIds.length === 1,
    'item drop undo',
  )
  for (const [id, n] of Object.entries(poses))
    assert.deepEqual(s.graph.nodes[id], n)
  // Invalid drop must leave the graph intact.
  const stable = structuredClone(s.graph)
  await row(groupB).dragTo(row(groupA))
  await room.getByRole('alert').waitFor()
  await p.waitForTimeout(400)
  assert.deepEqual((await scene()).graph, stable)
  // Reunite furniture for the subsequent real gizmo tests.
  await room
    .locator('[data-spatial-item="' + project.chairId + '"]')
    .dragTo(row(groupA))
  s = await until(
    (s) =>
      !s.graph.nodes[groupB] &&
      s.graph.nodes[groupA]?.memberIds.includes(project.chairId),
    'chair transfer',
  )
  for (const [id, n] of Object.entries(poses))
    assert.deepEqual(s.graph.nodes[id], n)
  await row(groupA).click()
  await p.locator('[data-group-selection-box]').waitFor()
  assert.equal(await p.locator('[data-group-rotate-handle]').count(), 4)
  await p.screenshot({ path: base + 'phase1-and-2d-handles.png' })
  await writeFile(
    base + 'browser-phase1.json',
    JSON.stringify(
      {
        passed: true,
        projectId: project.id,
        areaA,
        areaB,
        groupA,
        groupB,
        menus: true,
        properties: true,
        inlineRename: true,
        selectionDerivedCreation: true,
        globalUndoRedo: true,
        groupDrop: true,
        hostFamilyDrop: true,
        invalidDropRejected: true,
        itemPosesUnchanged: true,
        saves,
        errors,
      },
      null,
      2,
    ),
  )
  assert.deepEqual(errors, [])
  console.log('phase1 passed')
} catch (e) {
  console.error(e)
  await p.screenshot({ path: base + 'failure.png' }).catch(() => {})
  console.log((await p.locator('body').innerText()).slice(-2200))
  throw e
} finally {
  await b.close()
}
