import type { CollectionAfterDeleteHook } from 'payload'

import type { AuditAction, AuditHookOptions, AuditRequestContext } from '../types'

import { extractTenant } from '../utils/extractTenant'
import { resolveDocTitle } from '../utils/resolveDocTitle'
import { writeAuditLog } from '../utils/writeAuditLog'

/**
 * Builds an `afterDelete` hook that records a delete audit entry.
 *
 * On upload-enabled collections the action is recorded as `file_delete`, since
 * deleting the document removes the underlying stored file.
 *
 * Failures are logged but never thrown. Setting `context.skipAuditLog = true`
 * opts a single operation out.
 */
export function createAuditAfterDeleteHook(options: AuditHookOptions): CollectionAfterDeleteHook {
  const {
    auditCollectionSlug,
    authCollectionSlugs,
    collectionSlug,
    isUpload,
    tenantFieldName,
    useAsTitle,
  } = options

  return async ({ id, context, doc, req }) => {
    if ((context as AuditRequestContext)?.skipAuditLog === true) {
      return doc
    }

    const action: AuditAction = isUpload ? 'file_delete' : 'delete'

    try {
      await writeAuditLog({
        action,
        auditCollectionSlug,
        authCollectionSlugs,
        collection: collectionSlug,
        docId: String(id),
        docTitle: resolveDocTitle(doc as Record<string, unknown>, id, useAsTitle),
        req,
        tenant:
          tenantFieldName ?
            extractTenant(doc as Record<string, unknown>, tenantFieldName)
          : undefined,
        tenantFieldName,
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
