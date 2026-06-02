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
})
