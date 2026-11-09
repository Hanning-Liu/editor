import { refuse } from '../agent-tools/refusal'
import { findLevelAncestorId } from '../lib/node-ancestry'
import { pointInPolygon, polygonsOverlap, segmentsIntersect } from '../lib/polygon-relations'
import { composePoses, eulerPose, matrixEuler, rotateVector } from '../procedural-items/spatial'
import { FunctionalZoneNode, FurnitureGroupNode, type ItemNode, type ZoneNode } from '../schema'
import { itemLevelPose } from './item-space'
import { readRooms } from './room-readings'
import { queryNodes } from './scene-queries'
import type { AgentOperationOutcome, SceneNodes } from './types'

type Point = [number, number]
export type EditFunctionalZoneInput = {
  id?: string
  roomId?: string
  name?: string
  functions?: string[]
  polygon?: number[][]
  color?: string
  delete?: boolean
}
export type EditFurnitureGroupInput = {
  id?: string
  functionalZoneId?: string
  name?: string
  purpose?: string
  memberIds?: string[]
  anchorNodeId?: string | null
  memberRoles?: Record<string, string>
  delete?: boolean
}
export type TransformFurnitureGroupInput = {
  id: string
  translate?: number[]
  angleDegrees?: number
  pivot?: number[]
}

function roomOf(nodes: SceneNodes, id?: string): ZoneNode {
  const room = id ? nodes[id] : undefined
  if (room?.type !== 'zone' || room.spaceRole !== 'room')
    refuse('room_required', 'Choose an existing room id from get_zones.', { roomId: id })
  return room
}
function areaOf(nodes: SceneNodes, id?: string): FunctionalZoneNode {
  const area = id ? nodes[id] : undefined
  if (area?.type !== 'functional-zone')
    refuse('functional_zone_not_found', 'Choose an existing functional zone.', { id })
  return area
}
function groupOf(nodes: SceneNodes, id: string): FurnitureGroupNode {
  const group = nodes[id]
  if (group?.type !== 'furniture-group')
    refuse('furniture_group_not_found', 'Choose an existing furniture group.', { id })
  return group
}
function polygonArea(poly: Point[]) {
  return (
    Math.abs(
      poly.reduce((sum, p, i) => {
        const q = poly[(i + 1) % poly.length]!
        return sum + p[0] * q[1] - q[0] * p[1]
      }, 0),
    ) / 2
  )
}
function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}
function properCross(a: Point, b: Point, c: Point, d: Point) {
  return cross(a, b, c) * cross(a, b, d) < -1e-12 && cross(c, d, a) * cross(c, d, b) < -1e-12
}
function validatePolygon(poly: Point[], room: ZoneNode) {
  if (polygonArea(poly) < 0.001) refuse('invalid_polygon', 'Functional zone needs a non-zero area.')
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6)
      refuse('invalid_polygon', 'Repeated consecutive corners.')
    for (let j = i + 1; j < poly.length; j++) {
      if (j === i + 1 || (i === 0 && j === poly.length - 1)) continue
      if (segmentsIntersect(a, b, poly[j]!, poly[(j + 1) % poly.length]!))
        refuse('invalid_polygon', 'Functional zone boundary crosses itself.')
    }
    if (!pointInPolygon(a, room.polygon))
      refuse('outside_room', 'Functional zone must stay inside its room.')
    for (let j = 0; j < room.polygon.length; j++)
      if (properCross(a, b, room.polygon[j]!, room.polygon[(j + 1) % room.polygon.length]!))
        refuse('outside_room', 'Functional zone edge crosses its room boundary.')
    if (!pointInPolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], room.polygon))
      refuse('outside_room', 'Functional zone edge leaves its room.')
  }
  for (const hole of room.holes ?? [])
    if (polygonsOverlap(poly, hole))
      refuse('room_hole_overlap', 'Functional zone overlaps a room opening.')
}

