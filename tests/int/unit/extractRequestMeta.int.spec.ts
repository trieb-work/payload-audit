import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { extractRequestMeta } from '../../../src/utils/extractRequestMeta'

const reqWith = (headers: Record<string, string>): PayloadRequest =>
  ({ headers: new Headers(headers) }) as unknown as PayloadRequest

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
