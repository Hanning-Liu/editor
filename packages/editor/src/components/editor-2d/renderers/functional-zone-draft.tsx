'use client'
import {
  type AnyNodeId,
  useScene,
  type ZonePart,
  type ZonePoint,
  zoneParts,
} from '@pascal-app/core'
import { useEffect, useRef } from 'react'
import { clientToPlan } from '../../../lib/floorplan/plan-coords'
import { rectangleZoneRing, snapZonePoint, zonePath } from '../../../lib/functional-zone-drawing'
import useEditor, { isGridSnapActive, isMagneticSnapActive } from '../../../store/use-editor'
import {
  finishZoneRing,
  useFunctionalZoneDraft,
  zoneDraftError,
} from '../../../store/use-functional-zone-draft'
import { suppressBoxSelectForPointer } from '../../tools/select/box-select-state'
import { useFloorplanStaticUnitsPerPixel } from '../floorplan-render-context'

type Drag = {
  part: number
  ring: number
  index: number
  kind: 'vertex' | 'edge'
  start: ZonePoint
  geometry: ZonePart[]
  pointerId: number
}
export function FunctionalZoneDraft() {
  const state = useFunctionalZoneDraft(),
    draft = state.draft,
    nodes = useScene((s) => s.nodes),
    u = useFloorplanStaticUnitsPerPixel()
  const drag = useRef<Drag | null>(null),
    release = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!draft?.owner || !draft?.mode) release.current?.()
    return () => release.current?.()
  }, [draft?.owner, draft?.mode])
  if (!draft) return null
  const room = nodes[draft.roomId as AnyNodeId]
  if (room?.type !== 'zone') return null
  const rings = [
    room.polygon,
    ...(room.holes ?? []),
    ...Object.values(nodes).flatMap((n) =>
      n.type === 'functional-zone' && n.roomId === room.id && n.id !== draft.nodeId
        ? zoneParts(n).flatMap((p) => [p.polygon, ...p.holes])
        : [],
    ),
  ]
  const point = (e: { clientX: number; clientY: number; altKey?: boolean }): ZonePoint | null => {
    const raw = clientToPlan(e.clientX, e.clientY)
    if (!raw) return null
    if (e.altKey) return [raw[0], raw[1]]
    return snapZonePoint(
      [raw[0], raw[1]],
      rings,
      isGridSnapActive() ? useEditor.getState().gridSnapStep : 0,
      isGridSnapActive() || isMagneticSnapActive() ? 10 * u : 0,
    )
  }
  const own = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    suppressBoxSelectForPointer(e)
  }
  const rectangle = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0 || draft.mode !== 'rectangle') return
    own(e)
    release.current?.()
    const a = point(e)
    if (!a) return
    const id = e.pointerId,
      target = e.currentTarget
    target.setPointerCapture(id)
    state.setDraft({ points: [a], cursor: a })
    state.setError('')
    const move = (n: PointerEvent) => {
      if (n.pointerId === id) {
        const p = point(n)
        if (p) useFunctionalZoneDraft.getState().setDraft({ cursor: p })
      }
    }
    const end = (n: PointerEvent) => {
      if (n.pointerId !== id) return
      const b = point(n)
      clean()
      if (b) finishZoneRing(rectangleZoneRing(a, b))
    }
    const cancel = () => {
      clean()
      useFunctionalZoneDraft.getState().setDraft({ points: [], cursor: null })
    }
    const clean = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', cancel, true)
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id)
      release.current = null
    }
    release.current = clean
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
  }
  const addPoint = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0 || draft.mode !== 'polygon') return
    own(e)
    const p = point(e)
    if (!p) return
    if (
      draft.points.length >= 3 &&
      Math.hypot(p[0] - draft.points[0]![0], p[1] - draft.points[0]![1]) < 10 * u
    ) {
      finishZoneRing(draft.points)
      return
    }
    state.setDraft({ points: [...draft.points, p], cursor: p })
    state.setError('')
  }
  const reshape = (
    e: React.PointerEvent,
    part: number,
    ring: number,
    index: number,
    kind: 'edge' | 'vertex',
  ) => {
    if (e.button !== 0) return
    own(e)
    release.current?.()
    const start = point(e)
    if (!start) return
    drag.current = {
      part,
      ring,
      index,
      kind,
      start,
      geometry: structuredClone(draft.geometry),
      pointerId: e.pointerId,
    }
    const target = e.currentTarget as Element,
      id = e.pointerId
    target.setPointerCapture(id)
    const move = (n: PointerEvent) => {
      const d = drag.current
      if (!d || n.pointerId !== id) return
      const p = point(n)
      if (!p) return
      const next = structuredClone(d.geometry),
        part = next[d.part]!,
        r = d.ring === 0 ? part.polygon : part.holes[d.ring - 1]!
      if (d.kind === 'vertex') r[d.index] = p
      else
        for (const i of [d.index, (d.index + 1) % r.length]) {
          const old = r[i]!
          r[i] = [old[0] + p[0] - d.start[0], old[1] + p[1] - d.start[1]]
        }
      const error = zoneDraftError(next, draft.roomId)
      useFunctionalZoneDraft.getState().setError(error)
      if (!error) useFunctionalZoneDraft.getState().setDraft({ geometry: next })
    }
    const end = (n: PointerEvent) => {
      if (n.pointerId === id) clean()
    }
    const cancel = () => {
      const d = drag.current
      if (d) useFunctionalZoneDraft.getState().setDraft({ geometry: d.geometry })
      clean()
    }
    const clean = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', cancel, true)
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id)
      drag.current = null
      release.current = null
    }
    release.current = clean
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
  }
  const changeRing = (p: number, r: number, change: (ring: ZonePoint[]) => void) => {
    const next = structuredClone(draft.geometry),
      part = next[p]!
    change(r === 0 ? part.polygon : part.holes[r - 1]!)
    const error = zoneDraftError(next, draft.roomId)
    state.setError(error)
    if (!error) state.setDraft({ geometry: next })
  }
  const xs = room.polygon.map((p) => p[0]),
    zs = room.polygon.map((p) => p[1])
  const drawing = draft.mode === 'rectangle' || draft.mode === 'polygon'
  const pending =
    draft.mode === 'rectangle' && draft.points[0] && draft.cursor
      ? rectangleZoneRing(draft.points[0], draft.cursor)
      : [...draft.points, ...(draft.cursor ? [draft.cursor] : [])]
  return (
    <g
      data-functional-zone-draft
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <rect
        data-zone-drawing-surface
        x={Math.min(...xs) - 50}
        y={Math.min(...zs) - 50}
        width={Math.max(...xs) - Math.min(...xs) + 100}
        height={Math.max(...zs) - Math.min(...zs) + 100}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor: drawing ? 'crosshair' : 'default' }}
        onPointerDown={
          draft.mode === 'rectangle'
            ? rectangle
            : draft.mode === 'polygon'
              ? addPoint
              : (e) => e.stopPropagation()
        }
        onPointerMove={(e) => {
          if (drawing && !e.buttons) {
            const p = point(e)
            if (p) state.setDraft({ cursor: p })
          }
        }}
      />
      <path
        d={zonePath(draft.geometry)}
        fill="#8b5cf6"
        fillOpacity={0.2}
        fillRule="evenodd"
        stroke="#8b5cf6"
        strokeWidth={2 * u}
        pointerEvents="none"
      />
      {pending.length > 1 && (
        <path
          data-zone-drawing-pending
          d={
            'M' +
            pending.map((p) => p.join(',')).join('L') +
            (draft.mode === 'rectangle' ? 'Z' : '')
          }
          fill={draft.mode === 'rectangle' ? '#8b5cf6' : 'none'}
          fillOpacity={0.12}
          stroke="#8b5cf6"
          strokeWidth={2 * u}
          strokeDasharray={`${5 * u} ${3 * u}`}
          pointerEvents="none"
        />
      )}
      {draft.points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={4 * u} fill="#8b5cf6" pointerEvents="none" />
      ))}
      {!drawing &&
        draft.geometry.flatMap((p, pi) =>
          [p.polygon, ...p.holes].map((ring, ri) => (
            <g key={`${pi}-${ri}`} data-zone-part={pi} data-zone-ring={ri}>
              {ring.map((a, i) => {
                const b = ring[(i + 1) % ring.length]!
                return (
                  <g key={i}>
                    <line
                      data-zone-edge={i}
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      stroke={ri ? '#f59e0b' : '#8b5cf6'}
                      strokeWidth={7 * u}
                      strokeOpacity={0.28}
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => reshape(e, pi, ri, i, 'edge')}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        changeRing(pi, ri, (r) =>
                          r.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]),
                        )
                      }}
                    />
                    <circle
                      data-zone-vertex={i}
                      cx={a[0]}
                      cy={a[1]}
                      r={5 * u}
                      fill="white"
                      stroke={ri ? '#f59e0b' : '#8b5cf6'}
                      strokeWidth={1.5 * u}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => reshape(e, pi, ri, i, 'vertex')}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (ring.length > 3) changeRing(pi, ri, (r) => r.splice(i, 1))
                      }}
                    />
                  </g>
                )
              })}
            </g>
          )),
        )}
    </g>
  )
}
