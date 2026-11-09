import { z } from 'zod'

const id = z.string().min(1)
const point = z.array(z.number().finite()).length(2)
export const getSpatialHierarchyTool = {
  name: 'get_spatial_hierarchy',
  title: 'Get spatial hierarchy',
  description:
    'Read rooms → functional zones → furniture groups → items, with unassigned furniture and issues. All ids come from the scene. Group membership is explicit; ungrouped containment uses plan reference points. Support parentId is separate and unchanged.',
  input: { roomId: id.optional() },
}
export const listFunctionalZonesTool = {
  name: 'list_functional_zones',
  title: 'List functional zones',
  description:
    'List independent functional zones inside a room, or all rooms. Returns functions, plan polygons in metres and roomId. These regions never create walls, floors or additional rooms.',
  input: { roomId: id.optional() },
}
export const listFurnitureGroupsTool = {
  name: 'list_furniture_groups',
  title: 'List furniture groups',
  description:
    'List persisted furniture groups with members, roles, anchors and functionalZoneId. Optional functionalZoneId narrows the list.',
  input: { functionalZoneId: id.optional() },
}
export const editFunctionalZoneTool = {
  name: 'edit_functional_zone',
  title: 'Edit functional zone',
  description:
    'Create or edit an independent functional zone. Creation needs roomId, name and polygon ([x,z] metres); edits name id. Omitted fields stay unchanged. Polygon must be simple and inside its room, outside holes; zones may overlap. delete removes zone and group records, preserving furniture. Refuses room_required, outside_room, invalid_polygon.',
  input: {
    id: id.optional(),
    roomId: id.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    functions: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    polygon: z.array(point).min(3).max(200).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    delete: z.boolean().optional(),
  },
}
export const editFurnitureGroupTool = {
  name: 'edit_furniture_group',
  title: 'Edit furniture group',
  description:
    'Create or edit a furniture group referencing a functional zone and existing item ids. Creation needs functionalZoneId, name, memberIds. Does not move or reparent furniture. An item belongs to at most one group; members share the room level. Optional anchorNodeId must be a member; null clears it. memberRoles maps member ids to roles. delete removes only the group. Refuses member_already_grouped, item_required, group_level_mismatch.',
  input: {
    id: id.optional(),
    functionalZoneId: id.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    purpose: z.string().trim().max(240).optional(),
    memberIds: z.array(id).min(1).max(500).optional(),
    anchorNodeId: id.nullable().optional(),
    memberRoles: z.record(z.string(), z.string().max(80)).optional(),
    delete: z.boolean().optional(),
  },
}
export const transformFurnitureGroupTool = {
  name: 'transform_furniture_group',
  title: 'Transform furniture group',
  description:
    'Move by translate [dx,dz] metres and/or rotate by angleDegrees around pivot [x,z]. Positive angles use Pascal Y-axis rotation. Default pivot is the anchor in level space, including its support transforms, else mean root positions. Rotation then translation is one undo step. Only floor roots move; hosted children follow once with local pose and parentId preserved. Refuses external_support for hosted child without its supporting item. Does not reassign membership or solve collisions; inspect hierarchy/issues afterwards.',
  input: {
    id,
    translate: point.optional(),
    angleDegrees: z.number().finite().min(-3600).max(3600).optional(),
    pivot: point.optional(),
  },
}
export const SPATIAL_HIERARCHY_TOOLS = [
  getSpatialHierarchyTool,
  listFunctionalZonesTool,
  listFurnitureGroupsTool,
  editFunctionalZoneTool,
  editFurnitureGroupTool,
  transformFurnitureGroupTool,
] as const
