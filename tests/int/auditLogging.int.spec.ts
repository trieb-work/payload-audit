import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../dev/payload.config'
import { pruneAuditLogs } from '../../src/tasks/pruneAuditLogs'

let payload: Payload

const AUDIT = 'audit-logs' as never

const headers = () =>
  new Headers({ 'user-agent': 'int-test/1.0', 'x-forwarded-for': '203.0.113.7' })

/** Audit entries for a given collection + docId, newest first. */
const entriesFor = async (collection: string, docId: string) => {
  const res = await payload.find({
    collection: AUDIT,
    limit: 50,
    overrideAccess: true,
    sort: '-occurredAt',
    where: { and: [{ entityCollection: { equals: collection } }, { docId: { equals: docId } }] },
  })
  return res.docs as Array<Record<string, any>>
}

const countAll = async () =>
  (await payload.count({ collection: AUDIT, overrideAccess: true })).totalDocs

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.destroy?.()
})

describe('audit logging (create / update / delete)', () => {
  it('logs create then update then delete with IP, user agent and title', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Hello' },
      req: { headers: headers() } as never,
    })
    const id = String(post.id)

    await payload.update({
      id: post.id,
      collection: 'posts',
      data: { title: 'Hello edited' },
      req: { headers: headers() } as never,
    })
    await payload.delete({ id: post.id, collection: 'posts', req: { headers: headers() } as never })

    const entries = await entriesFor('posts', id)
    const actions = entries.map((e) => e.action)
    expect(actions).toContain('create')
    expect(actions).toContain('update')
    expect(actions).toContain('delete')

    const createEntry = entries.find((e) => e.action === 'create')!
    expect(createEntry.ipAddress).toBe('203.0.113.7')
    expect(createEntry.userAgent).toBe('int-test/1.0')
    expect(createEntry.docTitle).toBe('Hello')
  })

  it('does not audit collections listed in disabledCollections', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Untracked' },
      req: { headers: headers() } as never,
    })
    const entries = await entriesFor('pages', String(page.id))
    expect(entries).toHaveLength(0)
  })
})

describe('audit logging (uploads)', () => {
  it('records file_upload on create and file_delete on delete', async () => {
    const media = await payload.create({
      collection: 'media',
      data: {},
      file: { name: 'note.txt', data: Buffer.from('hello'), mimetype: 'text/plain', size: 5 },
      req: { headers: headers() } as never,
    })
    const id = String(media.id)

    await payload.delete({
      id: media.id,
      collection: 'media',
      req: { headers: headers() } as never,
    })

    const actions = (await entriesFor('media', id)).map((e) => e.action)
    expect(actions).toContain('file_upload')
    expect(actions).toContain('file_delete')
  })
})

describe('audit logging (multi-tenant)', () => {
  it('records the tenant of the audited document', async () => {
    const tenant = (await payload.create({
      collection: 'tenants' as never,
      data: { name: 'Acme' } as never,
      overrideAccess: true,
    })) as { id: number | string }
    const post = await payload.create({
      collection: 'posts',
      data: { tenant: tenant.id, title: 'Scoped' } as never,
      req: { headers: headers() } as never,
    })

    const [entry] = await entriesFor('posts', String(post.id))
    const tenantId = typeof entry.tenant === 'object' ? entry.tenant?.id : entry.tenant
    expect(String(tenantId)).toBe(String(tenant.id))

    // Denormalised snapshots survive tenant deletion.
    expect(entry.tenantId).toBe(String(tenant.id))
    expect(entry.tenantName).toBe('Acme')
  })
})

describe('audit logging (immutability)', () => {
  it('denies creating audit entries through the API without overrideAccess', async () => {
    await expect(
      payload.create({
        collection: AUDIT,
        data: { action: 'create', docId: 'x', entityCollection: 'posts' } as never,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/not allowed to perform this action/i)
  })
})

describe('retention pruning', () => {
  it('count-based pruning keeps only the newest maxEntries', async () => {
    for (let i = 0; i < 6; i++) {
      await payload.create({
        collection: 'posts',
        data: { title: `bulk-${i}` },
        req: { headers: headers() } as never,
      })
    }

    const result = await pruneAuditLogs({
      auditCollectionSlug: 'audit-logs',
      maxEntries: 2,
      payload,
    })
    expect(await countAll()).toBe(2)
    expect(result.deletedByCount).toBeGreaterThan(0)
  })

  it('age-based pruning removes entries older than maxAge days', async () => {
    await payload.create({
      collection: AUDIT,
      data: {
        action: 'create',
        docId: 'ancient',
        entityCollection: 'posts',
        occurredAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      } as never,
      overrideAccess: true,
    })

    const before = await countAll()
    const result = await pruneAuditLogs({ auditCollectionSlug: 'audit-logs', maxAge: 90, payload })
    expect(result.deletedByAge).toBeGreaterThanOrEqual(1)
    expect(await countAll()).toBe(before - result.deletedByAge)
  })
})
