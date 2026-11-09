// SPDX-License-Identifier: Apache-2.0
// Adapted from Hanning-Liu/label-studio; see docs/third-party/label-studio.
import clipping from 'polygon-clipping'

export type ZonePoint = [number, number]
export type ZonePart = { polygon: ZonePoint[]; holes: ZonePoint[][] }
export type ZoneGeometry = { polygon: ZonePoint[]; holes?: ZonePoint[][]; parts?: ZonePart[] }

// Ported from Hanning's Label Studio occupancy geometry: assertRing, stable ringArea,
// topology checks and machine-precision fragment rejection. Coordinates here are metres,
// not image percentages. Do not quantise or discard real small components by area.
export function zoneRingArea(ring: ZonePoint[]) {
  const [x, y] = ring[0] ?? [0, 0]
  return (
    Math.abs(
      ring.reduce((s, p, i) => {
        const q = ring[(i + 1) % ring.length]!
        return s + (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y)
      }, 0),
    ) / 2
  )
}
const cross = (a: ZonePoint, b: ZonePoint, c: ZonePoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const onSegment = (a: ZonePoint, b: ZonePoint, p: ZonePoint) =>
  Math.abs(cross(a, b, p)) <= 1e-12 &&
  p[0] >= Math.min(a[0], b[0]) - 1e-12 &&
  p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
  p[1] >= Math.min(a[1], b[1]) - 1e-12 &&
  p[1] <= Math.max(a[1], b[1]) + 1e-12
function intersects(a: ZonePoint, b: ZonePoint, c: ZonePoint, d: ZonePoint) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  )
}
export function assertZoneRing(ring: ZonePoint[]) {
  if (ring.length < 3 || ring.some((p) => p.length !== 2 || !p.every(Number.isFinite)))
    throw Error('invalid_polygon')
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!,
      b = ring[(i + 1) % ring.length]!
    if (a[0] === b[0] && a[1] === b[1]) throw Error('invalid_polygon')
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue
      if (intersects(a, b, ring[j]!, ring[(j + 1) % ring.length]!)) throw Error('invalid_polygon')
    }
  }
  if (zoneRingArea(ring) === 0) throw Error('invalid_polygon')
}
function ringHas(ring: ZonePoint[], [x, y]: ZonePoint, boundary = true) {
  if (ring.some((p, i) => onSegment(p, ring[(i + 1) % ring.length]!, [x, y]))) return boundary
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside
  }
  return inside
}
function ringsCross(a: ZonePoint[], b: ZonePoint[]) {
  return a.some((p, i) =>
    b.some((q, j) => intersects(p, a[(i + 1) % a.length]!, q, b[(j + 1) % b.length]!)),
  )
}
export function zoneParts(zone: ZoneGeometry): ZonePart[] {
  return [{ polygon: zone.polygon, holes: zone.holes ?? [] }, ...(zone.parts ?? [])]
}
export function zoneGeometry(parts: ZonePart[]): ZoneGeometry {
  if (!parts.length) throw Error('empty_remainder')
  return { ...parts[0]!, parts: parts.slice(1) }
}
export function zoneArea(parts: ZonePart[]) {
  return parts.reduce(
    (s, p) => s + zoneRingArea(p.polygon) - p.holes.reduce((h, r) => h + zoneRingArea(r), 0),
    0,
  )
}
export function zoneContains(parts: ZonePart[], p: ZonePoint) {
  return parts.some(
    (part) => ringHas(part.polygon, p) && !part.holes.some((h) => ringHas(h, p, false)),
  )
}
const multi = (parts: ZonePart[]): clipping.MultiPolygon =>
  parts.map((p) => [p.polygon, ...p.holes])
// Reject only effectively collinear numerical output, as in Label Studio's isNumericalFragment.
function numericalFragment(p: ZonePoint[]) {
  const scale = p.reduce((s, [x, z]) => Math.max(s, Math.abs(x), Math.abs(z)), 1)
  const perimeter = p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length]!
    return s + Math.hypot(a[0] - b[0], a[1] - b[1])
  }, 0)
  return zoneRingArea(p) <= perimeter * (8 * Number.EPSILON * scale)
}
function fromMulti(input: clipping.MultiPolygon): ZonePart[] {
  const open = (r: clipping.Ring): ZonePoint[] => {
    const points = r.map((p) => [p[0], p[1]] as ZonePoint)
    if (
      points.length > 1 &&
      points[0]![0] === points.at(-1)![0] &&
      points[0]![1] === points.at(-1)![1]
    )
      points.pop()
    return points
  }
  return input
    .map(([outer, ...holes]) => ({ polygon: open(outer!), holes: holes.map(open) }))
    .filter((p) => !numericalFragment(p.polygon))
}
export function subtractZoneParts(subject: ZonePart[], cutters: ZonePart[]): ZonePart[] {
  return cutters.length
    ? fromMulti(clipping.difference(multi(subject), multi(cutters)))
    : structuredClone(subject)
}
export function zoneSymmetricDifferenceArea(a: ZonePart[], b: ZonePart[]) {
  return zoneArea(fromMulti(clipping.xor(multi(a), multi(b))))
}
export function validateZoneParts(parts: ZonePart[], room: ZoneGeometry) {
  if (!parts.length) throw Error('invalid_polygon')
  for (const part of parts) {
    assertZoneRing(part.polygon)
    for (const h of part.holes) {
      assertZoneRing(h)
      if (ringsCross(part.polygon, h) || !ringHas(part.polygon, h[0]!, false))
        throw Error('invalid_hole')
    }
    for (let i = 0; i < part.holes.length; i++)
      for (let j = i + 1; j < part.holes.length; j++) {
        const a = part.holes[i]!,
          b = part.holes[j]!
        if (ringsCross(a, b) || ringHas(a, b[0]!) || ringHas(b, a[0]!)) throw Error('invalid_hole')
      }
  }
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      if (fromMulti(clipping.intersection(multi([parts[i]!]), multi([parts[j]!]))).length)
        throw Error('overlapping_parts')
  // Compare actual set differences, not just vertices or bounding boxes (concave rooms).
  if (subtractZoneParts(parts, [{ polygon: room.polygon, holes: [] }]).length)
    throw Error('outside_room')
  if (subtractZoneParts(parts, [{ polygon: room.polygon, holes: room.holes ?? [] }]).length)
    throw Error('room_hole_overlap')
}
