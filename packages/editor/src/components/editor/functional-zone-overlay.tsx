'use client'
import { type AnyNodeId, sceneRegistry, useScene, type ZonePart, zoneParts } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  DoubleSide,
  type Group,
  Line,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
import { EDITOR_LAYER } from '../../lib/constants'
import { roomFloorElevation } from '../../lib/room-handle-drag'
import { useFunctionalZoneDraft } from '../../store/use-functional-zone-draft'
import { levelFrame } from './group-transform-shared'

const noRaycast = () => null
export function FunctionalZoneOverlay() {
  const nodes = useScene((s) => s.nodes),
    levelId = useViewer((s) => s.selection.levelId),
    draft = useFunctionalZoneDraft((s) => s.draft)
  const areas = useMemo(
    () =>
      Object.values(nodes).flatMap((n) =>
        n.type === 'functional-zone' &&
        n.parentId === levelId &&
        n.visible !== false &&
        n.id !== draft?.nodeId
          ? [
              {
                id: n.id,
                color: n.color,
                parts: zoneParts(n),
                elevation: roomFloorElevation(nodes, n.roomId),
              },
            ]
          : [],
      ),
    [nodes, levelId, draft?.nodeId],
  )
  const ref = useRef<Group>(null)
  useFrame(() => {
    const level = levelId ? sceneRegistry.nodes.get(levelId as AnyNodeId) : undefined
    if (level && ref.current) {
      level.updateWorldMatrix(true, false)
      ref.current.matrix.copy(level.matrixWorld)
      ref.current.matrixWorldNeedsUpdate = true
    }
  })
  const matrix = useMemo(() => levelFrame(levelId).matrix, [levelId])
  return (
    <group ref={ref} matrix={matrix} matrixAutoUpdate={false} name="functional-zone-overlays">
      {areas.map((n) => (
        <ZoneParts3D
          key={n.id}
          parts={n.parts}
          color={n.color}
          name={n.id}
          elevation={n.elevation}
        />
      ))}
      {draft && (
        <ZoneParts3D
          parts={draft.geometry}
          color="#8b5cf6"
          name="functional-zone-draft"
          elevation={roomFloorElevation(nodes, draft.roomId)}
        />
      )}
    </group>
  )
}
function ZoneParts3D({
  parts,
  color,
  name,
  elevation,
}: {
  parts: ZonePart[]
  color: string
  name: string
  elevation: number
}) {
  const objects = useMemo(
    () =>
      parts.map((part) => {
        const shape = new Shape(part.polygon.map(([x, z]) => new Vector2(x, z)))
        shape.holes = part.holes.map((r) => new Path(r.map(([x, z]) => new Vector2(x, z))))
        const geometry = new ShapeGeometry(shape)
        const lines = [part.polygon, ...part.holes].map(
          (r) =>
            new Line(
              new BufferGeometry().setFromPoints(
                [...r, r[0]!].map(([x, z]) => new Vector3(x, 0.045, z)),
              ),
              new LineBasicNodeMaterial({
                color,
                transparent: true,
                opacity: 0.85,
                depthTest: false,
                depthWrite: false,
              }),
            ),
        )
        for (const line of lines) {
          line.raycast = noRaycast
          line.layers.set(EDITOR_LAYER)
        }
        const fill = new MeshBasicNodeMaterial({
          color,
          transparent: true,
          opacity: 0.16,
          side: DoubleSide,
          depthWrite: false,
          depthTest: false,
        })
        return { geometry, lines, fill }
      }),
    [parts, color],
  )
  useEffect(
    () => () => {
      for (const o of objects) {
        o.geometry.dispose()
        o.fill.dispose()
        for (const l of o.lines) {
          l.geometry.dispose()
          l.material.dispose()
        }
      }
    },
    [objects],
  )
  return (
    <group name={name} position-y={elevation}>
      {objects.map((o, i) => (
        <group key={i} name={name + '-part-' + i}>
          <mesh
            layers={EDITOR_LAYER}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0.035, 0]}
            geometry={o.geometry}
            raycast={noRaycast}
            renderOrder={997}
            material={o.fill}
          />
          {o.lines.map((l, j) => (
            <primitive key={j} object={l} />
          ))}
        </group>
      ))}
    </group>
  )
}
