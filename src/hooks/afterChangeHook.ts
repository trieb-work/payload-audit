import type { CollectionAfterChangeHook } from 'payload'

import type { AuditAction, AuditHookOptions, AuditRequestContext } from '../types'

import { extractTenant } from '../utils/extractTenant'
import { resolveDocTitle } from '../utils/resolveDocTitle'
import { writeAuditLog } from '../utils/writeAuditLog'

/**
 * Builds an `afterChange` hook that records a create or update audit entry.
 *
 * On upload-enabled collections a create is recorded as `file_upload`, since
 * the document represents a newly stored file; everything else maps to the
 * standard `create` / `update` actions.
 *
 * Failures are logged but never thrown — audit logging must not break the
 * operation that triggered it. Setting `context.skipAuditLog = true` opts a
 * single operation out (e.g. when a consumer records a more specific entry).
 */
export function createAuditAfterChangeHook(options: AuditHookOptions): CollectionAfterChangeHook {
  const {
    auditCollectionSlug,
    authCollectionSlugs,
    collectionSlug,
    isUpload,
    tenantFieldName,
    useAsTitle,
  } = options

  return async ({ context, doc, operation, req }) => {
    if ((context as AuditRequestContext)?.skipAuditLog === true) {
      return doc
    }

    const action: AuditAction =
      operation === 'create' ?
        isUpload ? 'file_upload'
        : 'create'
      : 'update'

    try {
      await writeAuditLog({
        action,
        auditCollectionSlug,
        authCollectionSlugs,
        collection: collectionSlug,
        docId: String(doc.id),
        docTitle: resolveDocTitle(doc, doc.id, useAsTitle),
        req,
        tenant: tenantFieldName ? extractTenant(doc, tenantFieldName) : undefined,
        tenantFieldName,
      })
    } catch (error) {
      req.payload.logger.error(
        { collection: collectionSlug, docId: doc?.id, err: error, operation },
        '[payload-audit] Failed to write audit log (afterChange)',
      )
    }

    return doc
  }
}
