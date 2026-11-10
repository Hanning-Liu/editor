import { DiskArtifactStore, resolveDefaultDatabasePath } from '@pascal-app/mcp/storage'
import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'
import { isArtifactShared } from '@/lib/scene-sharing'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: Request) {
  return sceneApiPreflight(request)
}

export async function GET(request: Request, { params }: { params: Promise<{ sha256: string }> }) {
  // A scene loads one artifact per scripted object; immutable reads stay outside the request budget.
  const guard = guardSceneApiRequest(request, { skipRateLimit: true })
  const { sha256 } = await params
  if (guard && (!/^[0-9a-f]{64}$/.test(sha256) || !(await isArtifactShared(sha256)))) return guard
  if (!/^[0-9a-f]{64}$/.test(sha256))
    return sceneApiJson(request, { error: 'invalid_hash' }, { status: 400 })
  const bytes = await new DiskArtifactStore(resolveDefaultDatabasePath()).read(sha256)
  if (!bytes) return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  const glb = new TextDecoder().decode(bytes.subarray(0, 4)) === 'glTF'
  const png =
    bytes
      .subarray(0, 8)
      .every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]) &&
    bytes.length >= 8
  const filename = new URL(request.url).searchParams.get('name')
  const download = new URL(request.url).searchParams.get('download') === '1'
  return withSceneApiHeaders(
    request,
    new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': glb ? 'model/gltf-binary' : png ? 'image/png' : 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        ...(download && filename && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$/.test(filename)
          ? { 'Content-Disposition': `attachment; filename="${filename}"` }
          : {}),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    }),
  )
}

export async function PUT(request: Request, { params }: { params: Promise<{ sha256: string }> }) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard
  const { sha256 } = await params
  if (!/^[0-9a-f]{64}$/.test(sha256))
    return sceneApiJson(request, { error: 'invalid_hash' }, { status: 400 })
  const bytes = await request.arrayBuffer()
  try {
    await new DiskArtifactStore(resolveDefaultDatabasePath()).put(sha256, bytes)
  } catch (error) {
    if (error instanceof Error && error.message === 'Artifact hash mismatch') {
      return sceneApiJson(request, { error: 'hash_mismatch' }, { status: 400 })
    }
    throw error
  }
  return sceneApiJson(request, { sha256 })
}
