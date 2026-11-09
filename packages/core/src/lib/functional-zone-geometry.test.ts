import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { applySceneChanges } from '../agent-operations/apply-changes'
import {
  editFunctionalZone,
  getFunctionalZoneRemainder,
} from '../agent-operations/spatial-hierarchy'
import { type AnyNode, BuildingNode, FunctionalZoneNode, LevelNode, ZoneNode } from '../schema'
import {
  subtractZoneParts,
  validateZoneParts,
  type ZonePart,
  type ZonePoint,
  zoneArea,
  zoneContains,
  zoneParts,
  zoneSymmetricDifferenceArea,
} from './functional-zone-geometry'

const cases = JSON.parse(
  readFileSync(new URL('./__fixtures__/label-studio-zone-cases.json', import.meta.url), 'utf8'),
) as {
  name: string
  parent: ZonePoint[][]
  obstacles: ZonePoint[][][]
  expected: ZonePoint[][][]
  expectedArea: number
}[]
const scaled = (polygon: ZonePoint[][]): ZonePart => ({
  polygon: polygon[0]!.map(([x, z]) => [x / 10, z / 10]),
  holes: polygon.slice(1).map((r) => r.map(([x, z]) => [x / 10, z / 10])),
})
describe('Label Studio geometry cases ported to level metres', () => {
  for (const c of cases)
    test(c.name, () => {
      const subject = [scaled(c.parent)],
        out = subtractZoneParts(subject, c.obstacles.map(scaled)),
        expected = c.expected.map(scaled)
      expect(zoneArea(out)).toBeCloseTo(c.expectedArea / 100, 10)
      expect(zoneSymmetricDifferenceArea(out, expected)).toBeLessThan(1e-12)
      validateZoneParts(out, { ...subject[0]! })
      if (c.name === 'multiple-remainders') expect(out.length).toBe(2)
      if (c.name === 'island-hole') expect(out[0]!.holes.length).toBe(1)
      if (c.name === 'narrow-remainder') expect(zoneArea(out)).toBeGreaterThan(0)
    })
  test('parts and holes keep actual containment', () => {
    const p = scaled([
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      [
        [30, 30],
        [70, 30],
        [70, 70],
        [30, 70],
      ],
    ])
    expect(zoneContains([p], [5, 5])).toBe(false)
    expect(zoneContains([p], [1, 1])).toBe(true)
    expect(
      zoneContains(
        [
          p,
          {
            polygon: [
              [12, 0],
              [14, 0],
              [14, 2],
              [12, 2],
            ],
            holes: [],
          },
        ],
        [13, 1],
      ),
    ).toBe(true)
  })
  test('rejects invalid topology, overlapping parts and concave escape', () => {
    const room = {
      polygon: [
        [0, 0],
        [10, 0],
        [10, 10],
        [6, 10],
        [6, 6],
        [0, 6],
      ] as ZonePoint[],
    }
    const box = (a: ZonePoint[]): ZonePart => ({ polygon: a, holes: [] })
    expect(() =>
      validateZoneParts(
        [
          box([
            [1, 1],
            [4, 4],
            [1, 4],
            [4, 1],
          ]),
        ],
        room,
      ),
    ).toThrow()
    expect(() =>
      validateZoneParts(
        [
          {
            polygon: [
              [0, 0],
              [5, 0],
              [5, 5],
              [0, 5],
            ],
            holes: [
              [
                [4, 4],
                [6, 4],
                [6, 6],
                [4, 6],
              ],
            ],
          },
        ],
        room,
      ),
    ).toThrow()
    expect(() =>
      validateZoneParts(
        [
          box([
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ]),
          box([
            [2, 2],
            [5, 2],
            [5, 5],
            [2, 5],
          ]),
        ],
        room,
      ),
    ).toThrow()
    expect(() =>
      validateZoneParts(
        [
          box([
            [1, 5],
            [8, 5],
            [8, 9],
            [1, 9],
          ]),
        ],
        room,
      ),
    ).toThrow()
  })
  test('legacy single-ring nodes parse with empty holes and additional parts', () => {
    const n = FunctionalZoneNode.parse({
      name: 'Legacy',
      roomId: 'zone_room',
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
      ],
    })
    expect(n.holes).toEqual([])
    expect(n.parts).toEqual([])
    expect(zoneParts(n).length).toBe(1)
  })
  test('remaining preview and commit exclude self and never touch furniture', () => {
    const building = BuildingNode.parse({ id: 'building_test' }),
      level = LevelNode.parse({ id: 'level_test', parentId: building.id }),
      room = ZoneNode.parse({
        id: 'zone_room',
        name: 'Room',
        spaceRole: 'room',
        parentId: level.id,
        polygon: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      })
    let nodes: Record<string, AnyNode> = Object.fromEntries(
      [building, level, room].map((n) => [n.id, n]),
    )
    let out = editFunctionalZone(nodes, {
      roomId: room.id,
      name: 'Stripe',
      polygon: [
        [4, 0],
        [6, 0],
        [6, 10],
        [4, 10],
      ],
    })
    nodes = applySceneChanges(nodes, out.changes!)
    const before = structuredClone(nodes),
      preview = getFunctionalZoneRemainder(nodes, { roomId: room.id })
    expect(preview.result.partCount).toBe(2)
    expect(nodes).toEqual(before)
    out = editFunctionalZone(nodes, { roomId: room.id, name: 'Remaining', fillRemaining: true })
    nodes = applySceneChanges(nodes, out.changes!)
    const id = (out.result.functionalZone as { id: string }).id
    expect(zoneParts(nodes[id] as ReturnType<typeof FunctionalZoneNode.parse>).length).toBe(2)
    expect(getFunctionalZoneRemainder(nodes, { roomId: room.id }).result.empty).toBe(true)
    expect(
      getFunctionalZoneRemainder(nodes, { roomId: room.id, excludeId: id }).result.areaM2,
    ).toBeCloseTo(80)
    expect(() =>
      editFunctionalZone(nodes, { roomId: room.id, name: 'Empty', fillRemaining: true }),
    ).toThrow()
  })
})
test('room voids stay empty in remainder and nested islands retain one logical identity', () => {
  const room = {
    polygon: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as ZonePoint[],
    holes: [
      [
        [3, 3],
        [5, 3],
        [5, 5],
        [3, 5],
      ] as ZonePoint[],
    ],
  }
  const out = subtractZoneParts([{ polygon: room.polygon, holes: room.holes }], [])
  validateZoneParts(out, room)
  expect(zoneArea(out)).toBe(96)
  expect(zoneContains(out, [4, 4])).toBe(false)
  expect(() => validateZoneParts([{ polygon: room.polygon, holes: [] }], room)).toThrow(
    'room_hole_overlap',
  )
  const island: ZonePart = {
    polygon: [
      [1, 1],
      [9, 1],
      [9, 9],
      [1, 9],
    ],
    holes: [
      [
        [2, 2],
        [8, 2],
        [8, 8],
        [2, 8],
      ],
    ],
  }
  const remainder = subtractZoneParts([{ polygon: room.polygon, holes: [] }], [island])
  expect(remainder.length).toBe(2)
  expect(zoneArea(remainder)).toBe(72)
  expect(zoneContains(remainder, [4, 4])).toBe(true)
})
