import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../dev/payload.config'
import { pruneAuditLogs } from '../../src/tasks/pruneAuditLogs'
import { writeAuditLog } from '../../src/utils/writeAuditLog'

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

describe('audit logging (delegation)', () => {
  it('records the delegator as actor and the request user as onBehalfOf', async () => {
    const subjectUser = await payload.create({
      collection: 'users',
      data: { email: 'subject@example.com', password: 'test' },
    })
    const delegatorUser = await payload.create({
      collection: 'users',
      data: { email: 'delegator@example.com', password: 'test' },
    })

    const req = {
      headers: headers(),
      payload,
      user: {
        id: subjectUser.id,
        name: 'Subject User',
        _delegatedBy: {
          id: delegatorUser.id,
          name: 'Delegator User',
          collection: 'users',
          email: 'delegator@example.com',
        },
        collection: 'users',
        email: 'subject@example.com',
      },
    } as never

    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Delegated action' },
      req,
    })

    const [entry] = await entriesFor('posts', String(post.id))
    expect(entry.action).toBe('create')
    expect(entry.actor).toMatchObject({ id: delegatorUser.id })
    expect(entry.actorEmail).toBe('delegator@example.com')
    expect(entry.actorName).toBe('Delegator User')
    expect(entry.onBehalfOf).toMatchObject({ id: subjectUser.id })
    expect(entry.onBehalfOfEmail).toBe('subject@example.com')
    expect(entry.onBehalfOfName).toBe('Subject User')
    expect(entry.delegationChain).toEqual([
      {
        id: delegatorUser.id,
        name: 'Delegator User',
        collection: 'users',
        email: 'delegator@example.com',
      },
    ])
    expect(entry.delegationChainDropped).toBe(0)
  })

  it('records a nested delegation chain', async () => {
    const subjectUser = await payload.create({
      collection: 'users',
      data: { email: 'nested-subject@example.com', password: 'test' },
    })
    const agentUser = await payload.create({
      collection: 'users',
      data: { email: 'nested-agent@example.com', password: 'test' },
    })
    const adminUser = await payload.create({
      collection: 'users',
      data: { email: 'nested-admin@example.com', password: 'test' },
    })

    const req = {
      headers: headers(),
      payload,
      user: {
        id: subjectUser.id,
        _delegatedBy: {
          id: agentUser.id,
          _delegatedBy: {
            id: adminUser.id,
            collection: 'users',
          },
          collection: 'users',
        },
        collection: 'users',
      },
    } as never

    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Nested delegation' },
      req,
    })

    const [entry] = await entriesFor('posts', String(post.id))
    expect(entry.actor).toMatchObject({ id: agentUser.id })
    expect(entry.onBehalfOf).toMatchObject({ id: subjectUser.id })
    expect(entry.delegationChain).toEqual([
      { id: agentUser.id, collection: 'users' },
      { id: adminUser.id, collection: 'users' },
    ])
  })

  it('allows explicit onBehalfOf override via writeAuditLog', async () => {
    const actorUser = await payload.create({
      collection: 'users',
      data: { email: 'actor-override@example.com', password: 'test' },
    })
    const overriddenUser = await payload.create({
      collection: 'users',
      data: { email: 'overridden@example.com', password: 'test' },
    })

    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Manual override' },
      req: { headers: headers() } as never,
    })

    await writeAuditLog({
      action: 'impersonation.started',
      auditCollectionSlug: 'audit-logs',
      authCollectionSlugs: ['users'],
      collection: 'posts',
      delegation: { enabled: true },
      docId: String(post.id),
      docTitle: 'Manual override',
      onBehalfOf: {
        id: overriddenUser.id,
        name: 'Overridden User',
        collection: 'users',
        email: 'overridden@example.com',
      },
      req: {
        headers: headers(),
        payload,
        user: {
          id: actorUser.id,
          name: 'Actor User',
          collection: 'users',
          email: 'actor-override@example.com',
        },
      } as never,
    })

    // Lifecycle create entry is the newest after the manual write because of
    // sort -occurredAt, so filter by action.
    const manualEntry = (await entriesFor('posts', String(post.id))).find(
      (e) => e.action === 'impersonation.started',
    )
    expect(manualEntry).toBeDefined()
    expect(manualEntry!.actor).toMatchObject({ id: actorUser.id })
    expect(manualEntry!.onBehalfOf).toMatchObject({ id: overriddenUser.id })
    expect(manualEntry!.onBehalfOfEmail).toBe('overridden@example.com')
    expect(manualEntry!.onBehalfOfName).toBe('Overridden User')
  })

  it('BUG 2: does not leak request user email/name as actorEmail/actorName when delegator lacks them', async () => {
    const subjectUser = await payload.create({
      collection: 'users',
      data: { email: 'bug2-subject@example.com', password: 'test' },
    })
    const delegatorUser = await payload.create({
      collection: 'users',
      data: { email: 'bug2-delegator@example.com', password: 'test' },
    })

    const req = {
      headers: headers(),
      payload,
      user: {
        id: subjectUser.id,
        name: 'Subject User',
        _delegatedBy: {
          id: delegatorUser.id,
          collection: 'users',
        },
        collection: 'users',
        email: 'bug2-subject@example.com',
      },
    } as never

    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Bug 2 test' },
      req,
    })

    const [entry] = await entriesFor('posts', String(post.id))
    expect(entry.actor).toMatchObject({ id: delegatorUser.id })
    expect(entry.actorEmail).not.toBe('bug2-subject@example.com')
    expect(entry.actorName).not.toBe('Subject User')
    expect(entry.onBehalfOfEmail).toBe('bug2-subject@example.com')
    expect(entry.onBehalfOfName).toBe('Subject User')
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

