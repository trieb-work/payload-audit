import { createHash } from 'node:crypto'

import type { PayloadRequest, RequestMeta } from '../types'

/**
 * Forensic extraction flags. When a flag is `false` the corresponding metadata
 * is neither read nor returned, keeping entries lean and avoiding capture of
 * sensitive data (e.g. request paths) that the operator has not opted into.
 */
export interface ExtractForensicsOptions {
  authStrategy: boolean
  requestMethod: boolean
  requestPath: boolean
  tokenFingerprint: boolean
}

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
 *
 * When `forensics` options are supplied, additional forensic metadata (auth
 * strategy, HTTP method, request path, token fingerprint) is extracted. Each
 * forensic field is gated by its flag so callers only capture what they have
 * explicitly enabled.
 */
export function extractRequestMeta(
  req: PayloadRequest | undefined,
  forensics?: ExtractForensicsOptions,
): RequestMeta {
  const headers = req?.headers

  if (!headers || typeof headers.get !== 'function') {
    return forensics ? extractForensics(req, forensics) : {}
  }

  const forwardedFor = headers.get('x-forwarded-for')
  const ipAddress =
    forwardedFor?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    undefined

  const userAgent = headers.get('user-agent') || undefined

  const meta: RequestMeta = {
    ipAddress: ipAddress ?? undefined,
    userAgent,
  }

  if (forensics) {
    Object.assign(meta, extractForensics(req, forensics))
  }

  return meta
}

/**
 * Extracts forensic metadata from the request. Kept separate so the no-header
 * early return in {@link extractRequestMeta} can still surface forensic fields
 * (auth strategy and method are available even without headers).
 */
function extractForensics(
  req: PayloadRequest | undefined,
  opts: ExtractForensicsOptions,
): RequestMeta {
  const meta: RequestMeta = {}

  if (opts.authStrategy) {
    const strategy = (req?.user as { _strategy?: string } | null | undefined)?._strategy
    if (strategy) {
      meta.authStrategy = strategy
    }
  }

  if (opts.requestMethod && req?.method) {
    meta.requestMethod = req.method
  }

  if (opts.requestPath && req?.url) {
    // Parse the URL defensively; invalid URLs yield no path rather than throwing.
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname
      if (pathname) {
        meta.requestPath = pathname
      }
    } catch {
      // Ignore unparseable URLs — best-effort, never throw.
    }
  }

  if (opts.tokenFingerprint) {
    const fingerprint = resolveTokenFingerprint(req?.headers)
    if (fingerprint) {
      meta.tokenFingerprint = fingerprint
    }
  }

  return meta
}

/**
 * Builds a non-reversible fingerprint of the auth token used for the request.
 *
 * The fingerprint is `<prefix8>:<sha256(token)>` — the first 8 characters of
 * the token (so an operator can recognise which of their tokens it was) followed
 * by the SHA-256 hash of the full token. The raw token is never returned or
 * stored.
 *
 * Tokens are read from the `Authorization: Bearer <token>` header (JWT/session
 * tokens) and the `Payload-API-Key` header (Payload API keys). The Bearer form
 * takes precedence. Cookie-based session auth does not expose a bearer token in
 * a stable header, so `undefined` is returned for those requests.
 */
function resolveTokenFingerprint(headers: Headers | undefined): string | undefined {
  if (!headers || typeof headers.get !== 'function') {
    return undefined
  }

  const authorization = headers.get('authorization') || headers.get('Authorization')
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i)
  const token =
    bearerMatch?.[1] ||
    headers.get('payload-api-key') ||
    headers.get('Payload-API-Key') ||
    undefined

  if (!token || token.length < 8) {
    // Too short to safely fingerprint (prefix would reveal most of the token).
    return undefined
  }

  try {
    // SHA-256 is the correct choice here — this is token fingerprinting, not
    // password hashing. Auth tokens are high-entropy (cryptographically random
    // JWTs / API keys), so brute-forcing the hash to recover the token is
    // computationally infeasible, unlike low-entropy human passwords. A slow
    // KDF (bcrypt/scrypt/argon2) would be wrong: it uses a random salt (which
    // would break correlation — the whole point of the fingerprint) and is
    // intentionally slow (unacceptable on the audit-logging hot path). This
    // mirrors how GitHub (`ghp_`) and Stripe (`sk_`) fingerprint issued tokens.
    const hash = createHash('sha256').update(token).digest('hex')
    return `${token.slice(0, 8)}:${hash}`
  } catch {
    // `node:crypto` unavailable (e.g. restricted runtime) — best-effort.
    return undefined
  }
}
