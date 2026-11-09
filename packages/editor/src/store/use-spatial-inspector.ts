import { type AnyNodeId, resolveBuildingForLevel, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { create } from 'zustand'
import { useInspectorExpanded } from '../lib/inspector-expanded'
import { spatialRoots } from '../lib/spatial-hierarchy'
import useEditor from './use-editor'

export type SpatialChoice =
  | { kind: 'zone'; id?: string }
  | { kind: 'group'; id?: string; areaId: string; memberIds?: string[] }
export type SpatialInspection = { roomId: string; choice: SpatialChoice; selectionKey: string }
export const spatialSelectionKey = () => JSON.stringify(useViewer.getState().selection)
export const useSpatialInspector = create<{
  inspection: SpatialInspection | null
  close: () => void
}>((set) => ({
  inspection: null,
  close: () => set({ inspection: null }),
}))
export function inspectSpatial(roomId: string, choice: SpatialChoice) {
  useEditor.getState().clearRoom()
  useInspectorExpanded.getState().applyMode({ collapsed: false, activeExtensionId: null })
  const room = useScene.getState().nodes[roomId as AnyNodeId]
  const level = room?.parentId ? useScene.getState().nodes[room.parentId as AnyNodeId] : undefined
  if (level?.type === 'level') {
    const buildingId = resolveBuildingForLevel(level.id, useScene.getState().nodes)
    const building = buildingId ? useScene.getState().nodes[buildingId] : undefined
    if (building?.type === 'building')
      useViewer.getState().setSelection({ buildingId: building.id, levelId: level.id })
  }
  if (choice.id) {
    const node = useScene.getState().nodes[choice.id as AnyNodeId]
    const ids =
      node?.type === 'furniture-group'
        ? spatialRoots(useScene.getState().nodes, node.memberIds)
        : [choice.id]
    useViewer.getState().setSelection({ selectedIds: ids as AnyNodeId[], zoneId: null })
  }
  useSpatialInspector.setState({
    inspection: { roomId, choice, selectionKey: spatialSelectionKey() },
  })
}