export function editFunctionalZone(
  nodes: SceneNodes,
  input: EditFunctionalZoneInput,
): AgentOperationOutcome {
  const old = input.id ? areaOf(nodes, input.id) : undefined
  if (input.delete) {
    if (!old) refuse('functional_zone_not_found', 'Pass the functional zone id to delete.')
    const groups = queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' }).filter(
      (n) => n.functionalZoneId === old.id,
    )
    return {
      result: {
        deletedId: old.id,
        deletedGroupIds: groups.map((n) => n.id),
        furniturePreserved: true,
      },
      changes: { delete: [old.id, ...groups.map((n) => n.id)] },
    }
  }
  const room = roomOf(nodes, input.roomId ?? old?.roomId)
  const level = room.parentId ? nodes[room.parentId] : undefined
  if (level?.type !== 'level') refuse('room_level_required', 'The room must belong to a level.')
  const next = FunctionalZoneNode.parse({
    ...old,
    ...(input.id ? { id: input.id } : {}),
    type: 'functional-zone',
    parentId: level.id,
    roomId: room.id,
    name: input.name ?? old?.name,
    functions: input.functions ?? old?.functions,
    polygon: input.polygon ?? old?.polygon,
    color: input.color ?? old?.color,
  })
  validatePolygon(next.polygon, room)
  if (
    old &&
    old.parentId !== level.id &&
    queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' }).some(
      (n) => n.functionalZoneId === old.id,
    )
  )
    refuse(
      'group_level_mismatch',
      'Move groups explicitly before transferring a functional zone to another level.',
    )
  return {
    result: { functionalZone: next, created: !old },
    changes: old
      ? { update: [{ id: old.id, data: next }] }
      : { create: [{ node: next, parentId: level.id }] },
  }
}