describe('audit logging (forensics)', () => {
  it('captures auth strategy, method, path and token fingerprint when enabled', async () => {
    const token = 'test-forensic-token-abcdef123456'
    const req = {
      headers: new Headers({
        authorization: `Bearer ${token}`,
        'user-agent': 'forensic-test/1.0',
        'x-forwarded-for': '203.0.113.99',
      }),
      method: 'POST',
      url: 'http://localhost/api/posts?foo=bar',
      // _strategy without an id: resolveActor returns null (no actor
      // relationship to validate against a non-existent user), but
      // authStrategy is still captured.
      user: { _strategy: 'local-jwt' },
    } as never

    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Forensic' },
      req,
    })

    const [entry] = await entriesFor('posts', String(post.id))
    expect(entry).toBeDefined()
    expect(entry.authStrategy).toBe('local-jwt')
    expect(entry.requestMethod).toBe('POST')
    expect(entry.requestPath).toBe('/api/posts')
    // Fingerprint = prefix8 + sha256(token); raw token must never be stored.
    expect(entry.tokenFingerprint).toMatch(/^test-for:[0-9a-f]{64}$/)
    expect(entry.tokenFingerprint).not.toContain(token)
    expect(JSON.stringify(entry)).not.toContain(token)
  })

  it('correlates two actions performed with the same token', async () => {
    const token = 'correlate-token-abcdef123456789'
    const req = {
      headers: new Headers({ authorization: `Bearer ${token}` }),
      method: 'POST',
      url: '/api/posts',
      user: { _strategy: 'local-jwt' },
    } as never

    const post1 = await payload.create({
      collection: 'posts',
      data: { title: 'Correlate A' },
      req,
    })
    const post2 = await payload.create({
      collection: 'posts',
      data: { title: 'Correlate B' },
      req,
    })

    const [entry1] = await entriesFor('posts', String(post1.id))
    const [entry2] = await entriesFor('posts', String(post2.id))
    expect(entry1.tokenFingerprint).toBeDefined()
    expect(entry1.tokenFingerprint).toBe(entry2.tokenFingerprint)
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
