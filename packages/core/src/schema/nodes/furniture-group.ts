import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const FurnitureGroupNode = BaseNode.extend({
  id: objectId('furniture-group'),
  type: nodeType('furniture-group'),
  name: z.string().trim().min(1).max(120),
  functionalZoneId: z.templateLiteral(['functional-zone_', z.string()]),
  purpose: z.string().trim().max(240).default(''),
  memberIds: z.array(z.string().min(1)).min(1).max(500),
  anchorNodeId: z.string().min(1).optional(),
  memberRoles: z.record(z.string(), z.string().trim().max(80)).default({}),
})
export type FurnitureGroupNode = z.infer<typeof FurnitureGroupNode>
