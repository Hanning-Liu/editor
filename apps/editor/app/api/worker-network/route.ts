import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { hasWorkerToken } from '@/lib/worker-token'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const execute = promisify(execFile)

export async function GET(request: Request) {
  if (!hasWorkerToken(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (process.env.PASCAL_TAILNET_CONTROL !== '1')
    return Response.json({ error: 'private_transport_not_configured' }, { status: 404 })
  try {
    const { stdout } = await execute(
      '/usr/local/bin/tailscale',
      ['--socket=/tmp/pascal-tailnet/tailscaled.sock', 'status', '--json'],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
    )
    const result = JSON.parse(stdout)
    return Response.json(
      {
        backendState: result.BackendState,
        authUrl: result.AuthURL || null,
        addresses: result.TailscaleIPs || [],
        health: result.Health || [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json({ error: 'private_transport_unavailable' }, { status: 503 })
  }
}
