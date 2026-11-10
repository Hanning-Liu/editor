import { type FunctionalZoneNode, useScene, zoneParts } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useMemo } from 'react'
import { functionalZoneBoundaries, functionalZoneColors } from '../lib/functional-zone-boundaries'
import { roomFloorElevation } from '../lib/room-handle-drag'
import { useFunctionalZoneDraft } from '../store/use-functional-zone-draft'

export function useFunctionalZonePresentation() {
  const nodes = useScene((s) => s.nodes),
    levelId = useViewer((s) => s.selection.levelId)
  const selected = useViewer((s) => s.selection.selectedIds),
    hovered = useViewer((s) => s.hoveredId)
  const draftId = useFunctionalZoneDraft((s) => s.draft?.nodeId)
  const geometry = useMemo(() => {
    const zones = Object.values(nodes).filter(
      (n): n is FunctionalZoneNode =>
        n.type === 'functional-zone' &&
        n.parentId === levelId &&
        n.visible !== false &&
        n.id !== draftId,
    )
    const colors = functionalZoneColors(zones)
    const areas = zones.map((n) => ({
      ...n,
      partsGeometry: zoneParts(n),
      displayColor: colors[n.id]!,
      elevation: roomFloorElevation(nodes, n.roomId),
    }))
    const boundaries = functionalZoneBoundaries(
      areas.map((n) => ({ id: n.id, parts: n.partsGeometry, elevation: n.elevation })),
    )
    return { areas, boundaries }
  }, [nodes, levelId, draftId])
  return { ...geometry, nodes, levelId, selected, hovered }
}
