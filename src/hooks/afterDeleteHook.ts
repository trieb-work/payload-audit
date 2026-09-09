import type { CollectionAfterDeleteHook } from 'payload'

import type { AuditAction, AuditHookOptions } from '../types'

import { extractTenant, extractTenantName } from '../utils/extractTenant'
import { resolveDocTitle } from '../utils/resolveDocTitle'
import { shouldSkipDocumentAudit } from '../utils/shouldSkipDocumentAudit'
import { writeAuditLog } from '../utils/writeAuditLog'

/**
 * Builds an `afterDelete` hook that records a delete audit entry.
 *
 * On upload-enabled collections the action is recorded as `file_delete`, since
 * deleting the document removes the underlying stored file.
 *
 * Failures are logged but never thrown. See `shouldSkipDocumentAudit` for the
 * context flags that suppress logging.
 */
export function createAuditAfterDeleteHook(options: AuditHookOptions): CollectionAfterDeleteHook {
  const {
    auditCollectionSlug,
    authCollectionSlugs,
    collectionSlug,
    delegation,
    forensics,
    isUpload,
    tenantFieldName,
    useAsTitle,
  } = options

  return async ({ id, context, doc, req }) => {
    if (shouldSkipDocumentAudit(context, collectionSlug, authCollectionSlugs)) {
      return doc
    }

    const action: AuditAction = isUpload ? 'file_delete' : 'delete'

    try {
      await writeAuditLog({
        action,
        auditCollectionSlug,
        authCollectionSlugs,
        collection: collectionSlug,
        delegation,
        docId: String(id),
        docTitle: resolveDocTitle(doc as Record<string, unknown>, id, useAsTitle),
        forensics,
        req,
        tenant:
          tenantFieldName ?
            extractTenant(doc as Record<string, unknown>, tenantFieldName)
          : undefined,
        tenantFieldName,
        tenantName:
          tenantFieldName ?
            extractTenantName(doc as Record<string, unknown>, tenantFieldName)
          : undefined,
      })
    } catch (error) {
      req.payload.logger.error(
        { collection: collectionSlug, docId: id, err: error, operation: 'delete' },
        '[payload-audit] Failed to write audit log (afterDelete)',
      )
    }

    return doc
  }
}
