import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

const ring = z
  .array(z.tuple([z.number().finite(), z.number().finite()]))
  .min(3)
  .max(200)
export const FunctionalZonePart = z.object({
  polygon: ring,
  holes: z.array(ring).max(100).default([]),
})
export const FunctionalZoneNode = BaseNode.extend({
  id: objectId('functional-zone'),
  type: nodeType('functional-zone'),
  name: z.string().trim().min(1).max(120),
  roomId: z.templateLiteral(['zone_', z.string()]),
  functions: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  polygon: ring,
  holes: z.array(ring).max(100).default([]),
  parts: z.array(FunctionalZonePart).max(100).default([]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#a78bfa'),
})
export type FunctionalZoneNode = z.infer<typeof FunctionalZoneNode>
