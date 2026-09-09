import { describe, expect, it, vi } from 'vitest'

import type { PayloadRequest } from '../../../src/types'

import { AUDIT_LOG_CUSTOM_KEY } from '../../../src/types'
import { emitAuthEvent, UNKNOWN_AUTH_DOC_ID } from '../../../src/utils/emitAuthEvent'
import { resolveAuthEventsConfig } from '../../../src/utils/resolveAuthEvents'

const headers = () =>
  new Headers({ 'user-agent': 'unit-test/1.0', 'x-forwarded-for': '203.0.113.1' })

const runtime = (overrides?: Record<string, unknown>) => ({
  auditCollectionSlug: 'audit-logs',
  authCollectionSlugs: ['users'],
  authEvents: resolveAuthEventsConfig(),
  delegation: { enabled: true, maxChainDepth: 10 },
  forensics: {
    authStrategy: true,
    requestMethod: true,
    requestPath: false,
    tokenFingerprint: true,
  },
  ...overrides,
})

const makeReq = (payload: unknown, user?: unknown) =>
  ({
    headers: headers(),
    payload,
    user,
  }) as unknown as PayloadRequest

describe('emitAuthEvent', () => {
  it('writes auth.login.success using config.custom.auditLog', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const payload = {
      config: { custom: { [AUDIT_LOG_CUSTOM_KEY]: runtime() } },
      create,
      logger: { error: vi.fn() },
    }

    await emitAuthEvent({
      event: 'login.success',
      req: makeReq(payload),
      user: { id: 'u1', collection: 'users', email: 'a@example.com' },
    })

    expect(create).toHaveBeenCalledTimes(1)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data.action).toBe('auth.login.success')
    expect(data.docId).toBe('u1')
    expect(data.docTitle).toBe('a@example.com')
    expect(data.entityCollection).toBe('users')
  })

  it('fingerprints an explicit token override', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const payload = {
      config: { custom: { [AUDIT_LOG_CUSTOM_KEY]: runtime() } },
      create,
      logger: { error: vi.fn() },
    }
    const token = 'issued-jwt-token-abcdef'

    await emitAuthEvent({
      event: 'login.success',
      req: makeReq(payload),
      token,
      user: { id: 'u1', collection: 'users', email: 'a@example.com' },
    })

    const data = create.mock.calls[0]?.[0]?.data
    expect(data.tokenFingerprint).toMatch(/^issued-j:[0-9a-f]{64}$/)
    expect(data.tokenFingerprint).not.toContain(token.slice(8))
  })

  it('omits identifier on failure when the user is unknown (known-user)', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const payload = {
      config: { custom: { [AUDIT_LOG_CUSTOM_KEY]: runtime() } },
      create,
      logger: { error: vi.fn() },
    }

    await emitAuthEvent({
      event: 'login.failure',
      identifier: 'ghost@example.com',
      req: makeReq(payload),
    })

    const data = create.mock.calls[0]?.[0]?.data
    expect(data.action).toBe('auth.login.failure')
    expect(data.docId).toBe(UNKNOWN_AUTH_DOC_ID)
    expect(data.docTitle).toBeUndefined()
  })

  it('stores identifier on failure when captureIdentifier is always', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const payload = {
      config: {
        custom: {
          [AUDIT_LOG_CUSTOM_KEY]: runtime({
            authEvents: resolveAuthEventsConfig({ captureIdentifier: 'always' }),
          }),
        },
      },
      create,
      logger: { error: vi.fn() },
    }

    await emitAuthEvent({
      event: 'login.failure',
      identifier: 'ghost@example.com',
      req: makeReq(payload),
    })

    const data = create.mock.calls[0]?.[0]?.data
    expect(data.docTitle).toBe('ghost@example.com')
  })

  it('does not record the target account as actor on login.failure', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const payload = {
      config: { custom: { [AUDIT_LOG_CUSTOM_KEY]: runtime() } },
      create,
      logger: { error: vi.fn() },
    }

    await emitAuthEvent({
      event: 'login.failure',
      identifier: 'a@example.com',
      req: makeReq(payload),
      user: { id: 'u1', collection: 'users', email: 'a@example.com' },
    })

    const args = create.mock.calls[0]?.[0]
    expect(args.data.action).toBe('auth.login.failure')
    expect(args.data.docId).toBe('u1')
    expect(args.data.docTitle).toBe('a@example.com')
    expect(args.data.actor).toBeUndefined()
    expect(args.req.user).toBeUndefined()
  })

  it('no-ops when the event is disabled', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const payload = {
      config: {
        custom: {
          [AUDIT_LOG_CUSTOM_KEY]: runtime({
            authEvents: resolveAuthEventsConfig({ events: { login: false } }),
          }),
        },
      },
      create,
      logger: { error: vi.fn() },
    }

    await emitAuthEvent({
      event: 'login.success',
      req: makeReq(payload),
      user: { id: 'u1', collection: 'users' },
    })

    expect(create).not.toHaveBeenCalled()
  })

  it('no-ops and logs when the plugin is not registered', async () => {
    const create = vi.fn()
    const error = vi.fn()
    const payload = { config: { custom: {} }, create, logger: { error } }

    await emitAuthEvent({ event: 'logout', req: makeReq(payload) })

    expect(create).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })
})
