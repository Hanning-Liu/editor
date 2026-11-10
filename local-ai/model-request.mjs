import { Agent } from 'undici'

// Non-streaming local inference can spend minutes prefilling and reasoning before
// sending headers. The caller's AbortSignal owns the entire request deadline.
const modelDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 })

export function modelFetch(endpoint, init) {
  if (!init?.signal) throw Error('Model request requires a cancellation/deadline signal')
  return fetch(endpoint, { ...init, dispatcher: modelDispatcher })
}

export function isModelTimeout(error) {
  return error?.name === 'TimeoutError' ||
    ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(error?.cause?.code)
}

export function errorDetails(error) {
  const parts = [String(error?.message || error)]
  const seen = new Set([error])
  for (let cause = error?.cause; cause && !seen.has(cause) && seen.size < 5; cause = cause.cause) {
    seen.add(cause)
    parts.push([cause.code, cause.message].filter(Boolean).join(': '))
  }
  return parts.join(' | ')
}
