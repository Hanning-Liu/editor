import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { swallowNextClick } from '../components/editor/handles/use-handle-drag'
import useEditor from '../store/use-editor'
import useInteractionScope from '../store/use-interaction-scope'
import { inspectSpatial } from '../store/use-spatial-inspector'
import { selectionEnabled } from './interaction/scope'

export function functionalZonePickingEnabled() {
  const editor = useEditor.getState()
  return (
    selectionEnabled(useInteractionScope.getState().scope) &&
    (editor.mode === 'select' || editor.mode === 'edit') &&
    !editor.isCaptureMode &&
    editor.workspaceMode !== 'studio' &&
    !editor.isPreviewMode &&
    !editor.isFirstPersonMode &&
    !useViewer.getState().cameraDragging &&
    !useViewer.getState().inputDragging
  )
}
export function hoverFunctionalZone(owners: readonly string[]) {
  if (!functionalZonePickingEnabled()) return false
  const state = useViewer.getState()
  const id = owners.find((id) => state.selection.selectedIds.includes(id as AnyNodeId)) ?? owners[0]
  if (!id) return false
  state.setHoveredId(id as AnyNodeId)
  return true
}
export function leaveFunctionalZone(owners: readonly string[]) {
  const state = useViewer.getState()
  if (state.hoveredId && owners.includes(state.hoveredId)) state.setHoveredId(null)
}
export function selectFunctionalZone(owners: readonly string[]) {
  if (!functionalZonePickingEnabled() || !owners.length) return false
  const nodes = useScene.getState().nodes,
    selected = useViewer.getState().selection.selectedIds
  const current = owners.findIndex((id) => selected.includes(id as AnyNodeId)),
    id = owners[(current + 1) % owners.length]!
  const node = nodes[id as AnyNodeId]
  if (node?.type !== 'functional-zone') return false
  inspectSpatial(node.roomId, { kind: 'zone', id: node.id })
  useViewer.getState().setHoveredId(node.id)
  return true
}

/** Renderer adapters forward hits only; this manager owns scope, hover and selection policy. */
export function functionalZoneEvents(owners: readonly string[], surface: '2d' | '3d' = '2d') {
  return {
    onPointerEnter: () => {
      hoverFunctionalZone(owners)
    },
    onPointerMove: (event: { buttons?: number; stopPropagation: () => void }) => {
      if (!event.buttons && hoverFunctionalZone(owners)) event.stopPropagation()
    },
    onPointerLeave: () => {
      leaveFunctionalZone(owners)
    },
    onPointerDown: (event: { button: number; stopPropagation: () => void }) => {
      if (event.button === 0 && functionalZonePickingEnabled()) event.stopPropagation()
    },
    onPointerUp: (event: { button: number; stopPropagation: () => void }) => {
      if (event.button === 0 && functionalZonePickingEnabled()) {
        // Match native 3D node events: commit the click on release, not a second DOM click.
        if (surface === '3d' && selectFunctionalZone(owners)) swallowNextClick()
        event.stopPropagation()
      }
    },
    onClick: (event: { button: number; stopPropagation: () => void }) => {
      if (event.button !== 0) return
      if (surface === '3d' ? functionalZonePickingEnabled() : selectFunctionalZone(owners))
        event.stopPropagation()
    },
  }
}
