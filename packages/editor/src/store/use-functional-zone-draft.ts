import {
  type AnyNodeId,
  FunctionalZonePart,
  useScene,
  validateZoneParts,
  type ZonePart,
  type ZonePoint,
} from '@pascal-app/core'
import { create } from 'zustand'
import { beginGesture, type GestureHandle } from '../lib/gesture-lifecycle'
import useEditor from './use-editor'
export type ZoneDraftMode = 'rectangle' | 'polygon' | 'edit' | 'preview'
export type ZoneDraftOperation = 'replace' | 'add-part' | 'add-hole'
export type ZoneDraft = {
  owner: string
  roomId: string
  nodeId?: string
  geometry: ZonePart[]
  mode: ZoneDraftMode
  operation: ZoneDraftOperation
  partIndex: number
  points: ZonePoint[]
  cursor: ZonePoint | null
  signature: string
  onApply: (parts: ZonePart[]) => boolean
}
export function zoneDraftSignature(roomId: string) {
  const nodes = useScene.getState().nodes,
    room = nodes[roomId as AnyNodeId]
  return JSON.stringify([
    room,
    Object.values(nodes).filter((n) => n.type === 'functional-zone' && n.roomId === roomId),
  ])
}
let gesture: GestureHandle | null = null
export const useFunctionalZoneDraft = create<{
  draft: ZoneDraft | null
  error: string
  setDraft: (patch: Partial<ZoneDraft>) => void
  setError: (e: string) => void
}>((set) => ({
  draft: null,
  error: '',
  setDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : {})),
  setError: (error) => set({ error }),
}))
export function cancelZoneDraft() {
  const g = gesture
  gesture = null
  if (g?.active) g.cancel()
  useFunctionalZoneDraft.setState({ draft: null, error: '' })
}
export function startZoneDraft(input: Omit<ZoneDraft, 'points' | 'cursor' | 'signature'>) {
  cancelZoneDraft()
  useEditor.getState().armToolMode({ mode: 'select' })
  useEditor.getState().setViewMode('2d')
  const draft: ZoneDraft = {
    ...input,
    geometry: structuredClone(input.geometry),
    points: [],
    cursor: null,
    signature: zoneDraftSignature(input.roomId),
  }
  useFunctionalZoneDraft.setState({ draft, error: '' })
  gesture = beginGesture({
    kind: 'functional-zone-outline',
    scope: { kind: 'drafting', tool: 'functional-zone' },
    onCancel: () => {
      gesture = null
      useFunctionalZoneDraft.setState({ draft: null, error: '' })
    },
    stale: () => !useScene.getState().nodes[input.roomId as AnyNodeId],
  })
}
export function zoneDraftError(parts: ZonePart[], roomId: string) {
  const room = useScene.getState().nodes[roomId as AnyNodeId]
  if (room?.type !== 'zone') return 'room_required'
  try {
    if (!FunctionalZonePart.array().min(1).max(101).safeParse(parts).success)
      return 'invalid_polygon'
    validateZoneParts(parts, room)
    return ''
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
export function finishZoneRing(points: ZonePoint[]) {
  const { draft } = useFunctionalZoneDraft.getState()
  if (!draft) return
  let next: ZonePart[]
  if (draft.operation === 'replace') next = [{ polygon: points, holes: [] }]
  else if (draft.operation === 'add-part')
    next = [...draft.geometry, { polygon: points, holes: [] }]
  else {
    next = structuredClone(draft.geometry)
    const part = next[draft.partIndex]
    if (!part) return
    part.holes.push(points)
  }
  const error = zoneDraftError(next, draft.roomId)
  if (error) {
    useFunctionalZoneDraft.getState().setError(error)
    return false
  }
  useFunctionalZoneDraft
    .getState()
    .setDraft({ geometry: next, mode: 'edit', points: [], cursor: null })
  useFunctionalZoneDraft.getState().setError('')
  return true
}
export function applyZoneDraft() {
  const { draft } = useFunctionalZoneDraft.getState()
  if (!draft) return false
  if (zoneDraftSignature(draft.roomId) !== draft.signature) {
    useFunctionalZoneDraft.getState().setError('stale_preview')
    return false
  }
  const error = zoneDraftError(draft.geometry, draft.roomId)
  if (error) {
    useFunctionalZoneDraft.getState().setError(error)
    return false
  }
  // Release gesture ownership before the scene commit, so its subscription cannot cancel a successful apply.
  const g = gesture
  gesture = null
  let ok = false
  g?.finish(() => {
    ok = draft.onApply(structuredClone(draft.geometry))
  })
  if (ok) useFunctionalZoneDraft.setState({ draft: null, error: '' })
  else {
    startZoneDraft(draft)
  }
  return ok
}
