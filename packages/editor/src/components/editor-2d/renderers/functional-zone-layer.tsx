import { polygonInteriorPoint } from '@pascal-app/core'
import { useFunctionalZonePresentation } from '../../../hooks/use-functional-zone-presentation'
import {
  boundaryDashPhase,
  boundaryOwner,
  ZONE_DASH,
  ZONE_GAP,
} from '../../../lib/functional-zone-boundaries'
import { zonePath } from '../../../lib/functional-zone-drawing'
import { functionalZoneEvents } from '../../../lib/functional-zone-selection'
import { useFloorplanRender } from '../floorplan-render-context'

export function FunctionalZoneLayer() {
  const { areas, boundaries, selected, hovered } = useFunctionalZonePresentation()
  const u = useFloorplanRender()?.unitsPerPixel ?? 0.01
  const byId = new Map(areas.map((n) => [n.id as string, n]))
  return (
    <g data-functional-zone-layer pointerEvents="none">
      {areas.map((n) => (
        <path
          key={n.id}
          data-functional-zone-outline={n.id}
          data-zone-selected={selected.includes(n.id)}
          data-zone-hovered={hovered === n.id}
          d={zonePath(n.partsGeometry)}
          fillRule="evenodd"
          fill={n.displayColor}
          fillOpacity={selected.includes(n.id) ? 0.25 : hovered === n.id ? 0.16 : 0.06}
          stroke="none"
        />
      ))}
      {boundaries.map((edge) => {
        const owner = boundaryOwner(edge.owners, selected, hovered)!,
          active = selected.includes(owner as (typeof selected)[number]),
          hot = edge.owners.includes(hovered ?? '')
        const d = `M${edge.a.join(',')}L${edge.b.join(',')}`
        const color =
          active || hot || edge.owners.length === 1 ? byId.get(owner)?.displayColor : '#94a3b8'
        return (
          <g key={edge.key} data-zone-boundary={edge.key} data-zone-owners={edge.owners.join(' ')}>
            <path
              data-zone-boundary-stroke
              d={d}
              stroke={color}
              strokeWidth={(active ? 2.6 : hot ? 2.1 : 1.3) * u}
              strokeDasharray={`${ZONE_DASH} ${ZONE_GAP}`}
              strokeDashoffset={boundaryDashPhase(edge)}
              fill="none"
            />
            <path
              data-zone-boundary-hit
              d={d}
              stroke="transparent"
              strokeWidth={9 * u}
              fill="none"
              pointerEvents="stroke"
              style={{ cursor: 'pointer' }}
              {...functionalZoneEvents(edge.owners)}
            >
              <title>{edge.owners.map((id) => byId.get(id)?.name).join(' / ')}</title>
            </path>
          </g>
        )
      })}
      {areas.map((n) => {
        const [x, z] = polygonInteriorPoint({ polygon: n.polygon, holes: n.holes })
        return (
          <text
            key={n.id}
            data-functional-zone-label={n.id}
            x={x}
            y={z}
            textAnchor="middle"
            fontSize={0.13}
            fontWeight={selected.includes(n.id) ? 700 : 500}
            fill={n.displayColor}
            stroke="var(--background)"
            strokeWidth={0.01}
            paintOrder="stroke"
            pointerEvents="visiblePainted"
            style={{ cursor: 'pointer' }}
            {...functionalZoneEvents([n.id])}
          >
            <title>{n.name}</title>
            {n.name}
          </text>
        )
      })}
    </g>
  )
}
