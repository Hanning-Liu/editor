import { ZodError } from 'zod'
import { limitedBody } from '@/lib/limited-body'
import { validateRateLimit } from '@/lib/scene-api-security'
import { getSceneStore } from '@/lib/scene-store-server'
import { workerStoreRpc } from '@/lib/worker-store-rpc'
import { hasWorkerToken } from '@/lib/worker-token'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Server-to-server only: a browser session alone cannot invoke this endpoint.
export async function POST(request: Request) {
  if (!hasWorkerToken(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const limited = validateRateLimit(request)
  if (limited) return limited
  try {
    const input = JSON.parse(await limitedBody(request, 12 * 1024 * 1024))
    const value = await workerStoreRpc(await getSceneStore(), input)
    return Response.json({ value }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const e = error as { code?: string; status?: number }
    if (e.status === 413) return Response.json({ error: 'too_large' }, { status: 413 })
    if (error instanceof ZodError || error instanceof SyntaxError)
      return Response.json({ error: 'invalid_request' }, { status: 400 })
    const statuses: Record<string, number> = {
      version_conflict: 409,
      not_found: 404,
      invalid: 400,
      too_large: 413,
    }
    const status = statuses[e.code || ''] || 500
    return Response.json({ error: status === 500 ? 'store_unavailable' : e.code }, { status })
  }
}
