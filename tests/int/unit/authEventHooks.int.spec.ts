import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { createAuditAfterErrorHook } from '../../../src/hooks/authEventHooks'
import { AUDIT_LOG_CUSTOM_KEY } from '../../../src/types'
import { resolveAuthEventsConfig } from '../../../src/utils/resolveAuthEvents'

const runtime = {
  auditCollectionSlug: 'audit-logs',
  authCollectionSlugs: ['users'],
  authEvents: resolveAuthEventsConfig(),
  delegation: { enabled: true, maxChainDepth: 10 },
  forensics: {
    authStrategy: false,
    requestMethod: false,
    requestPath: false,
    tokenFingerprint: false,
  },
}

const makeReq = (
  create: ReturnType<typeof vi.fn>,
  findDocs: Array<Record<string, unknown>>,
  data: Record<string, string> = { email: 'dev@example.com', password: 'wrong' },
) => {
  const find = vi.fn().mockResolvedValue({ docs: findDocs })
  const req = {
    context: {},
    data,
    payload: {
      config: { custom: { [AUDIT_LOG_CUSTOM_KEY]: runtime } },
      create,
      find,
      logger: { error: vi.fn() },
    },
    url: 'http://127.0.0.1:3000/api/users/login',
    user: undefined,
  } as unknown as PayloadRequest

  return { find, req }
}

describe('createAuditAfterErrorHook', () => {
  it('records login.failure for a 401 on /login even when error.name is minified', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const { req } = makeReq(create, [{ id: 'u1', email: 'dev@example.com' }])
    const error = Object.assign(new Error('email or password incorrect'), {
      name: 't',
      status: 401,
    })

    await createAuditAfterErrorHook()({
      collection: { slug: 'users' } as SanitizedCollectionConfig,
      context: req.context,
      error,
      req,
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]?.data.action).toBe('auth.login.failure')
  })

  it('queries email only on collections without username login', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const { find, req } = makeReq(create, [{ id: 'u1', email: 'dev@example.com' }])
    const error = Object.assign(new Error('email or password incorrect'), {
      name: 'AuthenticationError',
      status: 401,
    })

    await createAuditAfterErrorHook()({
      collection: { slug: 'users' } as SanitizedCollectionConfig,
      context: req.context,
      error,
      req,
    })

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        where: { email: { equals: 'dev@example.com' } },
      }),
    )
    expect(create.mock.calls[0]?.[0]?.data.docTitle).toBe('dev@example.com')
  })

  it('links failed username login to the account via username lookup', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const { find, req } = makeReq(
      create,
      [{ id: 'u2', email: 'dev@payload-audit.local', username: 'devuser' }],
      { password: 'wrong', username: 'devuser' },
    )
    const error = Object.assign(new Error('username or password incorrect'), {
      name: 'AuthenticationError',
      status: 401,
    })

    await createAuditAfterErrorHook()({
      collection: {
        slug: 'users',
        auth: { loginWithUsername: true },
      } as SanitizedCollectionConfig,
      context: req.context,
      error,
      req,
    })

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        where: {
          or: [{ email: { equals: 'devuser' } }, { username: { equals: 'devuser' } }],
        },
      }),
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data.action).toBe('auth.login.failure')
    expect(data.docId).toBe('u2')
    expect(data.docTitle).toBe('devuser')
    expect(data.actor).toBeUndefined()
  })

  it('does not emit twice when collection and root afterError both run', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const { req } = makeReq(create, [])
    const error = Object.assign(new Error('email or password incorrect'), {
      name: 'AuthenticationError',
      status: 401,
    })
    const hook = createAuditAfterErrorHook()
    const args = {
      collection: { slug: 'users' } as SanitizedCollectionConfig,
      context: req.context,
      error,
      req,
    }

    await hook(args)
    await hook(args)

    expect(create).toHaveBeenCalledTimes(1)
  })
})
