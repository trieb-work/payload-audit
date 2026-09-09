import type { Payload } from 'payload'

import { createSession, invalidateAllUserSessions } from '@trieb.work/payload-auth-pwless'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../dev/e2e-pwless/payload.config'

let payload: Payload

const AUDIT = 'audit-logs' as never

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.destroy?.()
})

describe('auth events (payload-auth-pwless)', () => {
  it('createSession writes auth.login.success via emitAuthEvent', async () => {
    const email = `pwless-${Date.now()}@payload-audit.local`
    const user = await payload.create({
      collection: 'users',
      data: { email, password: 'unused-but-required' },
    })

    await createSession({
      payload,
      user: { id: String(user.id), email },
    })

    const res = await payload.find({
      collection: AUDIT,
      limit: 5,
      overrideAccess: true,
      sort: '-occurredAt',
      where: {
        and: [{ action: { equals: 'auth.login.success' } }, { docId: { equals: String(user.id) } }],
      },
    })
    expect(res.docs).toHaveLength(1)
    expect((res.docs[0] as { docTitle?: string }).docTitle).toBe(email)
  })

  it('invalidating sessions writes auth.logout via emitAuthEvent', async () => {
    const email = `pwless-out-${Date.now()}@payload-audit.local`
    const user = await payload.create({
      collection: 'users',
      data: { email, password: 'unused-but-required' },
    })

    await createSession({
      payload,
      user: { id: String(user.id), email },
    })
    await invalidateAllUserSessions(payload, String(user.id))

    const res = await payload.find({
      collection: AUDIT,
      limit: 5,
      overrideAccess: true,
      sort: '-occurredAt',
      where: {
        and: [{ action: { equals: 'auth.logout' } }, { docId: { equals: String(user.id) } }],
      },
    })
    expect(res.docs.length).toBeGreaterThanOrEqual(1)
  })
})
