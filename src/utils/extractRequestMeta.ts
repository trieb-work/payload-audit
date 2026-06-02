import type { PayloadRequest, RequestMeta } from '../types'

/**
 * Extracts the client IP address and user agent from a Payload request.
 *
 * Payload v3 requests expose headers as a Web `Headers` object, so values are
 * read via `headers.get()`. The IP is resolved from the usual proxy headers in
 * priority order, falling back to any value Payload may have already populated.
 *
 * Both fields are best-effort: when a header is absent (e.g. internal/system
 * operations or local calls without a proxy) the corresponding value is left
 * `undefined` rather than guessed.
 */
export function extractRequestMeta(req: PayloadRequest | undefined): RequestMeta {
  const headers = req?.headers

  if (!headers || typeof headers.get !== 'function') {
    return {}
  }

  const forwardedFor = headers.get('x-forwarded-for')
  const ipAddress =
    forwardedFor?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    undefined

  const userAgent = headers.get('user-agent') || undefined

  return {
    ipAddress: ipAddress ?? undefined,
    userAgent,
  }
}
