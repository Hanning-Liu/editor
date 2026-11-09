import { describe, expect, test } from 'bun:test'
import { type AnyNode, BuildingNode, ItemNode, LevelNode, ZoneNode } from '../schema'
import { createSceneEnvironment } from '../store/scene-environment'
import { createSceneStore, sceneDocumentOf } from '../store/use-scene'
import { cloneSceneGraph } from '../utils/clone-scene-graph'
import { applySceneChanges } from './apply-changes'
import {
  editFunctionalZone,
  editFurnitureGroup,
  getSpatialHierarchy,
  transformFurnitureGroup,
} from './spatial-hierarchy'

function fixture() {
  const building = BuildingNode.parse({ id: 'building_test', children: ['level_test'] })
  const level = LevelNode.parse({
    id: 'level_test',
    parentId: building.id,
    children: ['zone_room', 'item_table', 'item_chair'],
  })
  const room = ZoneNode.parse({
    id: 'zone_room',
    parentId: level.id,
    name: 'Living dining',
    spaceRole: 'room',
    polygon: [
      [0, 0],
      [8, 0],
      [8, 6],
      [0, 6],
    ],
  })
  const asset = {
    id: 'table',
    category: 'furniture',
    name: 'Table',
    thumbnail: '',
    src: 'https://example.com/model.glb',
    dimensions: [1, 1, 1],
  }
  const table = ItemNode.parse({
    id: 'item_table',
    parentId: level.id,
    position: [2, 0, 2],
    scale: [1.3, 1, 0.8],
    asset,
    children: ['item_toy'],
  })
  const toy = ItemNode.parse({
    id: 'item_toy',
    parentId: table.id,
    position: [0.2, 1, 0.1],
    asset: { ...asset, id: 'toy', name: 'Toy' },
  })
  const chair = ItemNode.parse({
    id: 'item_chair',
    parentId: level.id,
    position: [4, 0, 2],
    asset: { ...asset, id: 'chair', name: 'Chair' },
  })
  let nodes: Record<string, AnyNode> = Object.fromEntries(
    [building, level, room, table, toy, chair].map((n) => [n.id, n]),
  )
  const area = editFunctionalZone(nodes, {
    roomId: room.id,
    name: 'Conversation',
    functions: ['conversation'],
    polygon: [
      [0, 0],
      [8, 0],
      [8, 6],
      [0, 6],
    ],
  })
  nodes = applySceneChanges(nodes, area.changes!)
  const zone = area.result.functionalZone as { id: string }
  const result = editFurnitureGroup(nodes, {
    functionalZoneId: zone.id,
    name: 'Table assembly',
    memberIds: [table.id, toy.id, chair.id],
    anchorNodeId: table.id,
    memberRoles: { [table.id]: 'anchor' },
  })
  nodes = applySceneChanges(nodes, result.changes!)
  return {
    nodes,
    zoneId: zone.id,
    groupId: (result.result.furnitureGroup as { id: string }).id,
    room,
    table,
    toy,
    chair,
  }
}
describe('independent semantic hierarchy', () => {
  test('creation only adds semantic nodes; item layouts and support remain exact', () => {
    const f = fixture()
    for (const original of [f.table, f.toy, f.chair]) expect(f.nodes[original.id]).toEqual(original)
    const read = getSpatialHierarchy(f.nodes).result
    expect(read.rooms[0]?.functionalZones[0]?.furnitureGroups[0]?.memberIds).toEqual([
      f.table.id,
      f.toy.id,
      f.chair.id,
    ])
  })
  test('rotation then translation moves roots once; hosted local pose and scaled host remain unchanged', () => {
    const f = fixture()
    const o = transformFurnitureGroup(f.nodes, {
      id: f.groupId,
      translate: [1, 0.5],
      angleDegrees: 90,
      pivot: [2, 2],
    })
    const next = applySceneChanges(f.nodes, o.changes!)
    expect(o.result.movedRootIds).toEqual([f.table.id, f.chair.id])
    expect(next[f.toy.id]).toEqual(f.toy)
    const chair = next[f.chair.id] as ItemNode
    expect(chair.position[0]).toBeCloseTo(3)
    expect(chair.position[2]).toBeCloseTo(0.5)
    expect(chair.rotation[1]).toBeCloseTo(Math.PI / 2)
    expect((next[f.table.id] as ItemNode).scale).toEqual(f.table.scale)
  })
  test('refuses child-only transform under an external support', () => {
    const f = fixture()
    let n = applySceneChanges(
      f.nodes,
      editFurnitureGroup(f.nodes, {
        id: f.groupId,
        memberIds: [f.toy.id],
        anchorNodeId: null,
        memberRoles: {},
      }).changes!,
    )
    expect(() => transformFurnitureGroup(n, { id: f.groupId, translate: [1, 0] })).toThrow(
      'supporting floor item',
    )
  })
  test('refuses duplicate ownership, invalid anchor and mixed levels', () => {
    const f = fixture()
    expect(() =>
      editFurnitureGroup(f.nodes, {
        functionalZoneId: f.zoneId,
        name: 'Other',
        memberIds: [f.table.id],
      }),
    ).toThrow('another furniture group')
    expect(() =>
      editFurnitureGroup(f.nodes, { id: f.groupId, anchorNodeId: 'item_missing' }),
    ).toThrow('Anchor must')
    const level = LevelNode.parse({ id: 'level_other', parentId: 'building_test' })
    const nodes = {
      ...f.nodes,
      [level.id]: level,
      [f.chair.id]: { ...f.chair, parentId: level.id },
    }
    expect(() => editFurnitureGroup(nodes, { id: f.groupId, name: 'Mixed' })).toThrow('room level')
  })
  test('zone deletion removes semantic groups but preserves furniture', () => {
    const f = fixture()
    const next = applySceneChanges(
      f.nodes,
      editFunctionalZone(f.nodes, { id: f.zoneId, delete: true }).changes!,
    )
    expect(next[f.groupId]).toBeUndefined()
    for (const n of [f.table, f.toy, f.chair]) expect(next[n.id]).toEqual(n)
  })
  test('rejects bow ties, collinear outlines, room holes and concave boundary crossings', () => {
    const f = fixture()
    for (const polygon of [
      [
        [0, 0],
        [4, 4],
        [4, 0],
        [0, 4],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [9, 0],
        [9, 2],
        [0, 2],
      ],
    ])
      expect(() =>
        editFunctionalZone(f.nodes, { roomId: f.room.id, name: 'Invalid', polygon }),
      ).toThrow()
    const room = {
      ...f.room,
      holes: [
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 3],
        ] as [number, number][],
      ],
    }
    expect(() =>
      editFunctionalZone(
        { ...f.nodes, [room.id]: room },
        {
          roomId: room.id,
          name: 'Hole',
          polygon: [
            [1, 1],
            [4, 1],
            [4, 4],
            [1, 4],
          ],
        },
      ),
    ).toThrow('opening')
    const concave = {
      ...f.room,
      polygon: [
        [0, 0],
        [6, 0],
        [6, 2],
        [2, 2],
        [2, 6],
        [0, 6],
      ] as [number, number][],
    }
    expect(() =>
      editFunctionalZone(
        { ...f.nodes, [concave.id]: concave },
        {
          roomId: concave.id,
          name: 'Bridge',
          polygon: [
            [1, 1],
            [5, 1],
            [1, 5],
          ],
        },
      ),
    ).toThrow('boundary')
  })
  test('native store undo/redo and serialized reload preserve semantic nodes and support', () => {
    const f = fixture(),
      env = createSceneEnvironment(),
      store = createSceneStore(env)
    store.getState().setScene(f.nodes as never, ['building_test'])
    store.temporal.getState().clear()
    const edit = editFurnitureGroup(store.getState().nodes, { id: f.groupId, name: 'Renamed' })
    store.getState().applyNodeChanges(edit.changes as never)
    expect(store.getState().nodes[f.groupId]?.name).toBe('Renamed')
    store.temporal.getState().undo()
    expect(store.getState().nodes[f.groupId]?.name).toBe('Table assembly')
    store.temporal.getState().redo()
    const saved = JSON.parse(JSON.stringify(sceneDocumentOf(store)))
    store.getState().setScene(saved.nodes, saved.rootNodeIds, saved)
    expect(store.getState().nodes[f.groupId]?.name).toBe('Renamed')
    expect(store.getState().nodes[f.toy.id]?.parentId).toBe(f.table.id)
    env.dispose()
  })
  test('whole scene cloning remaps room, zone, member, anchor and role references', () => {
    const f = fixture()
    const copy = cloneSceneGraph({ nodes: f.nodes as never, rootNodeIds: ['building_test'] })
    const zone = Object.values(copy.nodes).find((n) => n.type === 'functional-zone')!
    const group = Object.values(copy.nodes).find((n) => n.type === 'furniture-group')!
    expect(zone.type).toBe('functional-zone')
    if (zone.type !== 'functional-zone' || group.type !== 'furniture-group') return
    expect(copy.nodes[zone.roomId]?.type).toBe('zone')
    expect(group.functionalZoneId).toBe(zone.id)
    expect(group.anchorNodeId).not.toBe(f.table.id)
    expect(copy.nodes[group.anchorNodeId!]?.type).toBe('item')
    expect(Object.keys(group.memberRoles)).toEqual([group.anchorNodeId!])
    expect(group.memberIds.every((id) => copy.nodes[id]?.type === 'item')).toBe(true)
  })
  test('implicit hosted descendants stay in the group tree rather than unassigned furniture', () => {
    const f = fixture()
    const nodes = applySceneChanges(
      f.nodes,
      editFurnitureGroup(f.nodes, { id: f.groupId, memberIds: [f.table.id, f.chair.id] }).changes!,
    )
    const room = getSpatialHierarchy(nodes).result.rooms[0]!
    expect(room.unassignedItems.some((i) => i.id === f.toy.id)).toBe(false)
    expect(room.functionalZones[0]!.ungroupedItems.some((i) => i.id === f.toy.id)).toBe(false)
    expect(() =>
      editFurnitureGroup(nodes, {
        functionalZoneId: f.zoneId,
        name: 'Conflicting child',
        memberIds: [f.toy.id],
      }),
    ).toThrow('another furniture group')
  })
  test('a hosted anchor includes its support scale when computing the world pivot', () => {
    const f = fixture()
    const nodes = applySceneChanges(
      f.nodes,
      editFurnitureGroup(f.nodes, { id: f.groupId, anchorNodeId: f.toy.id }).changes!,
    )
    const outcome = transformFurnitureGroup(nodes, { id: f.groupId, angleDegrees: 90 })
    const pivot = outcome.result.pivot as number[]
    expect(pivot[0]).toBeCloseTo(2.26)
    expect(pivot[1]).toBeCloseTo(2.08)
    const next = applySceneChanges(nodes, outcome.changes!)
    expect(next[f.toy.id]).toEqual(f.toy)
  })
})
