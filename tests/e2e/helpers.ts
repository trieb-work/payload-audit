import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'

/** Seeded in `dev/seed.ts`. */
export const DEV_USER = { email: 'dev@payload-audit.local', password: 'test' }

/** Logs in to the admin panel and waits for the dashboard to render. */
export async function loginAsDevUser(page: Page): Promise<void> {
  await page.goto('/admin')
  await page.fill('#field-email', DEV_USER.email)
  await page.fill('#field-password', DEV_USER.password)
  await page.click('.form-submit button')
  await page.waitForURL(/\/admin(\?.*)?$/, { timeout: 30_000 })
}

/** Creates a document in a collection via the admin "create" view, returns its title. */
export async function createDoc(page: Page, slug: string, title: string): Promise<string> {
  await page.goto(`/admin/collections/${slug}/create`)
  await page.fill('#field-title', title)
  await page.click('#action-save')
  // Payload shows a success toast and switches the URL to the edit view.
  await expect(page.locator('.payload-toast-container')).toContainText(/successfully/i, {
    timeout: 30_000,
  })
  return title
}

/**
 * Returns the number of rows in the audit-logs list view that contain the given
 * text (e.g. a document title or action). Navigates to the list first.
 */
export async function auditRowsContaining(page: Page, text: string): Promise<number> {
  await page.goto('/admin/collections/audit-logs?limit=100&sort=-occurredAt')
  await page.waitForSelector('.collection-list, .no-results', { timeout: 30_000 })
  return page.locator('.table .row-1, .table tbody tr').filter({ hasText: text }).count()
}
