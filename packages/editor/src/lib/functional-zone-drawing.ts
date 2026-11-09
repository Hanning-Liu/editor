import type { ZonePart, ZonePoint } from '@pascal-app/core'
/** Label Studio's screen-distance parent-boundary snap policy, in level metres. */
export function snapZonePoint(
  raw: ZonePoint,
  rings: ZonePoint[][],
  step: number,
  tolerance: number,
): ZonePoint {
  let vertex: ZonePoint | undefined,
    vd = Infinity
  for (const ring of rings)
    for (const p of ring) {
      const d = Math.hypot(p[0] - raw[0], p[1] - raw[1])
      if (d < vd) {
        vd = d
        vertex = p
      }
    }
  if (vertex && vd <= tolerance) return [...vertex]
  let edge: ZonePoint | undefined,
    ed = Infinity
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!,
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        l = dx * dx + dz * dz
      if (!l) continue
      const t = Math.max(0, Math.min(1, ((raw[0] - a[0]) * dx + (raw[1] - a[1]) * dz) / l)),
        p: ZonePoint = [a[0] + t * dx, a[1] + t * dz],
        d = Math.hypot(p[0] - raw[0], p[1] - raw[1])
      if (d < ed) {
        ed = d
        edge = p
      }
    }
  if (edge && ed <= tolerance) return edge
  return step > 0 ? [Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step] : raw
}
export function rectangleZoneRing(a: ZonePoint, b: ZonePoint): ZonePoint[] {
  return [
    [a[0], a[1]],
    [b[0], a[1]],
    [b[0], b[1]],
    [a[0], b[1]],
  ]
}
export function zonePath(parts: ZonePart[]) {
  return parts
    .flatMap((p) => [p.polygon, ...p.holes])
    .map((r) => (r.length ? 'M' + r.map((p) => p.join(',')).join('L') + 'Z' : ''))
    .join(' ')
}
