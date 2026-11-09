import {
  type AnyNode,
  editFurnitureGroup,
  type FurnitureGroupNode,
  runAsSingleSceneHistoryStep,
  transformFurnitureGroup,
  useScene,
} from '@pascal-app/core'

type Nodes = Record<string, AnyNode>
export const SPATIAL_DRAG_TYPE = 'application/x-pascal-spatial'
export type SpatialDrag = { kind: 'items'; ids: string[] } | { kind: 'group'; id: string }

/** Keep only roots so supported children travel once with their host. */
export function spatialRoots(nodes: Nodes, ids: readonly string[]) {
  return ids.filter((id) => {
    let p = nodes[id]?.parentId
    const seen = new Set<string>()
    while (p && !seen.has(p)) {
      if (ids.includes(p)) return false
      seen.add(p)
      p = nodes[p]?.parentId
    }
    return true
  })
}

/** A semantic drop is a transaction of metadata edits; poses never enter its changes. */
export function spatialDropChanges(nodes: Nodes, drag: SpatialDrag, targetId: string) {
  const target = nodes[targetId]
  if (drag.kind === 'group') {
    if (target?.type !== 'functional-zone')
      throw Error('Drop a furniture group onto a functional zone.')
    return editFurnitureGroup(nodes, { id: drag.id, functionalZoneId: target.id }).changes!
  }
  if (target?.type !== 'furniture-group') throw Error('Drop furniture onto a furniture group.')
  if (!drag.ids.length) throw Error('Choose furniture to assign.')
  // Dragging a supported object assigns its support tree, never detaches it.
  const roots = new Set<string>()
  for (const id of drag.ids) {
    let n = nodes[id]
    if (n?.type !== 'item') throw Error('Only furniture can be assigned to a furniture group.')
    const seen = new Set<string>()
    while (n.parentId && nodes[n.parentId]?.type === 'item') {
      if (seen.has(n.id)) throw Error('Support hierarchy contains a cycle.')
      seen.add(n.id)
      n = nodes[n.parentId]!
    }
    roots.add(n.id)
  }
  const carried = (id: string) => {
    let n = nodes[id]
    const seen = new Set<string>()
    while (n && !seen.has(n.id)) {
      if (roots.has(n.id)) return true
      seen.add(n.id)
      n = n.parentId ? nodes[n.parentId] : undefined!
    }
    return false
  }
  const working = { ...nodes },
    update: { id: string; data: Partial<AnyNode> }[] = [],
    remove: string[] = []
  const transferred = new Set<string>(roots)
  const memberRoles = { ...target.memberRoles }
  for (const n of Object.values(nodes)) {
    if (n.type !== 'furniture-group' || n.id === target.id) continue
    const moved = n.memberIds.filter(carried)
    if (!moved.length) continue
    for (const id of moved) {
      transferred.add(id)
      if (n.memberRoles[id]) memberRoles[id] = n.memberRoles[id]!
    }
    const keep = n.memberIds.filter((id) => !carried(id))
    if (!keep.length) {
      remove.push(n.id)
      delete working[n.id]
      continue
    }
    const changes = editFurnitureGroup(working, {
      id: n.id,
      memberIds: keep,
      anchorNodeId: n.anchorNodeId && keep.includes(n.anchorNodeId) ? n.anchorNodeId : null,
      memberRoles: Object.fromEntries(
        Object.entries(n.memberRoles).filter(([id]) => keep.includes(id)),
      ),
    }).changes!
    for (const patch of changes.update ?? []) {
      update.push(patch)
      working[patch.id] = { ...working[patch.id], ...patch.data } as AnyNode
    }
  }
  const memberIds = [...new Set([...target.memberIds, ...transferred])]
  update.push(
    ...editFurnitureGroup(working, { id: target.id, memberIds, memberRoles }).changes!.update!,
  )
  return { update, delete: remove }
}

export function applySpatialChanges(
  changes: NonNullable<ReturnType<typeof editFurnitureGroup>['changes']>,
) {
  if (useScene.getState().readOnly) throw Error('This project is read-only.')
  runAsSingleSceneHistoryStep(useScene, () =>
    useScene
      .getState()
      .applyNodeChanges(
        changes as Parameters<ReturnType<typeof useScene.getState>['applyNodeChanges']>[0],
      ),
  )
}

export function selectedFurnitureGroup(
  nodes: Nodes,
  ids: readonly string[],
): FurnitureGroupNode | undefined {
  if (!ids.length) return
  return Object.values(nodes).find(
    (n): n is FurnitureGroupNode =>
      n.type === 'furniture-group' &&
      spatialRoots(nodes, n.memberIds).length === ids.length &&
      spatialRoots(nodes, n.memberIds).every((id) => ids.includes(id)),
  )
}

/** Use the same stored anchor in numeric, agent and direct-manipulation rotations. */
export function spatialRotationPivot(
  nodes: Nodes,
  ids: readonly string[],
): [number, number] | undefined {
  const group = selectedFurnitureGroup(nodes, ids)
  if (!group) return
  try {
    return transformFurnitureGroup(nodes, { id: group.id }).result.pivot as [number, number]
  } catch {
    return undefined
  }
}
