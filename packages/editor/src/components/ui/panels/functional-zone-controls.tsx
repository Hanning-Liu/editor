'use client'
import {
  type ZonePart,
  usePascalI18n,
  useScene,
  getFunctionalZoneRemainder,
  zoneArea,
  FunctionalZonePart,
  type AnyNodeId,
} from '@pascal-app/core'
import { useEffect, useId, useState } from 'react'
import {
  useFunctionalZoneDraft,
  startZoneDraft,
  cancelZoneDraft,
  applyZoneDraft,
  finishZoneRing,
  zoneDraftError,
  type ZoneDraftMode,
  type ZoneDraftOperation,
} from '../../../store/use-functional-zone-draft'
import { isTypingTarget } from '../../../lib/typing-target'
const button =
  'rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40'
export function FunctionalZoneControls({
  roomId,
  nodeId,
  geometry,
  onApply,
}: {
  roomId: string
  nodeId?: string
  geometry: ZonePart[]
  onApply: (parts: ZonePart[]) => boolean
}) {
  const i18n = usePascalI18n(),
    owner = useId(),
    state = useFunctionalZoneDraft(),
    draft = state.draft?.owner === owner ? state.draft : null
  const [partIndex, setPartIndex] = useState(0),
    [holeIndex, setHoleIndex] = useState(0),
    [text, setText] = useState(''),
    [error, setError] = useState('')
  useEffect(
    () => () => {
      if (useFunctionalZoneDraft.getState().draft?.owner === owner)
        cancelZoneDraft()
    },
    [owner],
  )
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const d = useFunctionalZoneDraft.getState().draft
      if (d?.owner !== owner || isTypingTarget(e.target)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        cancelZoneDraft()
      } else if (e.key === 'Enter' && d.mode === 'polygon') {
        e.preventDefault()
        e.stopImmediatePropagation()
        finishZoneRing(d.points)
      } else if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        d.mode === 'polygon'
      ) {
        e.preventDefault()
        e.stopImmediatePropagation()
        useFunctionalZoneDraft
          .getState()
          .setDraft({ points: d.points.slice(0, -1) })
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [owner])
  const begin = (
    mode: ZoneDraftMode,
    operation: ZoneDraftOperation = 'replace',
    parts?: ZonePart[],
  ) => {
    const current = draft?.geometry ?? geometry
    startZoneDraft({
      owner,
      roomId,
      nodeId,
      mode,
      operation,
      geometry:
        parts ?? (operation === 'replace' && mode !== 'edit' ? [] : current),
      partIndex: Math.min(partIndex, Math.max(0, current.length - 1)),
      onApply,
    })
    setError('')
  }
  const reasonText = (reason: string) => {
    switch (reason) {
      case 'outside_room':
        return i18n._({
          id: 'editor.zoneDrawing.outside',
          message: 'The outline crosses the room boundary',
        })
      case 'room_hole_overlap':
        return i18n._({
          id: 'editor.zoneDrawing.roomVoid',
          message: 'The outline covers a room opening',
        })
      case 'invalid_hole':
        return i18n._({
          id: 'editor.zoneDrawing.holeInvalid',
          message:
            'Holes must be inside their part and must not touch or overlap other boundaries',
        })
      case 'overlapping_parts':
        return i18n._({
          id: 'editor.zoneDrawing.overlap',
          message: 'Parts of the same zone must not overlap',
        })
      case 'stale_preview':
        return i18n._({
          id: 'editor.zoneDrawing.stale',
          message: 'The scene changed after this preview',
        })
      default:
        return i18n._({
          id: 'editor.zoneDrawing.invalid',
          message:
            'Use at least three distinct vertices with no crossing edges',
        })
    }
  }
  const parts = draft?.geometry ?? geometry
  const updateGeometry = (geometry: ZonePart[]) => {
    const reason = zoneDraftError(geometry, roomId)
    state.setError(reason)
    if (!reason) state.setDraft({ geometry, mode: 'edit', points: [] })
  }
  const remaining = () => {
    try {
      const result = getFunctionalZoneRemainder(useScene.getState().nodes, {
        roomId,
        excludeId: nodeId,
      }).result
      if (result.empty) {
        setError(
          i18n._({
            id: 'editor.zoneDrawing.covered',
            message: 'This room is already fully covered.',
          }),
        )
        return
      }
      begin('preview', 'replace', result.parts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div
      data-zone-drawing-controls
      className="space-y-2 rounded border border-border p-2"
    >
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={button}
          onClick={() => begin('rectangle')}
        >
          {i18n._({
            id: 'editor.zoneDrawing.rectangle',
            message: 'Draw rectangle',
          })}
        </button>
        <button
          type="button"
          className={button}
          onClick={() => begin('polygon')}
        >
          {i18n._({
            id: 'editor.zoneDrawing.polygon',
            message: 'Draw polygon',
          })}
        </button>
        <button
          type="button"
          className={button}
          disabled={!parts.length}
          onClick={() => begin('edit')}
        >
          {i18n._({ id: 'editor.zoneDrawing.edit', message: 'Edit boundary' })}
        </button>
        <button type="button" className={button} onClick={remaining}>
          {i18n._({
            id: 'editor.zoneDrawing.remaining',
            message: 'Fill remaining area',
          })}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {i18n._({
          id: 'editor.zoneDrawing.summary',
          message: '{parts} parts · {holes} holes · {area} m²',
          values: {
            parts: parts.length,
            holes: parts.reduce((n, p) => n + p.holes.length, 0),
            area: zoneArea(parts).toFixed(3),
          },
        })}
      </p>
      {draft && (
        <>
          <p role="status" className="text-xs">
            {draft.mode === 'rectangle'
              ? i18n._({
                  id: 'editor.zoneDrawing.drag',
                  message: 'Drag in the 2D view to draw a rectangle.',
                })
              : draft.mode === 'polygon'
                ? i18n._({
                    id: 'editor.zoneDrawing.points',
                    message:
                      'Click vertices; click the first point or press Enter to close. Backspace removes a point.',
                  })
                : i18n._({
                    id: 'editor.zoneDrawing.handles',
                    message:
                      'Drag vertices or edges. Double-click an edge to add a vertex; right-click a vertex to remove it.',
                  })}
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={button}
              disabled={!parts.length}
              onClick={() => begin('polygon', 'add-part')}
            >
              {i18n._({
                id: 'editor.zoneDrawing.addPart',
                message: 'Add part',
              })}
            </button>
            <button
              type="button"
              className={button}
              disabled={!parts.length}
              onClick={() => begin('polygon', 'add-hole')}
            >
              {i18n._({
                id: 'editor.zoneDrawing.addHole',
                message: 'Add hole',
              })}
            </button>
            {parts.length > 1 && (
              <select
                className="min-w-0 rounded border border-border bg-background text-xs"
                aria-label={i18n._({
                  id: 'editor.zoneDrawing.activePart',
                  message: 'Active part',
                })}
                value={Math.min(partIndex, parts.length - 1)}
                onChange={(e) => setPartIndex(Number(e.target.value))}
              >
                {parts.map((_, i) => (
                  <option key={i} value={i}>
                    {i18n._({
                      id: 'editor.zoneDrawing.part',
                      message: 'Part {index}',
                      values: { index: i + 1 },
                    })}
                  </option>
                ))}
              </select>
            )}
            {parts.length > 1 && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  const next = parts.filter(
                    (_, i) => i !== Math.min(partIndex, parts.length - 1),
                  )
                  updateGeometry(next)
                  setPartIndex(0)
                  setHoleIndex(0)
                }}
              >
                {i18n._({
                  id: 'editor.zoneDrawing.removePart',
                  message: 'Remove part',
                })}
              </button>
            )}
            {(parts[Math.min(partIndex, parts.length - 1)]?.holes.length ?? 0) >
              0 && (
              <>
                <select
                  aria-label={i18n._({
                    id: 'editor.zoneDrawing.activeHole',
                    message: 'Active hole',
                  })}
                  className="rounded border border-border bg-background text-xs"
                  value={Math.min(
                    holeIndex,
                    parts[Math.min(partIndex, parts.length - 1)]!.holes.length -
                      1,
                  )}
                  onChange={(e) => setHoleIndex(Number(e.target.value))}
                >
                  {parts[Math.min(partIndex, parts.length - 1)]!.holes.map(
                    (_, i) => (
                      <option key={i} value={i}>
                        {i18n._({
                          id: 'editor.zoneDrawing.hole',
                          message: 'Hole {index}',
                          values: { index: i + 1 },
                        })}
                      </option>
                    ),
                  )}
                </select>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    const next = structuredClone(parts),
                      p = next[Math.min(partIndex, parts.length - 1)]!
                    p.holes.splice(Math.min(holeIndex, p.holes.length - 1), 1)
                    updateGeometry(next)
                    setHoleIndex(0)
                  }}
                >
                  {i18n._({
                    id: 'editor.zoneDrawing.removeHole',
                    message: 'Remove hole',
                  })}
                </button>
              </>
            )}
            <button
              type="button"
              className={button}
              disabled={!parts.length || draft.points.length > 0}
              onClick={applyZoneDraft}
            >
              {i18n._({
                id: 'editor.zoneDrawing.apply',
                message: 'Apply outline',
              })}
            </button>
            <button type="button" className={button} onClick={cancelZoneDraft}>
              {i18n._({
                id: 'editor.zoneDrawing.cancel',
                message: 'Cancel outline',
              })}
            </button>
          </div>
        </>
      )}
      {(error || (draft && state.error)) && (
        <p role="alert" className="text-xs text-destructive">
          {error ||
            i18n._({
              id: 'editor.zoneDrawing.error',
              message:
                'Outline cannot be applied: {reason}. Check boundaries and holes. If the scene changed, preview again.',
              values: { reason: reasonText(state.error) },
            })}
        </p>
      )}
      <details className="text-xs">
        <summary
          className="cursor-pointer text-muted-foreground"
          onClick={() => setText(JSON.stringify(parts, null, 2))}
        >
          {i18n._({
            id: 'editor.zoneDrawing.advanced',
            message: 'Advanced coordinates',
          })}
        </summary>
        <textarea
          className="mt-1 w-full rounded border border-border bg-background p-1 font-mono text-xs"
          rows={6}
          aria-label={i18n._({
            id: 'editor.zoneDrawing.json',
            message: 'Geometry parts JSON',
          })}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className={button}
          onClick={() => {
            try {
              const input = FunctionalZonePart.array()
                .min(1)
                .max(101)
                .parse(JSON.parse(text))
              const reason = zoneDraftError(input, roomId)
              if (reason) {
                state.setError(reason)
                setError(reasonText(reason))
                return
              }
              begin('preview', 'replace', input)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          {i18n._({
            id: 'editor.zoneDrawing.preview',
            message: 'Preview coordinates',
          })}
        </button>
      </details>
    </div>
  )
}
