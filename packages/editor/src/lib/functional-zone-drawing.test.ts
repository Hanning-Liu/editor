import { expect, test } from 'bun:test'
import { rectangleZoneRing, snapZonePoint, zonePath } from './functional-zone-drawing'

test('boundary snap uses actual parent coordinates and screen-scaled distance before grid', () => {
  const ring: [[number, number], [number, number], [number, number], [number, number]] = [
    [0.123, 0.456],
    [4.789, 0.456],
    [4.789, 3.456],
    [0.123, 3.456],
  ]
  expect(snapZonePoint([0.13, 0.46], [ring], 0.1, 0.2)).toEqual(ring[0])
  expect(snapZonePoint([2, 0.48], [ring], 0.1, 0.1)).toEqual([2, 0.456])
  expect(snapZonePoint([2, 1.234], [ring], 0.1, 0.01)[1]).toBeCloseTo(1.2)
  expect(snapZonePoint([2, 1.234], [ring], 0, 0)).toEqual([2, 1.234])
})
test('rectangle drafting and even-odd paths keep parts and holes separate', () => {
  const polygon = rectangleZoneRing([1, 1], [4, 5])
  expect(polygon).toEqual([
    [1, 1],
    [4, 1],
    [4, 5],
    [1, 5],
  ])
  const path = zonePath([
    { polygon, holes: [rectangleZoneRing([2, 2], [3, 3])] },
    { polygon: rectangleZoneRing([6, 1], [7, 2]), holes: [] },
  ])
  expect(path.match(/M/g)?.length).toBe(3)
  expect(path.match(/Z/g)?.length).toBe(3)
})
