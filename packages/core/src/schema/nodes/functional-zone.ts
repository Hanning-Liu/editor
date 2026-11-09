import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const FunctionalZoneNode = BaseNode.extend({
  id: objectId('functional-zone'),
  type: nodeType('functional-zone'),
  name: z.string().trim().min(1).max(120),
  roomId: z.templateLiteral(['zone_', z.string()]),
  functions: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  polygon: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .min(3)
    .max(200),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#a78bfa'),
})
export type FunctionalZoneNode = z.infer<typeof FunctionalZoneNode>
