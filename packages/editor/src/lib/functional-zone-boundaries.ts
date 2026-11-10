import type { ZonePart, ZonePoint } from '@pascal-app/core'

export type ZoneBoundarySource = { id: string; parts: ZonePart[]; elevation?: number }
export type ZoneBoundary = {
  key: string
  a: ZonePoint
  b: ZonePoint
  owners: string[]
  elevation: number
}
const EPS = 1e-8
export const ZONE_DASH = 0.1
export const ZONE_GAP = 0.06
const comparePoint = (a: ZonePoint, b: ZonePoint) => a[0] - b[0] || a[1] - b[1]
const pointKey = (p: ZonePoint) => p.map((v) => Math.round(v / EPS)).join(',')

/** Visual topology only: split collinear overlaps before deduplicating; never patch scene polygons. */
export function functionalZoneBoundaries(zones: ZoneBoundarySource[]): ZoneBoundary[] {
  const edges = zones.flatMap((zone) =>
    zone.parts.flatMap((part) =>
      [part.polygon, ...part.holes].flatMap((ring) =>
        ring.map((a, i) => ({
          a,
          b: ring[(i + 1) % ring.length]!,
          id: zone.id,
          elevation: zone.elevation ?? 0,
        })),
      ),
    ),
  )
  const output = new Map<string, ZoneBoundary>()
  for (const edge of edges) {
    const [a, b] = comparePoint(edge.a, edge.b) <= 0 ? [edge.a, edge.b] : [edge.b, edge.a]
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz)
    if (length <= EPS) continue
    const cuts = [0, 1]
    for (const other of edges) {
      if (Math.abs(other.elevation - edge.elevation) > EPS) continue
      for (const p of [other.a, other.b]) {
        if (Math.abs(dx * (p[1] - a[1]) - dz * (p[0] - a[0])) / length > EPS) continue
        const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (length * length)
        if (t > EPS / length && t < 1 - EPS / length) cuts.push(t)
      }
    }
    cuts.sort((x, y) => x - y)
    for (let i = 1; i < cuts.length; i++) {
      const from = cuts[i - 1]!,
        to = cuts[i]!
      if ((to - from) * length <= EPS) continue
      const p: ZonePoint = [a[0] + from * dx, a[1] + from * dz],
        q: ZonePoint = [a[0] + to * dx, a[1] + to * dz]
      const key = `${Math.round(edge.elevation / EPS)}:${pointKey(p)}:${pointKey(q)}`
      const current = output.get(key)
      if (current) {
        if (!current.owners.includes(edge.id)) current.owners.push(edge.id)
      } else output.set(key, { key, a: p, b: q, owners: [edge.id], elevation: edge.elevation })
    }
  }
  return [...output.values()]
    .map((b) => ({ ...b, owners: b.owners.sort() }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** World-anchored dash phase is identical in SVG and WebGPU, even across split edges. */
export function boundaryDashPhase(boundary: Pick<ZoneBoundary, 'a' | 'b'>) {
  const { a, b } = boundary,
    length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const period = ZONE_DASH + ZONE_GAP
  return ((((a[0] * (b[0] - a[0]) + a[1] * (b[1] - a[1])) / length) % period) + period) % period
}
export function boundaryDashes(boundary: Pick<ZoneBoundary, 'a' | 'b'>): [ZonePoint, ZonePoint][] {
  const { a, b } = boundary,
    dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz)
  if (length <= EPS) return []
  const period = ZONE_DASH + ZONE_GAP,
    phase = boundaryDashPhase(boundary),
    result: [ZonePoint, ZonePoint][] = []
  for (let start = -phase; start < length; start += period) {
    const from = Math.max(0, start),
      to = Math.min(length, start + ZONE_DASH)
    if (to - from <= EPS) continue
    result.push([
      [a[0] + (dx * from) / length, a[1] + (dz * from) / length],
      [a[0] + (dx * to) / length, a[1] + (dz * to) / length],
    ])
  }
  return result
}
export function boundaryOwner(
  owners: readonly string[],
  selected: readonly string[],
  hovered: string | null,
) {
  return (
    owners.find((id) => selected.includes(id)) ?? owners.find((id) => id === hovered) ?? owners[0]
  )
}

const ALTERNATE_COLORS = [
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#6366f1',
  '#e11d48',
  '#14b8a6',
]
export function functionalZoneColors(zones: { id: string; color: string }[]) {
  const used = new Set<string>(),
    colors: Record<string, string> = {}
  for (const zone of [...zones].sort((a, b) => a.id.localeCompare(b.id))) {
    let color = zone.color
    if (used.has(color.toLowerCase()))
      color =
        ALTERNATE_COLORS.find((c) => !used.has(c)) ??
        `hsl(${(Object.keys(colors).length * 137.508) % 360}, 75%, 48%)`
    used.add(color.toLowerCase())
    colors[zone.id] = color
  }
  return colors
}
