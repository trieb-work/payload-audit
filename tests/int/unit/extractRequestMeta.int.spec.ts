import type { PayloadRequest } from 'payload'

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { extractRequestMeta } from '../../../src/utils/extractRequestMeta'

const reqWith = (headers: Record<string, string>): PayloadRequest =>
  ({ headers: new Headers(headers) }) as unknown as PayloadRequest

const ALL_FORENSICS = {
  authStrategy: true,
  requestMethod: true,
  requestPath: true,
  tokenFingerprint: true,
}

/** Expected fingerprint for a token: first 8 chars + sha256. */
const expectedFingerprint = (token: string) =>
  `${token.slice(0, 8)}:${createHash('sha256').update(token).digest('hex')}`

describe('extractRequestMeta', () => {
  it('returns {} when there is no request or headers', () => {
    expect(extractRequestMeta(undefined)).toEqual({})
    expect(extractRequestMeta({} as PayloadRequest)).toEqual({})
  })

  it('takes the first IP from x-forwarded-for', () => {
    const meta = extractRequestMeta(
      reqWith({ 'user-agent': 'UA/1.0', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
    )
    expect(meta.ipAddress).toBe('203.0.113.7')
    expect(meta.userAgent).toBe('UA/1.0')
  })

  it('falls back to x-real-ip then cf-connecting-ip', () => {
    expect(extractRequestMeta(reqWith({ 'x-real-ip': '198.51.100.2' })).ipAddress).toBe(
      '198.51.100.2',
    )
    expect(extractRequestMeta(reqWith({ 'cf-connecting-ip': '198.51.100.9' })).ipAddress).toBe(
      '198.51.100.9',
    )
  })

  it('leaves ipAddress/userAgent undefined when headers are absent', () => {
    const meta = extractRequestMeta(reqWith({}))
    expect(meta.ipAddress).toBeUndefined()
    expect(meta.userAgent).toBeUndefined()
  })
})

describe('extractRequestMeta (forensics)', () => {
  it('extracts authStrategy from req.user._strategy', () => {
    const req = {
      ...reqWith({}),
      user: { id: 'u1', _strategy: 'local-jwt', collection: 'users' },
    } as unknown as PayloadRequest
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.authStrategy).toBe('local-jwt')
  })

  it('extracts requestMethod from req.method', () => {
    const req = { ...reqWith({}), method: 'POST' } as unknown as PayloadRequest
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.requestMethod).toBe('POST')
  })

  it('extracts requestPath from req.url, stripping the query string', () => {
    const req = {
      ...reqWith({}),
      url: 'http://localhost/api/posts/42?foo=bar&token=secret',
    } as unknown as PayloadRequest
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.requestPath).toBe('/api/posts/42')
  })

  it('handles relative URLs in req.url', () => {
    const req = { ...reqWith({}), url: '/api/posts' } as unknown as PayloadRequest
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.requestPath).toBe('/api/posts')
  })

  it('builds a token fingerprint from a Bearer token (prefix + sha256)', () => {
    const token = 'abcdefgh1234567890abcdefghijklmnop'
    const req = reqWith({ authorization: `Bearer ${token}` })
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.tokenFingerprint).toBe(expectedFingerprint(token))
    // The raw token must never appear in the fingerprint.
    expect(meta.tokenFingerprint).not.toContain(token)
    expect(meta.tokenFingerprint).not.toContain(token.slice(8))
  })

  it('builds a token fingerprint from a Payload-API-Key header', () => {
    const token = 'pk_live_abcdefghijklmnopqrstuvwxyz0123456789'
    const req = reqWith({ 'payload-api-key': token })
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.tokenFingerprint).toBe(expectedFingerprint(token))
  })

  it('Bearer header takes precedence over Payload-API-Key', () => {
    const bearer = 'bearer-token-aaaaaaaaaaaaaaaaaa'
    const apiKey = 'apikey-token-bbbbbbbbbbbbbbbbbb'
    const req = reqWith({ authorization: `Bearer ${bearer}`, 'payload-api-key': apiKey })
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.tokenFingerprint).toBe(expectedFingerprint(bearer))
  })

  it('returns no fingerprint when no auth header is present', () => {
    const meta = extractRequestMeta(reqWith({}), ALL_FORENSICS)
    expect(meta.tokenFingerprint).toBeUndefined()
  })

  it('returns no fingerprint for tokens shorter than 8 characters', () => {
    const req = reqWith({ authorization: 'Bearer short' })
    const meta = extractRequestMeta(req, ALL_FORENSICS)
    expect(meta.tokenFingerprint).toBeUndefined()
  })

  it('does not extract forensic fields when flags are false', () => {
    const req = {
      ...reqWith({ authorization: 'Bearer abcdefgh1234567890' }),
      method: 'POST',
      url: '/api/posts',
      user: { _strategy: 'local-jwt' },
    } as unknown as PayloadRequest
    const meta = extractRequestMeta(req, {
      authStrategy: false,
      requestMethod: false,
      requestPath: false,
      tokenFingerprint: false,
    })
    expect(meta.authStrategy).toBeUndefined()
    expect(meta.requestMethod).toBeUndefined()
    expect(meta.requestPath).toBeUndefined()
    expect(meta.tokenFingerprint).toBeUndefined()
    // IP + UA are still captured regardless of forensics flags.
    expect(meta.ipAddress).toBeUndefined()
  })

  it('omits forensic fields entirely when no forensics options are passed', () => {
    const req = {
      ...reqWith({ authorization: 'Bearer abcdefgh1234567890' }),
      method: 'POST',
      url: '/api/posts',
      user: { _strategy: 'local-jwt' },
    } as unknown as PayloadRequest
    const meta = extractRequestMeta(req)
    expect(meta.authStrategy).toBeUndefined()
    expect(meta.requestMethod).toBeUndefined()
    expect(meta.requestPath).toBeUndefined()
    expect(meta.tokenFingerprint).toBeUndefined()
  })
})
