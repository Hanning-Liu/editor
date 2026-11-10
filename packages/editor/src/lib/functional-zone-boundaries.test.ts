import { expect, test } from 'bun:test'
import type { ZonePart, ZonePoint } from '@pascal-app/core'
import { Color } from 'three'
import {
  boundaryDashes,
  boundaryOwner,
  functionalZoneBoundaries,
  functionalZoneColors,
} from './functional-zone-boundaries'

const rect = (x: number, z: number, w: number, d: number): ZonePoint[] => [
  [x, z],
  [x + w, z],
  [x + w, z + d],
  [x, z + d],
]
const source = (
  id: string,
  polygon: ZonePoint[],
  holes: ZonePoint[][] = [],
): { id: string; parts: ZonePart[] } => ({ id, parts: [{ polygon, holes }] })
const length = (edges: ReturnType<typeof functionalZoneBoundaries>) =>
  edges.reduce((s, e) => s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0)
test('reversed, rotated ring starts and extra collinear vertices share one boundary', () => {
  const a = source('a', rect(0, 0, 2, 2)),
    b = source('b', [
      [2, 2],
      [2, 0],
      [1, 0],
      [0, 0],
      [0, 2],
    ])
  const before = structuredClone([a, b]),
    edges = functionalZoneBoundaries([a, b])
  expect(length(edges)).toBe(8)
  expect(edges.every((e) => e.owners.join(',') === 'a,b')).toBe(true)
  expect([a, b]).toEqual(before)
  expect(functionalZoneBoundaries([b, a])).toEqual(edges)
})
test('partial adjacency splits and deduplicates only the common interval', () => {
  const edges = functionalZoneBoundaries([
    source('a', rect(0, 0, 4, 4)),
    source('b', rect(4, 1, 2, 2)),
  ])
  expect(length(edges)).toBe(22)
  const shared = edges.filter((e) => e.owners.length === 2)
  expect(shared).toHaveLength(1)
  expect(shared[0]?.a).toEqual([4, 1])
  expect(shared[0]?.b).toEqual([4, 3])
})
test('screenshot regression: multipart outer rim and complement hole draw once', () => {
  const outer = rect(0, 0, 8, 6),
    part = rect(5, 0.5, 2, 2),
    main = rect(0.5, 0.5, 3, 4),
    hole = rect(1, 1, 1, 1)
  const a = {
      id: 'a',
      parts: [
        { polygon: main, holes: [hole] },
        { polygon: part, holes: [] },
      ],
    },
    b = {
      id: 'b',
      parts: [
        { polygon: outer, holes: [[...main].reverse(), [...part].reverse()] },
        { polygon: hole, holes: [] },
      ],
    }
  const edges = functionalZoneBoundaries([a, b])
  expect(edges).toHaveLength(16)
  expect(edges.filter((e) => e.owners.length === 2)).toHaveLength(12)
  expect(length(edges)).toBe(54)
})
test('elevated regions do not share a 3D boundary; nearby parallel edges stay separate', () => {
  const a = source('a', rect(0, 0, 2, 2))
  expect(functionalZoneBoundaries([a, { ...a, id: 'b', elevation: 0.4 }])).toHaveLength(8)
  expect(
    functionalZoneBoundaries([a, source('b', rect(0, 0.001, 2, 2))]).some(
      (e) => e.owners.length === 2,
    ),
  ).toBe(true)
  const horizontal = functionalZoneBoundaries([a, source('b', rect(0, 0.001, 2, 2))]).filter(
    (e) => e.a[1] === e.b[1],
  )
  expect(horizontal.every((e) => e.owners.length === 1)).toBe(true)
})
test('dashes retain gaps and phase when a collinear edge is split', () => {
  const full = boundaryDashes({ a: [0.03, 0], b: [1.03, 0] }),
    split = [
      ...boundaryDashes({ a: [0.03, 0], b: [0.51, 0] }),
      ...boundaryDashes({ a: [0.51, 0], b: [1.03, 0] }),
    ]
  const coverage = (d: [ZonePoint, ZonePoint][], x: number) =>
    d.some(([a, b]) => x >= a[0] - 1e-9 && x <= b[0] + 1e-9)
  for (let x = 0.031; x < 1.03; x += 0.007) expect(coverage(full, x)).toBe(coverage(split, x))
  expect(full.length).toBeGreaterThan(4)
  expect(full.reduce((s, [a, b]) => s + b[0] - a[0], 0)).toBeLessThan(0.8)
})
test('ownership emphasis and distinct presentation colors leave stored preferences intact', () => {
  expect(boundaryOwner(['a', 'b'], ['b'], 'a')).toBe('b')
  expect(boundaryOwner(['a', 'b'], [], 'b')).toBe('b')
  const zones = [
      { id: 'b', color: '#a78bfa' },
      { id: 'a', color: '#a78bfa' },
    ],
    before = structuredClone(zones),
    colors = functionalZoneColors(zones)
  expect(colors.a).not.toBe(colors.b)
  expect(functionalZoneColors([...zones].reverse())).toEqual(colors)
  expect(zones).toEqual(before)
})

test('more than eight same-color zones produce distinct colors usable in both renderers', () => {
  const zones = Array.from({ length: 12 }, (_, i) => ({
    id: `zone-${String(i).padStart(2, '0')}`,
    color: '#a78bfa',
  }))
  const colors = functionalZoneColors(zones)
  expect(new Set(Object.values(colors).map((c) => new Color(c).getHexString())).size).toBe(12)
})
