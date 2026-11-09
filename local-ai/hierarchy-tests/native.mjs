import { createMcpSession } from '../mcp-session.mjs'
import { writeFile, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { client, transport } = createMcpSession()
const calls = []
async function call(name, args) {
  const r = await client.callTool({ name, arguments: args })
  calls.push({ name, args, result: r.structuredContent ?? r.content })
  assert.ok(!r.isError, JSON.stringify({ name, r }))
  return (
    r.structuredContent ??
    JSON.parse(r.content.find((c) => c.type === 'text').text)
  )
}
try {
  await client.connect(transport)
  const existing = (await call('list_scenes', {})).scenes.find(
    (s) => s.name === '功能分区与家具组团验收-20261109',
  )
  const project =
    existing ??
    (await call('create_project', { name: '功能分区与家具组团验收-20261109' }))
  const id = project.id
  assert.ok(id)
  if (existing) await call('load_scene', { id })
  const levels = await call('list_levels', {}),
    levelId = levels.levels.find((l) => l.role === 'occupied').id
  const zones = await call('get_zones', { levelId })
  const room = zones.zones[0]
    ? { zoneId: zones.zones[0].id }
    : await call('create_room', {
        levelId,
        name: '层级验收客厅',
        polygon: [
          [0, 0],
          [8, 0],
          [8, 6],
          [0, 6],
        ],
        wallHeight: 2.8,
      })
  const zoneId = room.zoneId
  assert.ok(zoneId)
  const code = await readFile('chat-server.mjs', 'utf8'),
    a = code.indexOf('const brief = ') + 14,
    b = code.indexOf('emit({', a),
    literal = code.slice(a, b).trim().replace(/;$/, '')
  const text =
    'Only place bedside-table, livingroom-chair and toy. Add nothing else.'
  const bounded = (reading) => ({ kind: 'bounded', quote: text, reading }),
    open = (design) => ({ kind: 'open', design })
  const brief = new Function(
    'text',
    'catalogCall',
    'bounded',
    'open',
    'return (' + literal + ')',
  )(text, true, bounded, open)
  await call('design_brief', brief)
  const prior = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  ).json()
  const items = Object.values(prior.graph.nodes).some(
    (n) => n.type === 'item' && n.asset.id === 'bedside-table',
  )
    ? { reused: true }
    : await call('place_items', {
        levelId,
        items: [
          { assetId: 'bedside-table', x: 2, z: 2, name: '层级验收桌' },
          { assetId: 'livingroom-chair', x: 4, z: 2, name: '层级验收椅' },
        ],
      })
  console.log('placed', JSON.stringify(items).slice(0, 1500))
  let scene = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  ).json()
  const table = Object.values(scene.graph.nodes).find(
    (n) => n.type === 'item' && n.asset.id === 'bedside-table',
  )
  const chair = Object.values(scene.graph.nodes).find(
    (n) => n.type === 'item' && n.asset.id === 'livingroom-chair',
  )
  assert.ok(table && chair)
  const itemBase =
    'https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/toy/'
  const template = {
    object: 'node',
    type: 'item',
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    metadata: {},
    asset: {
      id: 'toy',
      category: 'furniture',
      name: 'Toy',
      thumbnail: itemBase + 'thumbnail.png',
      floorPlanUrl: itemBase + 'floor-plan.png',
      src: itemBase + 'model.glb',
      dimensions: [0.29, 0.49, 0.34],
      tags: ['floor', 'kids', 'decor'],
    },
  }
  if (
    !Object.values(scene.graph.nodes).some(
      (n) => n.type === 'item' && n.asset.id === 'toy',
    )
  )
    await call('apply_patch', {
      patches: [
        {
          op: 'create',
          parentId: table.id,
          node: {
            ...template,
            id: 'item_hierarchy_toy_test',
            name: '验收Toy',
            parentId: table.id,
            position: [0.05, 0.5, 0.05],
            children: [],
          },
        },
      ],
    })
  scene = await (await fetch('http://127.0.0.1:3002/api/scenes/' + id)).json()
  const toy = Object.values(scene.graph.nodes).find(
    (n) => n.type === 'item' && n.asset.id === 'toy',
  )
  assert.equal(toy.parentId, table.id)
  const receipt = {
    id,
    levelId,
    roomId: zoneId,
    tableId: table.id,
    chairId: chair.id,
    toyId: toy.id,
  }
  await writeFile(
    'hierarchy-tests/project.json',
    JSON.stringify(receipt, null, 2),
  )
  await writeFile('hierarchy-tests/fixture-before.json', JSON.stringify(scene))
  console.log('fixture', JSON.stringify(receipt))
  const area = await call('edit_functional_zone', {
    roomId: zoneId,
    name: 'MCP验证区',
    functions: ['阅读'],
    polygon: [
      [0, 0],
      [8, 0],
      [8, 6],
      [0, 6],
    ],
  })
  const areaId = area.functionalZone.id
  const group = await call('edit_furniture_group', {
    functionalZoneId: areaId,
    name: 'MCP验证组',
    memberIds: [table.id, toy.id, chair.id],
    anchorNodeId: table.id,
  })
  const groupId = group.furnitureGroup.id
  await call('edit_furniture_group', { id: groupId, purpose: '桌椅与桌面摆件' })
  await call('transform_furniture_group', {
    id: groupId,
    translate: [0.4, 0.2],
    angleDegrees: 45,
    pivot: [2, 2],
  })
  let changed = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  ).json()
  assert.deepEqual(changed.graph.nodes[toy.id], scene.graph.nodes[toy.id])
  assert.notDeepEqual(changed.graph.nodes[chair.id].position, chair.position)
  await call('undo', { steps: 1 })
  let undone = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  ).json()
  assert.deepEqual(undone.graph.nodes[table.id], scene.graph.nodes[table.id])
  await call('redo', { steps: 1 })
  let redone = await (
    await fetch('http://127.0.0.1:3002/api/scenes/' + id)
  ).json()
  assert.deepEqual(redone.graph.nodes[chair.id], changed.graph.nodes[chair.id])
  const hierarchy = await call('get_spatial_hierarchy', { roomId: zoneId })
  assert.ok(hierarchy.rooms[0].functionalZones.some((a) => a.id === areaId))
  await call('edit_functional_zone', { id: areaId, delete: true })
  scene = await (await fetch('http://127.0.0.1:3002/api/scenes/' + id)).json()
  assert.ok(!scene.graph.nodes[groupId])
  assert.ok(scene.graph.nodes[table.id])
  // Restore only the dedicated fixture's item poses for the separate browser acceptance.
  const before = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      'hierarchy-tests/fixture-before.json',
      'utf8',
    ),
  )
  await call('apply_patch', {
    patches: [table, chair, toy].map((n) => ({
      op: 'update',
      id: n.id,
      data: {
        position: before.graph.nodes[n.id].position,
        rotation: before.graph.nodes[n.id].rotation,
      },
    })),
  })
  await writeFile(
    'hierarchy-tests/native-report.json',
    JSON.stringify(
      {
        passed: true,
        project: receipt,
        created: true,
        edited: true,
        movedRotated: true,
        undoRedo: true,
        deletedSemanticOnly: true,
        toyLocalPosePreserved: true,
        calls,
      },
      null,
      2,
    ),
  )
  console.log('native acceptance passed')
} finally {
  await client.close()
}
