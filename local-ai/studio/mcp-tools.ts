import { z } from '../editor-src/node_modules/zod/index.js'
import { randomUUID } from 'node:crypto'
export function registerStudioTools(server: any, bridge: any) {
  const scene = () => {
    const id = bridge.getActiveScene()?.id
    if (!id) throw Error('请先加载当前项目')
    return id
  }
  const request = async (action: string, args: any = {}, method = 'GET') => {
    const u = new URL('http://127.0.0.1:18082/')
    u.searchParams.set('sceneId', scene())
    u.searchParams.set('action', action)
    if (args.jobId) u.searchParams.set('jobId', args.jobId)
    const r = await fetch(u, {
      method,
      ...(method === 'POST'
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
          }
        : {}),
      signal: AbortSignal.timeout(15000),
    })
    const value = await r.json()
    if (!r.ok) throw Error(value.error || 'Studio服务不可用')
    return value
  }
  const register = (
    name: string,
    description: string,
    inputSchema: any,
    handler: Function,
  ) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint: ![
            'submit_local_studio',
            'cancel_local_studio_job',
          ].includes(name),
          destructiveHint: false,
        },
      },
      async (args: any) => {
        try {
          const value = await handler(args)
          return {
            content: [{ type: 'text', text: JSON.stringify(value) }],
            structuredContent: value,
          }
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: e.message }] }
        }
      },
    )
  register(
    'local_studio_capabilities',
    '查看本地Studio生成类型、可用环境与任务队列。',
    z.object({}),
    () => request('config'),
  )
  register(
    'submit_local_studio',
    '提交当前项目的本地Studio异步生成任务：render效果图、material基础无缝材质、blender由Qwen编写bpy生成模型、pbr估算完整PBR、trellis图片转3D。仅提交，不修改当前场景。结果在顶部Studio预览、应用和下载；返回任务ID，不得声称已生成或已摆放。可用sourceJobId引用已有素材；需要上传新图片时让用户在Studio页面提交。',
    z.object({
      type: z.enum(['render', 'material', 'blender', 'pbr', 'trellis']),
      prompt: z.string().min(1).max(8000),
      name: z.string().max(64).optional(),
      generationKey: z.string().min(8).max(128).optional(),
      sourceJobId: z.string().uuid().optional(),
      settings: z
        .object({
          resolution: z
            .union([z.literal(512), z.literal(768), z.literal(1024)])
            .optional(),
          imageStrength: z.number().min(0.5).max(0.95).optional(),
          seed: z.number().int().nonnegative().optional(),
          width: z.number().min(0.05).max(10).optional(),
          depth: z.number().min(0.05).max(10).optional(),
          height: z.number().min(0.05).max(10).optional(),
          tileSizeMeters: z.number().min(0.05).max(20).optional(),
          roughness: z.number().min(0).max(1).optional(),
          metalness: z.number().min(0).max(1).optional(),
          view: z.enum(['interior', 'exterior']).optional(),
        })
        .optional(),
    }),
    async (args: any) => {
      const j = await request(
        'submit',
        { ...args, generationKey: args.generationKey || randomUUID() },
        'POST',
      )
      return {
        id: j.id,
        status: j.status,
        type: j.type,
        name: j.name,
        sceneId: j.sceneId,
        studioUrl: 'http://127.0.0.1:3002/editor/' + j.sceneId + '?studio=1',
        message: '任务已提交，请在Studio查看进度；尚未自动应用到场景。',
      }
    },
  )
  register(
    'list_local_studio_jobs',
    '查看当前项目Studio异步生成任务和完成结果，不要重复提交相同任务。',
    z.object({}),
    () => request('list'),
  )
  register(
    'get_local_studio_job',
    '读取Studio任务进度、错误和生成文件链接。',
    z.object({ jobId: z.string().uuid() }),
    async (args: any) => {
      const j = await request('get', args)
      if (j.sceneId !== scene()) throw Error('只能读取当前项目任务')
      return j
    },
  )
  register(
    'cancel_local_studio_job',
    '取消当前项目的Studio生成任务；保留已经应用到场景的素材。',
    z.object({ jobId: z.string().uuid() }),
    (args: any) => request('cancel', args, 'POST'),
  )
}
