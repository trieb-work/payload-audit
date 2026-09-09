import { describe, expect, it } from 'vitest'

import { shouldSkipDocumentAudit } from '../../../src/utils/shouldSkipDocumentAudit'

describe('shouldSkipDocumentAudit', () => {
  const authSlugs = ['users']

  it('skips any collection when skipAuditLog is set', () => {
    expect(shouldSkipDocumentAudit({ skipAuditLog: true }, 'posts', authSlugs)).toBe(true)
  })

  it('skips only auth collections when skipAuthInternalAudit is set', () => {
    expect(shouldSkipDocumentAudit({ skipAuthInternalAudit: true }, 'users', authSlugs)).toBe(true)
    expect(shouldSkipDocumentAudit({ skipAuthInternalAudit: true }, 'posts', authSlugs)).toBe(false)
  })
})
