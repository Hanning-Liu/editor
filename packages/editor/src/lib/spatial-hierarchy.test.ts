import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  FunctionalZoneNode,
  FurnitureGroupNode,
  ItemNode,
  LevelNode,
  ZoneNode,
} from '@pascal-app/core'
import {
  selectedFurnitureGroup,
  spatialDropChanges,
  spatialRoots,
  spatialRotationPivot,
} from './spatial-hierarchy'

function fixture() {
  const level = LevelNode.parse({ id: 'level_test' }),
    room = ZoneNode.parse({
      id: 'zone_room',
      name: 'Room',
      parentId: level.id,
      spaceRole: 'room',
      polygon: [
        [0, 0],
        [8, 0],
        [8, 6],
        [0, 6],
      ],
    })
  const asset = {
    id: 'test',
    category: 'furniture',
    name: 'Test',
    src: 'https://example.com/test.glb',
    thumbnail: '',
    dimensions: [1, 1, 1],
  }
  const table = ItemNode.parse({
    id: 'item_table',
    parentId: level.id,
    position: [2, 0, 2],
    scale: [1.4, 1, 0.9],
    children: ['item_toy'],
    asset,
  })
  const toy = ItemNode.parse({ id: 'item_toy', parentId: table.id, position: [0.1, 1, 0.1], asset })
  const chair = ItemNode.parse({ id: 'item_chair', parentId: level.id, position: [4, 0, 2], asset })
  const a = FunctionalZoneNode.parse({
      id: 'functional-zone_a',
      roomId: room.id,
      parentId: level.id,
      name: 'A',
      polygon: room.polygon,
    }),
    b = FunctionalZoneNode.parse({ ...a, id: 'functional-zone_b', name: 'B' })
  const g = FurnitureGroupNode.parse({
    id: 'furniture-group_g',
    parentId: level.id,
    functionalZoneId: a.id,
    name: 'G',
    memberIds: [table.id, toy.id],
    anchorNodeId: toy.id,
    memberRoles: { [toy.id]: 'display' },
  })
  const h = FurnitureGroupNode.parse({
    ...g,
    id: 'furniture-group_h',
    name: 'H',
    memberIds: [chair.id],
    anchorNodeId: chair.id,
    memberRoles: {},
  })
  const nodes: Record<string, AnyNode> = Object.fromEntries(
    [level, room, table, toy, chair, a, b, g, h].map((n) => [n.id, n]),
  )
  return { nodes, room, table, toy, chair, a, b, g, h }
}
describe('semantic hierarchy interactions', () => {
  test('canvas pivot honors a scaled hosted anchor without writing furniture', () => {
    const { nodes, g, table, toy } = fixture()
    const before = structuredClone(nodes)
    const p = spatialRotationPivot(nodes, [table.id])
    expect(p?.[0]).toBeCloseTo(table.position[0] + table.scale[0] * toy.position[0])
    expect(p?.[1]).toBeCloseTo(table.position[2] + table.scale[2] * toy.position[2])
    expect(nodes).toEqual(before)
  })

  test('roots exclude hosted members; single-root groups remain identifiable', () => {
    const { nodes, g, table, toy } = fixture()
    expect(spatialRoots(nodes, g.memberIds)).toEqual([table.id])
    expect(selectedFurnitureGroup(nodes, [table.id])?.id).toBe(g.id)
    expect(selectedFurnitureGroup(nodes, [toy.id])).toBeUndefined()
  })
  test('group reassignment writes only semantic metadata', () => {
    const { nodes, g, b } = fixture(),
      before = structuredClone(nodes)
    const c = spatialDropChanges(nodes, { kind: 'group', id: g.id }, b.id)
    expect(c.update?.map((p) => p.id)).toEqual([g.id])
    expect(c.update?.[0]?.data).toMatchObject({ functionalZoneId: b.id })
    expect(nodes).toEqual(before)
  })
  test('moving a hosted child transfers the support family and removes an empty source group', () => {
    const { nodes, g, h, toy, table } = fixture(),
      before = structuredClone(nodes)
    const c = spatialDropChanges(nodes, { kind: 'items', ids: [toy.id] }, h.id)
    expect(c.delete).toEqual([g.id])
    expect(c.update?.find((p) => p.id === h.id)?.data).toMatchObject({
      memberIds: [...h.memberIds, table.id, toy.id],
    })
    expect(nodes).toEqual(before)
    expect(c.update?.every((p) => p.data.type === 'furniture-group')).toBe(true)
  })
  test('partial transfer clears invalid anchor and roles in the source', () => {
    const { nodes, g, h, chair, toy, table } = fixture()
    const spare = ItemNode.parse({ ...chair, id: 'item_spare' })
    nodes[spare.id] = spare
    nodes[g.id] = { ...g, memberIds: [table.id, toy.id, spare.id] }
    const c = spatialDropChanges(nodes, { kind: 'items', ids: [table.id] }, h.id)
    expect(c.update?.find((p) => p.id === g.id)?.data).toMatchObject({
      memberIds: [spare.id],
      memberRoles: {},
    })
    expect(
      (c.update?.find((p) => p.id === g.id)?.data as { anchorNodeId?: string })?.anchorNodeId,
    ).toBeUndefined()
    expect(c.delete).toEqual([])
  })
  test('invalid kinds and cross-level drops fail before writes', () => {
    const { nodes, g, h, room, b } = fixture()
    expect(() => spatialDropChanges(nodes, { kind: 'items', ids: [room.id] }, h.id)).toThrow()
    expect(() => spatialDropChanges(nodes, { kind: 'group', id: g.id }, h.id)).toThrow()
    nodes[b.id] = { ...b, parentId: 'level_other' }
    const r = nodes[room.id]
    if (r?.type === 'zone') nodes[room.id] = { ...r, parentId: 'level_other' }
    expect(() => spatialDropChanges(nodes, { kind: 'group', id: g.id }, b.id)).toThrow()
  })
})
