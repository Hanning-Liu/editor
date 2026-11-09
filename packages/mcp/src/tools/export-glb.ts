import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { SceneOperations } from '../operations'
import { READ_ONLY_TOOL_ANNOTATIONS } from './annotations'

export const exportGlbInput = {}

export const exportGlbOutput = {
  status: z.enum(['not_implemented', 'exported']),
  reason: z.string(),
  id: z.string().optional(),
  name: z.string().optional(),
  mime: z.string().optional(),
  size: z.number().optional(),
  url: z.string().optional(),
  warnings: z.array(z.string()).optional(),
}

export function registerExportGlb(server: McpServer, _bridge: SceneOperations): void {
  server.registerTool(
    'export_glb',
    {
      title: 'Export GLB',
      description:
        'Export the scene through the host Three.js renderer when configured. A headless host without a renderer returns a structured not_implemented error.',
      inputSchema: z.object(exportGlbInput),
      outputSchema: z.object(exportGlbOutput),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async () => {
      const payload = {
        status: 'not_implemented' as const,
        reason: 'GLB export requires the Three.js renderer, which is browser-only',
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: true,
      }
    },
  )
}
