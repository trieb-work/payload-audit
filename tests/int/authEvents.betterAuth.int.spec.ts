import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../dev/e2e-better-auth/payload.config'

let payload: Payload

const AUDIT = 'audit-logs' as never

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.destroy?.()
})

describe('auth events (Better Auth / payload-auth)', () => {
  it('creating a Better Auth session document writes auth.login.success', async () => {
    const slugs = payload.config.collections.map((c) => c.slug)
    const sessionSlug = slugs.find((slug) => /session/i.test(slug))
    expect(sessionSlug, `collections: ${slugs.join(', ')}`).toBeTruthy()

    const email = `ba-${Date.now()}@payload-audit.local`
    const user = await payload.create({
      collection: 'users',
      data: { name: 'BA User', email, password: 'test-pass-1' } as never,
    })

    await payload.create({
      collection: sessionSlug as never,
      data: {
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        token: `ba-token-${Date.now()}`,
        updatedAt: new Date().toISOString(),
        user: user.id,
        userId: String(user.id),
      } as never,
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
    expect(res.docs.length).toBeGreaterThanOrEqual(1)
  })
})
