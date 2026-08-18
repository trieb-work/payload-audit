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

/**
 * Logs in via the REST API and returns the JWT token. Used for tests that need
 * to send authenticated requests with a Bearer token (e.g. to exercise token
 * fingerprint capture).
 */
export async function loginViaApi(
  page: Page,
  email: string = DEV_USER.email,
  password: string = DEV_USER.password,
): Promise<string> {
  const res = await page.request.post('/api/users/login', {
    data: { email, password },
  })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { token: string }
  expect(body.token).toBeTruthy()
  return body.token
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

/**
 * Fetches the newest audit entry for a given collection + docId via the REST
 * API. Requires an authenticated session (cookie or Bearer token) on `page`.
 */
export async function newestAuditEntry(
  page: Page,
  collection: string,
  docId: string,
): Promise<Record<string, any>> {
  const res = await page.request.get(
    `/api/audit-logs?where[and][0][entityCollection][equals]=${collection}&where[and][1][docId][equals]=${docId}&sort=-occurredAt&limit=1`,
  )
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { docs: Array<Record<string, any>> }
  expect(body.docs[0]).toBeDefined()
  return body.docs[0]
}
