import type { AuditRequestContext } from '../types'

/**
 * Returns whether a document lifecycle hook should skip writing an audit entry.
 *
 * `skipAuditLog` is an explicit consumer opt-out for the current operation.
 * `skipAuthInternalAudit` is set during Payload auth operations and only
 * suppresses writes on auth collections (sessions / loginAttempts updates).
 */
export function shouldSkipDocumentAudit(
  context: unknown,
  collectionSlug: string,
  authCollectionSlugs: string[],
): boolean {
  const ctx = context as AuditRequestContext | undefined
  if (ctx?.skipAuditLog === true) {
    return true
  }
  return ctx?.skipAuthInternalAudit === true && authCollectionSlugs.includes(collectionSlug)
}