function membersOf(nodes: SceneNodes, group: FurnitureGroupNode): ItemNode[] {
  const area = areaOf(nodes, group.functionalZoneId),
    room = roomOf(nodes, area.roomId)
  const members = group.memberIds.map((id) => {
    const n = nodes[id]
    if (n?.type !== 'item')
      refuse('item_required', 'Group members must be existing furniture item nodes.', { id })
    if (findLevelAncestorId(n.id, nodes) !== room.parentId)
      refuse('group_level_mismatch', 'All members must be on the functional zone room level.', {
        id,
      })
    return n
  })
  if (new Set(group.memberIds).size !== group.memberIds.length)
    refuse('duplicate_member', 'Each member must appear once.')
  if (group.anchorNodeId && !group.memberIds.includes(group.anchorNodeId))
    refuse('anchor_not_member', 'Anchor must be a member.')
  for (const id of Object.keys(group.memberRoles))
    if (!group.memberIds.includes(id))
      refuse('role_not_member', 'Roles must name group members.', { id })
  for (const n of queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' }))
    if (n.id !== group.id) {
      const overlap =
        n.memberIds.find((id) => supportMember(nodes, id, new Set(group.memberIds))) ??
        group.memberIds.find((id) => supportMember(nodes, id, new Set(n.memberIds)))
      if (overlap)
        refuse(
          'member_already_grouped',
          'An item already belongs to another furniture group. Edit that group first.',
          { id: overlap, groupId: n.id },
        )
    }
  return members
}
export function editFurnitureGroup(
  nodes: SceneNodes,
  input: EditFurnitureGroupInput,
): AgentOperationOutcome {
  const old = input.id ? groupOf(nodes, input.id) : undefined
  if (input.delete) {
    if (!old) refuse('furniture_group_not_found', 'Pass the group id to delete.')
    return {
      result: { deletedId: old.id, furniturePreserved: true },
      changes: { delete: [old.id] },
    }
  }
  const area = areaOf(nodes, input.functionalZoneId ?? old?.functionalZoneId)
  const next = FurnitureGroupNode.parse({
    ...old,
    ...(input.id ? { id: input.id } : {}),
    type: 'furniture-group',
    parentId: area.parentId,
    functionalZoneId: area.id,
    name: input.name ?? old?.name,
    purpose: input.purpose ?? old?.purpose,
    memberIds: input.memberIds ?? old?.memberIds,
    anchorNodeId:
      input.anchorNodeId === null ? undefined : (input.anchorNodeId ?? old?.anchorNodeId),
    memberRoles: input.memberRoles ?? old?.memberRoles,
  })
  membersOf(nodes, next)
  return {
    result: { furnitureGroup: next, created: !old },
    changes: old
      ? { update: [{ id: old.id, data: next }] }
      : { create: [{ node: next, parentId: area.parentId! }] },
  }
}

/** Move support roots once. Hosted children keep their exact local pose and parent id. */
export function transformFurnitureGroup(
  nodes: SceneNodes,
  input: TransformFurnitureGroupInput,
): AgentOperationOutcome {
  const group = groupOf(nodes, input.id),
    members = membersOf(nodes, group),
    ids = new Set(group.memberIds)
  const roots = members.filter((item) => {
    const seen = new Set<string>()
    let parent = item.parentId
    while (parent) {
      if (seen.has(parent)) refuse('hierarchy_cycle', 'Support hierarchy contains a cycle.')
      seen.add(parent)
      if (ids.has(parent)) return false
      parent = nodes[parent]?.parentId ?? null
    }
    return true
  })
  for (const root of roots) {
    const parent = root.parentId ? nodes[root.parentId] : undefined
    if (parent?.type !== 'level')
      refuse(
        'external_support',
        'Include the supporting floor item in this group before moving a hosted child.',
        { id: root.id, parentId: root.parentId },
      )
  }
  const anchor = members.find((n) => n.id === group.anchorNodeId)
  const anchorPoint = anchor ? itemOriginInLevel(nodes, anchor) : undefined
  const pivot =
    input.pivot ??
    (anchor
      ? [anchorPoint![0], anchorPoint![2]]
      : [
          roots.reduce((s, n) => s + n.position[0], 0) / roots.length,
          roots.reduce((s, n) => s + n.position[2], 0) / roots.length,
        ])
  const shift = input.translate ?? [0, 0],
    angle = ((input.angleDegrees ?? 0) * Math.PI) / 180
  if (
    pivot.length !== 2 ||
    shift.length !== 2 ||
    ![...pivot, ...shift, angle].every(Number.isFinite)
  )
    refuse('invalid_transform', 'Use finite X/Z metres and rotation degrees.')
  const c = Math.cos(angle),
    s = Math.sin(angle),
    px = pivot[0]!,
    pz = pivot[1]!
  const update = roots.map((n) => {
    const x = n.position[0] - px,
      z = n.position[2] - pz
    return {
      id: n.id,
      data: {
        position: [
          px + c * x + s * z + shift[0]!,
          n.position[1],
          pz - s * x + c * z + shift[1]!,
        ] as [number, number, number],
        rotation:
          n.rotation[0] === 0 && n.rotation[2] === 0
            ? ([0, n.rotation[1] + angle, 0] as [number, number, number])
            : matrixEuler(
                composePoses(eulerPose([0, 0, 0], [0, angle, 0]), eulerPose([0, 0, 0], n.rotation))
                  .r,
              ),
      },
    }
  })
  return {
    result: {
      groupId: group.id,
      movedRootIds: roots.map((n) => n.id),
      preservedHostedIds: members.filter((n) => !roots.includes(n)).map((n) => n.id),
      pivot,
      angleDegrees: input.angleDegrees ?? 0,
      translate: shift,
    },
    changes: { update },
  }
}

export function getSpatialHierarchy(nodes: SceneNodes, input: { roomId?: string } = {}) {
  if (input.roomId) roomOf(nodes, input.roomId)
  const byId = new Map(queryNodes(nodes, {}).map((n) => [n.id, n])),
    rooms = readRooms(nodes).filter((r) => !input.roomId || r.id === input.roomId)
  const issues: Record<string, unknown>[] = []
  const describe = (id: string) => {
    const n = nodes[id]
    return n
      ? {
          id: n.id,
          name: n.name ?? (n.type === 'item' ? n.asset.name : n.type),
          parentId: n.parentId,
        }
      : { id, missing: true }
  }
  const result = rooms.map((room) => {
    const areas = queryNodes<FunctionalZoneNode>(nodes, { type: 'functional-zone' }).filter(
      (n) => n.roomId === room.id,
    )
    const explicit = new Set(
      queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' })
        .filter((g) => areas.some((a) => a.id === g.functionalZoneId))
        .flatMap((g) => g.memberIds),
    )
    const assigned = new Set(
      room.pieces.filter((p) => supportMember(nodes, p.id, explicit)).map((p) => p.id),
    )
    const functionalZones = areas.map((area) => {
      const groups = queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' }).filter(
        (n) => n.functionalZoneId === area.id,
      )
      const furnitureGroups = groups.map((group) => {
        for (const id of group.memberIds) assigned.add(id)
        return { ...group, members: group.memberIds.map(describe) }
      })
      const ungrouped = room.pieces
        .filter((p) => {
          const n = nodes[p.id]
          if (n?.type !== 'item' || assigned.has(p.id)) return false
          const pose = itemLevelPose(n, byId)
          return pose && pointInPolygon([pose.position[0], pose.position[2]], area.polygon)
        })
        .map((p) => describe(p.id))
      return { ...area, furnitureGroups, ungroupedItems: ungrouped }
    })
    const unassignedItems = room.pieces
      .filter(
        (p) =>
          !assigned.has(p.id) &&
          !functionalZones.some((a) => a.ungroupedItems.some((i) => i.id === p.id)),
      )
      .map((p) => describe(p.id))
    return { id: room.id, name: room.name, levelId: room.levelId, functionalZones, unassignedItems }
  })
  for (const n of [
    ...queryNodes<FunctionalZoneNode>(nodes, { type: 'functional-zone' }),
    ...queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' }),
  ]) {
    if (n.type === 'functional-zone') {
      try {
        validatePolygon(n.polygon, roomOf(nodes, n.roomId))
      } catch (e) {
        issues.push({ id: n.id, code: 'invalid_functional_zone', message: String(e) })
      }
    }
    if (n.type === 'furniture-group') {
      try {
        const area = areaOf(nodes, n.functionalZoneId)
        for (const item of membersOf(nodes, n)) {
          const pose = itemLevelPose(item, byId)
          if (pose && !pointInPolygon([pose.position[0], pose.position[2]], area.polygon))
            issues.push({ id: item.id, groupId: n.id, code: 'outside_functional_zone' })
        }
      } catch (e) {
        issues.push({ id: n.id, code: 'invalid_furniture_group', message: String(e) })
      }
    }
  }
  return {
    result: {
      rooms: result,
      issues,
      units: 'meters',
      membershipRule:
        'Group membership is explicit; ungrouped items use their plan reference point. Furniture support parentId is unchanged.',
    },
  }
}

