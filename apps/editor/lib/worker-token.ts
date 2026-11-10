import { timingSafeEqual } from 'node:crypto'

export function hasWorkerToken(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const token = env.PASCAL_SCENE_API_TOKEN
  const supplied = request.headers.get('x-pascal-scene-token')
  if (!token || !supplied) return false
  const a = Buffer.from(token)
  const b = Buffer.from(supplied)
  return a.length === b.length && timingSafeEqual(a, b)
}
