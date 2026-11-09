import { guardSceneApiRequest } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function proxy(request: Request) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.headers.get('host'))
    return new Response('Forbidden origin', { status: 403 })
  const query = new URL(request.url).searchParams
  const id = query.get('sceneId')
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    return new Response('invalid sceneId', { status: 400 })
  const operations = await getSceneOperations()
  if (!(await operations.loadStoredScene(id)))
    return new Response('scene not found', { status: 404 })
  try {
    const action = query.get('action') || 'chat'
    if (!['chat', 'config', 'context', 'asset', 'file', 'upload', 'preferences'].includes(action))
      return new Response('invalid action', { status: 400 })
    if (Number(request.headers.get('content-length') || 0) > 12 * 1024 * 1024)
      return new Response('附件请求过大', { status: 413 })
    const response = await fetch(
      `http://127.0.0.1:18081/?sceneId=${encodeURIComponent(id)}&action=${encodeURIComponent(action)}&ref=${encodeURIComponent(query.get('ref') || '')}`,
      {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
        ...(request.method === 'POST' ? { body: await request.text() } : {}),
        signal: request.signal,
        cache: 'no-store',
      },
    )
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        ...(response.headers.get('Content-Disposition')
          ? { 'Content-Disposition': response.headers.get('Content-Disposition')! }
          : {}),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return Response.json({ error: `本地 Chat 服务不可用：${String(error)}` }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const DELETE = proxy