function supportMember(nodes: SceneNodes, id: string, members: ReadonlySet<string>): boolean {
  const seen = new Set<string>()
  let current: string | null = id
  while (current && !seen.has(current)) {
    if (members.has(current)) return true
    seen.add(current)
    current = nodes[current]?.parentId ?? null
  }
  return false
}
export function listFurnitureGroups(nodes: SceneNodes, input: { functionalZoneId?: string } = {}) {
  if (input.functionalZoneId) areaOf(nodes, input.functionalZoneId)
  return {
    result: {
      furnitureGroups: queryNodes<FurnitureGroupNode>(nodes, { type: 'furniture-group' }).filter(
        (n) => !input.functionalZoneId || n.functionalZoneId === input.functionalZoneId,
      ),
    },
  }
}

function itemOriginInLevel(nodes: SceneNodes, item: ItemNode): [number, number, number] {
  let point: [number, number, number] = [...item.position],
    parent = item.parentId ? nodes[item.parentId] : undefined
  const seen = new Set<string>()
  while (parent?.type === 'item' && !seen.has(parent.id)) {
    seen.add(parent.id)
    const host = parent
    point = rotateVector(
      [point[0] * parent.scale[0], point[1] * parent.scale[1], point[2] * parent.scale[2]],
      parent.rotation,
    ).map((v, i) => v + host.position[i]!) as [number, number, number]
    parent = parent.parentId ? nodes[parent.parentId] : undefined
  }
  return point
}
