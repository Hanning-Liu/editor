import { FurnitureGroupNode, type NodeDefinition } from '@pascal-app/core'
export const furnitureGroupDefinition: NodeDefinition<typeof FurnitureGroupNode> = {
  kind: 'furniture-group',
  schemaVersion: 1,
  schema: FurnitureGroupNode,
  category: 'furnish',
  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    name: 'Furniture group',
    functionalZoneId: 'functional-zone_unassigned',
    purpose: '',
    memberIds: ['item_unassigned'],
    memberRoles: {},
  }),
  dirtyTracking: false,
  capabilities: { duplicable: false, deletable: false, presettable: false },
  presentation: {
    label: 'Furniture group',
    description: 'A persistent semantic furniture assembly; keeps support relationships intact.',
    icon: { kind: 'url', src: '/icons/zone.webp' },
    paletteSection: 'site',
    hidden: true,
  },
}
