import { expect, test } from '@playwright/test'

import { auditRowsContaining, createDoc, loginAsDevUser } from './helpers'

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

  test('REST API request captures IP and user agent in audit entry', async ({ page }) => {
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

    // Query the audit logs via REST API to verify the entry.
    const auditRes = await page.request.get(
      `/api/audit-logs?where[and][0][entityCollection][equals]=posts&where[and][1][docId][equals]=${docId}&sort=-occurredAt&limit=1`,
    )
    expect(auditRes.status()).toBe(200)
    const auditBody = (await auditRes.json()) as { docs: Array<Record<string, any>> }

    const [entry] = auditBody.docs
    expect(entry).toBeDefined()
    expect(entry.ipAddress).toBe(ip)
    expect(entry.userAgent).toBe(ua)
  })
})
