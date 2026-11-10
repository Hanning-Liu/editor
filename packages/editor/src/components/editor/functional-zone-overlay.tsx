'use client'
import { type AnyNodeId, sceneRegistry, type ZonePart } from '@pascal-app/core'
import { markPureRaycast } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  DoubleSide,
  type Group,
  LineSegments,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
import { useFunctionalZonePresentation } from '../../hooks/use-functional-zone-presentation'
import { EDITOR_LAYER } from '../../lib/constants'
import {
  boundaryDashes,
  boundaryOwner,
  functionalZoneBoundaries,
  type ZoneBoundary,
} from '../../lib/functional-zone-boundaries'
import { functionalZoneEvents } from '../../lib/functional-zone-selection'
import { roomFloorElevation } from '../../lib/room-handle-drag'
import { useFunctionalZoneDraft } from '../../store/use-functional-zone-draft'
import { levelFrame } from './group-transform-shared'

const noRaycast = () => null
export function FunctionalZoneOverlay() {
  const { areas, boundaries, nodes, levelId, selected, hovered } = useFunctionalZonePresentation(),
    draft = useFunctionalZoneDraft((s) => s.draft)
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
  const draftBoundaries = useMemo(
    () =>
      draft
        ? functionalZoneBoundaries([
            {
              id: 'functional-zone-draft',
              parts: draft.geometry,
              elevation: roomFloorElevation(nodes, draft.roomId),
            },
          ])
        : [],
    [draft, nodes],
  )
  const byId = new Map(areas.map((n) => [n.id as string, n]))
  return (
    <group ref={ref} matrix={matrix} matrixAutoUpdate={false} name="functional-zone-overlays">
      {areas.map((n) => (
        <ZoneFill3D
          key={n.id}
          parts={n.partsGeometry}
          color={n.displayColor}
          name={n.id}
          elevation={n.elevation}
          opacity={selected.includes(n.id) ? 0.25 : hovered === n.id ? 0.16 : 0.06}
        />
      ))}
      {boundaries.map((edge) => {
        const owner = boundaryOwner(edge.owners, selected, hovered)!,
          active = selected.includes(owner as (typeof selected)[number]),
          hot = edge.owners.includes(hovered ?? '')
        const color =
          active || hot || edge.owners.length === 1
            ? (byId.get(owner)?.displayColor ?? '#94a3b8')
            : '#94a3b8'
        return <Boundary3D key={edge.key} edge={edge} color={color} active={active || hot} />
      })}
      {draft && (
        <ZoneFill3D
          parts={draft.geometry}
          color="#8b5cf6"
          name="functional-zone-draft"
          elevation={roomFloorElevation(nodes, draft.roomId)}
          opacity={0.16}
        />
      )}
      {draftBoundaries.map((edge) => (
        <Boundary3D key={`draft-${edge.key}`} edge={edge} color="#8b5cf6" active />
      ))}
    </group>
  )
}
function ZoneFill3D({
  parts,
  color,
  name,
  elevation,
  opacity,
}: {
  parts: ZonePart[]
  color: string
  name: string
  elevation: number
  opacity: number
}) {
  const geometry = useMemo(
    () =>
      parts.map((part) => {
        const shape = new Shape(part.polygon.map(([x, z]) => new Vector2(x, z)))
        shape.holes = part.holes.map((r) => new Path(r.map(([x, z]) => new Vector2(x, z))))
        return new ShapeGeometry(shape)
      }),
    [parts],
  )
  const material = useMemo(
    () =>
      new MeshBasicNodeMaterial({
        color,
        transparent: true,
        opacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    [color, opacity],
  )
  useEffect(
    () => () => {
      for (const g of geometry) g.dispose()
    },
    [geometry],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <group name={name} position-y={elevation}>
      {geometry.map((g, i) => (
        <mesh
          key={i}
          layers={EDITOR_LAYER}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.035, 0]}
          geometry={g}
          material={material}
          raycast={noRaycast}
          renderOrder={997}
        />
      ))}
    </group>
  )
}
function Boundary3D({
  edge,
  color,
  active,
}: {
  edge: ZoneBoundary
  color: string
  active: boolean
}) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry().setFromPoints(
      boundaryDashes(edge).flatMap((pair) =>
        pair.map(([x, z]) => new Vector3(x, edge.elevation + 0.045, z)),
      ),
    )
    const material = new LineBasicNodeMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    })
    const line = new LineSegments(geometry, material)
    line.name = `functional-zone-boundary:${edge.key}`
    line.userData.functionalZoneOwners = edge.owners
    line.layers.set(EDITOR_LAYER)
    line.renderOrder = 998
    const raycast = line.raycast
    line.raycast = markPureRaycast((raycaster, hits) => {
      const query = Object.create(raycaster) as typeof raycaster
      query.params = { ...raycaster.params, Line: { threshold: 0.05 } }
      raycast.call(line, query, hits)
    })
    return line
  }, [edge])
  // Keep the raycast target stable across hover/selection: replacing it between
  // pointerup and click makes the native event manager report a missed click.
  useLayoutEffect(() => {
    line.material.color.set(color)
    line.material.opacity = active ? 1 : 0.85
  }, [line, color, active])
  useEffect(
    () => () => {
      line.geometry.dispose()
      line.material.dispose()
    },
    [line],
  )
  return <primitive object={line} {...functionalZoneEvents(edge.owners, '3d')} />
}
