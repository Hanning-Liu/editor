export async function limitedBody(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw Object.assign(Error('请求过大'), { status: 413 })
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw Object.assign(Error('请求过大'), { status: 413 })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}
