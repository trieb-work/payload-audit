import { describe, expect, it, vi } from 'vitest'

import type { PayloadRequest } from '../../../src/types'

import { writeAuditLog } from '../../../src/utils/writeAuditLog'

const headers = () =>
  new Headers({ 'user-agent': 'unit-test/1.0', 'x-forwarded-for': '203.0.113.1' })

const mockPayload = () => {
  const create = vi.fn().mockResolvedValue(undefined)
  return { create } as unknown as { create: ReturnType<typeof vi.fn> }
}

const makeReq = (user: any, payload: any) =>
  ({ headers: headers(), payload, user }) as unknown as PayloadRequest

describe('writeAuditLog (resolveActorValue edge cases)', () => {
  it('COPILIT #4: returns null actor when multiple auth collections but user.collection is missing', async () => {
    const payload = mockPayload()

    await writeAuditLog({
      action: 'create',
      auditCollectionSlug: 'audit-logs',
      authCollectionSlugs: ['users', 'customers'],
      collection: 'posts',
      docId: '1',
      docTitle: 'test',
      req: makeReq({ id: 'user-1', email: 'u@example.com' }, payload),
    })

    const data = payload.create.mock.calls[0]?.[0]?.data
    expect(data.actor).toBeUndefined()
  })

  it('COPILIT #4: returns null actor when authCollectionSlugs is empty', async () => {
    const payload = mockPayload()

    await writeAuditLog({
      action: 'create',
      auditCollectionSlug: 'audit-logs',
      authCollectionSlugs: [],
      collection: 'posts',
      docId: '1',
      docTitle: 'test',
      req: makeReq({ id: 'user-1', email: 'u@example.com' }, payload),
    })

    const data = payload.create.mock.calls[0]?.[0]?.data
    expect(data.actor).toBeUndefined()
  })

  it('returns polymorphic value when multiple auth collections and user.collection is set', async () => {
    const payload = mockPayload()

    await writeAuditLog({
      action: 'create',
      auditCollectionSlug: 'audit-logs',
      authCollectionSlugs: ['users', 'customers'],
      collection: 'posts',
      docId: '1',
      docTitle: 'test',
      req: makeReq({ id: 'user-1', collection: 'customers', email: 'c@example.com' }, payload),
    })

    const data = payload.create.mock.calls[0]?.[0]?.data
    expect(data.actor).toEqual({ relationTo: 'customers', value: 'user-1' })
  })
})
