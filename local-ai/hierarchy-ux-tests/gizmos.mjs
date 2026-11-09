import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = 'hierarchy-ux-tests/',
  pr = JSON.parse(await readFile(base + 'project.json')),
  phase = JSON.parse(await readFile(base + 'browser-phase1.json'))
const api = 'http://127.0.0.1:3002/api/scenes/' + pr.id
const scene = async () => {
  const r = await fetch(api)
  assert.ok(r.ok, 'Scene HTTP ' + r.status)
  return r.json()
}
async function until(fn, label) {
  for (let i = 0; i < 30; i++) {
    const s = await scene()
    if (fn(s)) return s
    await new Promise((r) => setTimeout(r, 1100))
  }
  throw Error(label)
}
const ids = [pr.tableId, pr.chairId, pr.toyId],
  same = (s, t) =>
    ids.every(
      (id) =>
        JSON.stringify(s.graph.nodes[id]) === JSON.stringify(t.graph.nodes[id]),
    )
const group = phase.groupA
const b = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
})
const p = await b.newPage({ viewport: { width: 1700, height: 1150 } }),
  errors = []
p.on('pageerror', (e) => errors.push(e.message))
const row = () => p.locator('[data-spatial-row="' + group + '"]')
async function undo() {
  await p.evaluate(() => document.activeElement?.blur())
  await p.keyboard.press('Meta+z')
}
async function drag(a, z) {
  await p.mouse.move(a.x, a.y)
  await p.mouse.down()
  await p.mouse.move(z.x, z.y, { steps: 18 })
  await p.waitForTimeout(180)
  await p.mouse.up()
  await p.waitForTimeout(500)
}
const projected = async (name) =>
  p.evaluate((name) => {
    const canvas = document.querySelector('canvas')
    let f =
        canvas[Object.keys(canvas).find((k) => k.startsWith('__reactFiber'))],
      root
    for (let i = 0; f && i < 20 && !root; i++, f = f.return) {
      let h = f.memoizedState,
        j = 0
      while (h && j++ < 80) {
        for (const v of [h.memoizedState, h.memoizedState?.current])
          if (v?.scene?.isScene && v.camera?.isCamera) root = v
        h = h.next
      }
    }
    if (!root) throw Error('R3F state unavailable')
    const obj = root.scene.getObjectByName(name)
    if (!obj) throw Error('Handle not mounted: ' + name)
    const rect = canvas.getBoundingClientRect(),
      pos = obj
        .getWorldPosition(root.camera.position.clone())
        .project(root.camera),
      cx = rect.x + ((pos.x + 1) * rect.width) / 2,
      cy = rect.y + ((1 - pos.y) * rect.height) / 2
    const ray = new root.raycaster.constructor()
    for (let radius = 0; radius < 40; radius += 3)
      for (let a = 0; a < 12; a++) {
        const x = cx + Math.cos((a * Math.PI) / 6) * radius,
          y = cy + Math.sin((a * Math.PI) / 6) * radius
        ray.setFromCamera(
          {
            x: ((x - rect.x) / rect.width) * 2 - 1,
            y: 1 - ((y - rect.y) / rect.height) * 2,
          },
          root.camera,
        )
        if (ray.intersectObject(obj, false).length) return { x, y }
      }
    throw Error('Handle has no screen hit')
  }, name)
