import config from '@payload-config'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { writeAuditLog } from '../../../../../src/utils/writeAuditLog'

const configPromise = Promise.resolve(config)

/**
 * Test-only endpoint that emits a delegated audit entry. Useful for E2E
 * tests because the default auth pipeline does not mint JWTs with an RFC 8693
 * `act` claim.
 */
export const POST = async () => {
  const payload = await getPayload({ config: configPromise })

  const actor = await payload.create({
    collection: 'users',
    data: { email: 'e2e-actor@payload-audit.local', password: 'test' },
  })

  const onBehalfOf = await payload.create({
    collection: 'users',
    data: { email: 'e2e-delegated@payload-audit.local', password: 'test' },
  })

  const post = await payload.create({
    collection: 'posts',
    data: { title: `e2e-delegated-${Date.now()}` },
    overrideAccess: true,
  })

  await writeAuditLog({
    action: 'impersonation.started',
    auditCollectionSlug: 'audit-logs',
    authCollectionSlugs: ['users'],
    collection: 'posts',
    delegation: { enabled: true, maxChainDepth: 10 },
    docId: String(post.id),
    docTitle: String(post.title),
    onBehalfOf: {
      id: onBehalfOf.id,
      name: 'E2E Delegated User',
      collection: 'users',
      email: 'e2e-delegated@payload-audit.local',
    },
    req: {
      headers: new Headers({
        'user-agent': 'e2e-delegation-test/1.0',
        'x-forwarded-for': '203.0.113.99',
      }),
      payload,
      url: 'http://localhost/api/delegated-action',
      user: {
        id: actor.id,
        name: 'E2E Actor',
        collection: 'users',
        email: 'e2e-actor@payload-audit.local',
      },
    } as never,
  })

  return NextResponse.json({ docId: post.id })
}
