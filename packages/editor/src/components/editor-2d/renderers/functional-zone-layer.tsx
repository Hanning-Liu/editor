import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'

export function FunctionalZoneLayer() {
  const nodes = useScene((s) => s.nodes)
  const levelId = useViewer((s) => s.selection.levelId)
  return (
    <g data-functional-zone-layer pointerEvents="none">
      {Object.values(nodes)
        .filter(
          (n) => n.type === 'functional-zone' && n.parentId === levelId && n.visible !== false,
        )
        .map((n) => {
          if (n.type !== 'functional-zone') return null
          const x = n.polygon.reduce((s, p) => s + p[0], 0) / n.polygon.length,
            z = n.polygon.reduce((s, p) => s + p[1], 0) / n.polygon.length
          return (
            <g key={n.id} data-functional-zone-outline={n.id}>
              <polygon
                points={n.polygon.map((p) => p.join(',')).join(' ')}
                fill={n.color}
                fillOpacity={0.08}
                stroke={n.color}
                strokeWidth={0.018}
                strokeDasharray="0.1 0.06"
              />
              <text
                x={x}
                y={z}
                textAnchor="middle"
                fontSize={0.13}
                fill={n.color}
                stroke="var(--background)"
                strokeWidth={0.01}
                paintOrder="stroke"
              >
                {n.name}
              </text>
            </g>
          )
        })}
    </g>
  )
}
