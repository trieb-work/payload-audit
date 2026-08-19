import type {
  AuditAction,
  AuditDelegationConfig,
  AuditDelegationUser,
  PayloadRequest,
} from '../types'

import { type ExtractForensicsOptions, extractRequestMeta } from './extractRequestMeta'
import { resolveDelegation } from './resolveDelegation'

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
  /**
   * Delegation configuration. Controls whether `onBehalfOf` and
   * `delegationChain` fields are written.
   */
  delegation?: AuditDelegationConfig
  /** ID of the audited document. */
  docId: string
  /** Human-readable label for the audited document, if resolvable. */
  docTitle?: string
  /**
   * Forensic capture flags. When a flag is `false` the corresponding metadata
   * is neither extracted nor written. Omit entirely to capture only IP + UA.
   */
  forensics?: ExtractForensicsOptions
  /**
   * Explicit delegation override. When provided, this user is recorded as the
   * party on whose behalf the action was performed, regardless of
   * `req.user._delegatedBy`.
   */
  onBehalfOf?: AuditDelegationUser
  /** The originating request (provides actor, IP, user agent, transaction). */
  req: PayloadRequest
  /** Tenant id of the audited document (multi-tenant mode only). */
  tenant?: number | string
  /** Field name under which to store the tenant (multi-tenant mode only). */
  tenantFieldName?: string
  /**
   * Snapshot of the tenant's display name (multi-tenant mode only).
   * Best-effort: only set when the tenant field is populated.
   */
  tenantName?: string
}

/**
 * Resolves the value written to a relationship field pointing at an auth
 * collection user.
 *
 * For a single auth collection the field is a plain relationship, so the raw
 * user ID is returned. For multiple auth collections the field is polymorphic
 * and Payload expects a `{ relationTo, value }` shape.
 */
function resolveActorValue(
  user: AuditDelegationUser,
  authCollectionSlugs: string[],
): { relationTo: string; value: number | string } | null | number | string {
  if (user.id == null) {
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
  const {
    action,
    auditCollectionSlug,
    authCollectionSlugs,
    collection,
    delegation,
    docId,
    docTitle,
    forensics,
    onBehalfOf,
    req,
    tenant,
    tenantFieldName,
    tenantName,
  } = args

  const { authStrategy, ipAddress, requestMethod, requestPath, tokenFingerprint, userAgent } =
    extractRequestMeta(req, forensics)

  const delegationEnabled = delegation?.enabled !== false
  const resolvedDelegation =
    delegationEnabled ? resolveDelegation(req, delegation, onBehalfOf) : null

  // Determine the actor relationship value and its denormalised snapshot.
  // When delegation is present, the actor is the delegator; otherwise it is
  // the direct request user.
  const actorUser =
    resolvedDelegation?.actor ?? (req.user as AuditDelegationUser | null | undefined)
  const actor = actorUser ? resolveActorValue(actorUser, authCollectionSlugs) : null

  const user = req.user as {
    email?: string
    id?: number | string
    name?: string
  } | null

  const data: Record<string, unknown> = {
    action,
    actor: actor ?? undefined,
    actorEmail: (actorUser?.email ?? user?.email) || undefined,
    actorName: (actorUser?.name ?? user?.name) || undefined,
    docId,
    docTitle,
    entityCollection: collection,
    ipAddress,
    occurredAt: new Date().toISOString(),
    userAgent,
  }

  // Delegation-aware fields — only written when delegation is enabled and
  // information is actually available.
  if (delegationEnabled && resolvedDelegation?.onBehalfOf) {
    const delegatedUser = resolvedDelegation.onBehalfOf
    data.onBehalfOf = resolveActorValue(delegatedUser, authCollectionSlugs) ?? undefined
    data.onBehalfOfEmail = delegatedUser.email || undefined
    data.onBehalfOfName = delegatedUser.name || undefined

    if (resolvedDelegation.chain.length > 0) {
      data.delegationChain = resolvedDelegation.chain
      data.delegationChainDropped = resolvedDelegation.dropped
    }
  }

  // Forensic metadata — only set when the operator has enabled capture, so
  // disabled fields stay absent rather than being written as `undefined`.
  if (forensics?.authStrategy && authStrategy) {
    data.authStrategy = authStrategy
  }
  if (forensics?.requestMethod && requestMethod) {
    data.requestMethod = requestMethod
  }
  if (forensics?.requestPath && requestPath) {
    data.requestPath = requestPath
  }
  if (forensics?.tokenFingerprint && tokenFingerprint) {
    data.tokenFingerprint = tokenFingerprint
  }

  // Attach the tenant when multi-tenant mode is active and a tenant is known.
  if (tenantFieldName && tenant != null) {
    data[tenantFieldName] = tenant
    data.tenantId = String(tenant)
  }
  if (tenantName != null) {
    data.tenantName = tenantName
  }

  const payload = req.payload as unknown as LooseCreatePayload

  await payload.create({
    collection: auditCollectionSlug,
    data,
    overrideAccess: true,
    req,
  })
}
