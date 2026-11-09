import { guardSceneApiRequest } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
async function proxy(request: Request) {
  const guard = guardSceneApiRequest(request, {
    skipRateLimit: request.method === 'GET',
  })
  if (guard) return guard
  const query = new URL(request.url).searchParams
  const sceneId = query.get('sceneId')
  if (!sceneId || !/^[A-Za-z0-9_-]{1,64}$/.test(sceneId))
    return Response.json({ error: '无效项目ID' }, { status: 400 })
  const action = query.get('action') || 'list'
  if (!['list', 'config', 'get', 'file', 'submit', 'apply', 'cancel', 'retry'].includes(action))
    return Response.json({ error: '无效操作' }, { status: 400 })
  if (action !== 'file' && !(await (await getSceneOperations()).loadStoredScene(sceneId)))
    return Response.json({ error: '项目不存在' }, { status: 404 })
  try {
    const body = request.method === 'POST' ? await request.text() : undefined
    if (body && body.length > 30 * 1024 * 1024)
      return Response.json({ error: '请求过大' }, { status: 413 })
    const response = await fetch('http://127.0.0.1:18082/?' + query.toString(), {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body } : {}),
      cache: 'no-store',
      signal: request.signal,
    })
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(response.headers.get('Content-Disposition')
          ? {
              'Content-Disposition': response.headers.get('Content-Disposition')!,
            }
          : {}),
      },
    })
  } catch {
    return Response.json({ error: '本地 Studio 服务未启动或连接中断' }, { status: 502 })
  }
}
export const GET = proxy
export const POST = proxy
