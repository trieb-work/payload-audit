import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

import {
  auditRowsContaining,
  createDoc,
  loginAsDevUser,
  loginViaApi,
  newestAuditEntry,
} from './helpers'

test.describe('audit logging (admin UI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDevUser(page)
  })

  test('the Audit Logs collection is reachable', async ({ page }) => {
    await page.goto('/admin/collections/audit-logs')
    await expect(page).toHaveURL(/\/admin\/collections\/audit-logs/, { timeout: 30_000 })
    await expect(page.locator('body')).toContainText(/Audit Log/i, { timeout: 30_000 })
  })

  test('creating a post produces a create audit entry', async ({ page }) => {
    const title = `e2e-post-${Date.now()}`
    await createDoc(page, 'posts', title)

    // The trail should now contain a row referencing the new post's title.
    await expect
      .poll(() => auditRowsContaining(page, title), { timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('creating a page (disabled collection) produces no audit entry', async ({ page }) => {
    const title = `e2e-page-${Date.now()}`
    await createDoc(page, 'pages', title)

    expect(await auditRowsContaining(page, title)).toBe(0)
  })

  test('audit entries cannot be created manually (read-only collection)', async ({ page }) => {
    // The create route should not offer a usable create form for audit-logs.
    await page.goto('/admin/collections/audit-logs')
    await expect(page.locator('a.collection-list__create, #create-first-title')).toHaveCount(0)
  })

  test('REST API request captures IP, user agent and forensic metadata in audit entry', async ({
    page,
  }) => {
    const title = `e2e-api-${Date.now()}`
    const ip = '203.0.113.42'
    const ua = 'E2E-API-Test/1.0'

    // Create a post via the REST API with custom proxy headers.
    const createRes = await page.request.post('/api/posts', {
      data: { title },
      headers: {
        'User-Agent': ua,
        'X-Forwarded-For': ip,
      },
    })
    expect(createRes.status()).toBe(201)
    const body = (await createRes.json()) as { doc: { id: number | string } }
    const docId = String(body.doc.id)

    const entry = await newestAuditEntry(page, 'posts', docId)
    expect(entry.ipAddress).toBe(ip)
    expect(entry.userAgent).toBe(ua)
    // Forensic metadata (enabled in the dev config).
    expect(entry.requestMethod).toBe('POST')
    expect(entry.requestPath).toBe('/api/posts')
    // Cookie-based admin auth uses the local-jwt strategy.
    expect(entry.authStrategy).toBe('local-jwt')
  })
})

test.describe('audit logging (forensics: token fingerprint)', () => {
  test('a Bearer-token request records a non-reversible token fingerprint', async ({ page }) => {
    // Log in via the API to obtain a real JWT, then use it as a Bearer token
    // for the audited request. This exercises the token fingerprint capture
    // end-to-end through the real auth pipeline.
    const token = await loginViaApi(page)
    const title = `e2e-bearer-${Date.now()}`

    const createRes = await page.request.post('/api/posts', {
      data: { title },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    expect(createRes.status()).toBe(201)
    const body = (await createRes.json()) as { doc: { id: number | string } }
    const docId = String(body.doc.id)

    const entry = await newestAuditEntry(page, 'posts', docId)

    // Fingerprint format: <prefix8>:<sha256(token)>
    expect(entry.tokenFingerprint).toMatch(/^.{8}:[0-9a-f]{64}$/)
    // The raw token must never appear in the stored entry.
    expect(entry.tokenFingerprint).not.toContain(token)
    expect(JSON.stringify(entry)).not.toContain(token)

    // The fingerprint matches what we would compute from the known token.
    const expected = `${token.slice(0, 8)}:${createHash('sha256').update(token).digest('hex')}`
    expect(entry.tokenFingerprint).toBe(expected)

    // Bearer-token auth is also tagged with the local-jwt strategy.
    expect(entry.authStrategy).toBe('local-jwt')
  })

  test('two requests with the same token produce the same fingerprint (correlation)', async ({
    page,
  }) => {
    const token = await loginViaApi(page)

    const res1 = await page.request.post('/api/posts', {
      data: { title: `e2e-corr-a-${Date.now()}` },
      headers: { Authorization: `Bearer ${token}` },
    })
    const res2 = await page.request.post('/api/posts', {
      data: { title: `e2e-corr-b-${Date.now()}` },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res1.status()).toBe(201)
    expect(res2.status()).toBe(201)

    const doc1 = String(((await res1.json()) as { doc: { id: number | string } }).doc.id)
    const doc2 = String(((await res2.json()) as { doc: { id: number | string } }).doc.id)

    const entry1 = await newestAuditEntry(page, 'posts', doc1)
    const entry2 = await newestAuditEntry(page, 'posts', doc2)

    // Same token → same fingerprint. This is the property that lets an
    // operator correlate all actions performed with a stolen token.
    expect(entry1.tokenFingerprint).toBeDefined()
    expect(entry1.tokenFingerprint).toBe(entry2.tokenFingerprint)
  })

  test('two different tokens produce different fingerprints', async ({ page }) => {
    // Log in twice to get two distinct JWTs (Payload issues a new token per
    // login call).
    const token1 = await loginViaApi(page)
    const token2 = await loginViaApi(page)
    // Sanity: the two tokens are actually different.
    expect(token1).not.toBe(token2)

    const res1 = await page.request.post('/api/posts', {
      data: { title: `e2e-diff-a-${Date.now()}` },
      headers: { Authorization: `Bearer ${token1}` },
    })
    const res2 = await page.request.post('/api/posts', {
      data: { title: `e2e-diff-b-${Date.now()}` },
      headers: { Authorization: `Bearer ${token2}` },
    })
    expect(res1.status()).toBe(201)
    expect(res2.status()).toBe(201)

    const doc1 = String(((await res1.json()) as { doc: { id: number | string } }).doc.id)
    const doc2 = String(((await res2.json()) as { doc: { id: number | string } }).doc.id)

    const entry1 = await newestAuditEntry(page, 'posts', doc1)
    const entry2 = await newestAuditEntry(page, 'posts', doc2)

    expect(entry1.tokenFingerprint).toBeDefined()
    expect(entry2.tokenFingerprint).toBeDefined()
    expect(entry1.tokenFingerprint).not.toBe(entry2.tokenFingerprint)
  })
})

test.describe('audit logging (forensics: admin UI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDevUser(page)
  })

  test('forensic fields appear as columns in the audit-logs list view', async ({ page }) => {
    // Create a post so there is at least one entry to render.
    const title = `e2e-cols-${Date.now()}`
    await createDoc(page, 'posts', title)
    await expect
      .poll(() => auditRowsContaining(page, title), { timeout: 30_000 })
      .toBeGreaterThan(0)

    // The list view should render the forensic column headers. authStrategy
    // and tokenFingerprint are part of defaultColumns in the dev config.
    await page.goto('/admin/collections/audit-logs?limit=100&sort=-occurredAt')
    await page.waitForSelector('.collection-list, .no-results', { timeout: 30_000 })
    await expect(page.locator('thead')).toContainText(/Auth strategy/i, { timeout: 30_000 })
    await expect(page.locator('thead')).toContainText(/Token fingerprint/i, { timeout: 30_000 })
  })
})

test.describe('audit logging (delegation)', () => {
  test('records a delegated action through the API and surfaces it in the admin UI', async ({
    page,
  }) => {
    await loginAsDevUser(page)

    const res = await page.request.post('/api/delegated-action')
    expect(res.status()).toBe(200)
    const { docId } = (await res.json()) as { docId: string }

    const entry = await newestAuditEntry(page, 'posts', docId)
    expect(entry.action).toBe('impersonation.started')
    expect(entry.actorEmail).toBe('e2e-actor@payload-audit.local')
    expect(entry.onBehalfOfEmail).toBe('e2e-delegated@payload-audit.local')
    expect(entry.onBehalfOfName).toBe('E2E Delegated User')
    expect(entry.delegationChainDropped).toBe(0)

    await page.goto(`/admin/collections/audit-logs/${entry.id}`)
    await expect(page.locator('body')).toContainText(/On behalf of/i, { timeout: 30_000 })
    await expect(page.locator('body')).toContainText(/On behalf of email/i, { timeout: 30_000 })
  })
})