const report = { projectId: pr.id, groupId: group }
try {
  await p.goto('http://127.0.0.1:3002/project/' + pr.id, {
    timeout: 120000,
    waitUntil: 'domcontentloaded',
  })
  await p.waitForFunction(() => {
    const e = document.querySelector('button[aria-label=Scene]')
    return e && Object.keys(e).some((k) => k.startsWith('__reactProps'))
  })
  await p.waitForTimeout(1800)
  if (!(await row().isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  await row().click()
  await p.locator('[data-group-selection-box]').waitFor()
  let before = await scene()
  const box = await p.locator('[data-group-move-handle]').boundingBox()
  await drag(
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2 + 70, y: box.y + box.height / 2 - 35 },
  )
  let moved = await until(
    (s) =>
      JSON.stringify(s.graph.nodes[pr.tableId].position) !==
      JSON.stringify(before.graph.nodes[pr.tableId].position),
    '2D move',
  )
  for (let axis of [0, 2])
    assert.ok(
      Math.abs(
        moved.graph.nodes[pr.tableId].position[axis] -
          before.graph.nodes[pr.tableId].position[axis] -
          (moved.graph.nodes[pr.chairId].position[axis] -
            before.graph.nodes[pr.chairId].position[axis]),
      ) < 1e-6,
    )
  assert.deepEqual(moved.graph.nodes[pr.toyId], before.graph.nodes[pr.toyId])
  await undo()
  await until((s) => same(s, before), '2D move undo')
  report.move2D = true
  console.log('2D move passed')
  await row().click()
  const rb = await p.locator('[data-group-selection-box] > rect').boundingBox(),
    handle = await p
      .locator('[data-group-rotate-handle]')
      .first()
      .boundingBox(),
    center = { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 },
    start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  await drag(start, {
    x: center.x - (start.y - center.y),
    y: center.y + (start.x - center.x),
  })
  let turned = await until(
    (s) =>
      Math.abs(
        s.graph.nodes[pr.tableId].rotation[1] -
          before.graph.nodes[pr.tableId].rotation[1],
      ) > 0.1,
    '2D rotation',
  )
  assert.ok(
    Math.abs(
      turned.graph.nodes[pr.tableId].rotation[1] -
        before.graph.nodes[pr.tableId].rotation[1] -
        (turned.graph.nodes[pr.chairId].rotation[1] -
          before.graph.nodes[pr.chairId].rotation[1]),
    ) < 1e-6,
  )
  assert.deepEqual(turned.graph.nodes[pr.toyId], before.graph.nodes[pr.toyId])
  assert.deepEqual(
    turned.graph.nodes[pr.tableId].position,
    before.graph.nodes[pr.tableId].position,
  )
  report.rotation2D =
    turned.graph.nodes[pr.tableId].rotation[1] -
    before.graph.nodes[pr.tableId].rotation[1]
  await p.screenshot({ path: base + '2d-rotated.png' })
  await undo()
  await until((s) => same(s, before), '2D rotate undo')
  console.log('2D rotation passed')
  await p.getByRole('tab', { name: '3D', exact: true }).click()
  await p.mouse.move(1000, 650)
  await p.waitForTimeout(1500)
  await row().click()
  await p.mouse.move(1000, 650)
  await p.waitForTimeout(500)
  await p.screenshot({ path: base + '3d-handles.png' })
  const move = await projected('group-move-handle')
  await drag(move, { x: move.x + 80, y: move.y + 25 })
  moved = await until(
    (s) =>
      JSON.stringify(s.graph.nodes[pr.tableId].position) !==
      JSON.stringify(before.graph.nodes[pr.tableId].position),
    '3D move',
  )
  for (let axis of [0, 2])
    assert.ok(
      Math.abs(
        moved.graph.nodes[pr.tableId].position[axis] -
          before.graph.nodes[pr.tableId].position[axis] -
          (moved.graph.nodes[pr.chairId].position[axis] -
            before.graph.nodes[pr.chairId].position[axis]),
      ) < 1e-6,
    )
  assert.deepEqual(moved.graph.nodes[pr.toyId], before.graph.nodes[pr.toyId])
  await undo()
  await until((s) => same(s, before), '3D move undo')
  report.move3D = true
  console.log('3D move passed')
  await row().click()
  await p.mouse.move(1000, 650)
  await p.waitForTimeout(600)
  const rotate = await projected('group-rotate-handle')
  await drag(rotate, { x: rotate.x + 100, y: rotate.y - 90 })
  turned = await until(
    (s) =>
      Math.abs(
        s.graph.nodes[pr.tableId].rotation[1] -
          before.graph.nodes[pr.tableId].rotation[1],
      ) > 0.1,
    '3D rotation',
  )
  assert.deepEqual(turned.graph.nodes[pr.toyId], before.graph.nodes[pr.toyId])
  assert.ok(
    Math.abs(
      turned.graph.nodes[pr.tableId].rotation[1] -
        before.graph.nodes[pr.tableId].rotation[1] -
        (turned.graph.nodes[pr.chairId].rotation[1] -
          before.graph.nodes[pr.chairId].rotation[1]),
    ) < 1e-6,
  )
  assert.deepEqual(
    turned.graph.nodes[pr.tableId].position,
    before.graph.nodes[pr.tableId].position,
  )
  report.rotation3D =
    turned.graph.nodes[pr.tableId].rotation[1] -
    before.graph.nodes[pr.tableId].rotation[1]
  await undo()
  await until((s) => same(s, before), '3D rotation undo')
  await p.keyboard.press('Meta+Shift+z')
  await until((s) => same(s, turned), '3D redo')
  await p.reload({ timeout: 120000, waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  if (!(await row().isVisible()))
    await p.getByRole('button', { name: 'Scene', exact: true }).click()
  await row().waitFor()
  await p
    .locator('[data-furniture-group="' + group + '"]')
    .getByText('验收Toy', { exact: true })
    .waitFor()
  assert.ok(same(await scene(), turned))
  await row().click()
  await p.getByRole('tab', { name: '2D', exact: true }).click()
  await p.locator('[data-group-selection-box]').waitFor()
  await p.screenshot({ path: base + 'refreshed-2d.png' })
  await p.getByRole('tab', { name: '3D', exact: true }).click()
  await p.mouse.move(1000, 650)
  await p.waitForTimeout(1200)
  await p.screenshot({ path: base + 'refreshed-3d.png' })
  assert.deepEqual(errors, [])
  await writeFile(
    base + 'gizmo-report.json',
    JSON.stringify(
      {
        ...report,
        passed: true,
        undoRedo: true,
        refreshed: true,
        supportPreserved: true,
        errors,
      },
      null,
      2,
    ),
  )
  console.log('gizmo and refresh acceptance passed')
} catch (e) {
  console.error(e)
  await p.screenshot({ path: base + 'gizmo-failure.png' }).catch(() => {})
  throw e
} finally {
  await b.close()
}
