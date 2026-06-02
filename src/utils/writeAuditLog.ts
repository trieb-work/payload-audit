import type { AuditAction, PayloadRequest } from '../types'

import { extractRequestMeta } from './extractRequestMeta'

/**
 * Loosely-typed view of `payload.create`. The plugin is generic and must not
 * couple to a host app's generated collection types, so the audit write is
 * performed through this minimal shape rather than the strongly-typed overload.
 */
interface LooseCreatePayload {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
    req?: PayloadRequest
  }) => Promise<unknown>
}

export interface WriteAuditLogArgs {
  /** The action being recorded. */
  action: AuditAction
  /** Slug of the collection that stores audit entries. */
  auditCollectionSlug: string
  /** Auth-enabled collection slugs, used to shape the `actor` value. */
  authCollectionSlugs: string[]
  /** Slug of the audited collection. */
  collection: string
  /** ID of the audited document. */
  docId: string
  /** Human-readable label for the audited document, if resolvable. */
  docTitle?: string
  /** The originating request (provides actor, IP, user agent, transaction). */
  req: PayloadRequest
}

/**
 * Resolves the value written to the `actor` relationship field.
 *
 * For a single auth collection the field is a plain relationship, so the raw
 * user ID is returned. For multiple auth collections the field is polymorphic
 * and Payload expects a `{ relationTo, value }` shape.
 */
function resolveActor(
  req: PayloadRequest,
  authCollectionSlugs: string[],
): { relationTo: string; value: number | string } | null | number | string {
  const user = req.user as { collection?: string; id?: number | string } | null
  if (!user || user.id == null) {
    return null
  }

  if (authCollectionSlugs.length > 1 && user.collection) {
    return { relationTo: user.collection, value: user.id }
  }

  return user.id
}

/**
 * Writes a single immutable audit log entry.
 *
 * This is the only sanctioned way to create audit entries: create access on the
 * audit collection is denied for everyone, so writes go through here with
 * `overrideAccess: true`. The request is forwarded to `payload.create` so the
 * write participates in the same transaction as the operation that triggered
 * it, keeping the trail consistent with the audited change.
 */
export async function writeAuditLog(args: WriteAuditLogArgs): Promise<void> {
  const { action, auditCollectionSlug, authCollectionSlugs, collection, docId, docTitle, req } =
    args

  const { ipAddress, userAgent } = extractRequestMeta(req)
  const actor = resolveActor(req, authCollectionSlugs)

  const user = req.user as {
    email?: string
    id?: number | string
    name?: string
  } | null

  const payload = req.payload as unknown as LooseCreatePayload

  await payload.create({
    collection: auditCollectionSlug,
    data: {
      action,
      actor: actor ?? undefined,
      actorEmail: user?.email || undefined,
      actorName: user?.name || undefined,
      docId,
      docTitle,
      entityCollection: collection,
      ipAddress,
      occurredAt: new Date().toISOString(),
      userAgent,
    },
    overrideAccess: true,
    req,
  })
}
