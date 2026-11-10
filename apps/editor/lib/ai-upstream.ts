export function isAIRequestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    if (parsed.host === request.headers.get('host')) return true
    // ModelScope may rewrite Host at its ingress. Trust only our configured
    // public website, rather than a caller-controlled forwarded-host header.
    return (
      !!process.env.PASCAL_PUBLIC_URL &&
      parsed.origin === new URL(process.env.PASCAL_PUBLIC_URL).origin
    )
  } catch {
    return false
  }
}

export function aiUpstream(kind: 'chat' | 'studio', query: URLSearchParams) {
  const configured = process.env[kind === 'chat' ? 'PASCAL_CHAT_URL' : 'PASCAL_STUDIO_URL']
  const url = new URL(
    configured || (kind === 'chat' ? 'http://127.0.0.1:18081/' : 'http://127.0.0.1:18082/'),
  )
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error('Invalid AI upstream configuration')
  if (!local && url.protocol !== 'https:') throw Error('Remote AI gateway requires HTTPS')
  const token = process.env.PASCAL_GATEWAY_TOKEN
  if (!local && (!token || token.length < 32)) throw Error('Remote AI gateway token is required')
  url.search = query.toString()
  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-pascal-gateway-token': token } : {}),
    },
  }
}
