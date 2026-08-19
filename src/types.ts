import type { Access, PayloadRequest } from 'payload'

/**
 * The slug of the collection that stores audit log entries when no custom
 * `collectionSlug` is provided.
 */
export const DEFAULT_AUDIT_COLLECTION_SLUG = 'audit-logs'

/**
 * Every kind of event the plugin can record.
 *
 * - `create` / `update` / `delete` — standard document lifecycle events.
 * - `file_upload` / `file_delete` — create/delete on an upload-enabled
 *   collection, where the document itself represents a stored file.
 *
 * Custom action types configured via `extraActions` are also accepted while
 * preserving autocomplete for the built-in actions.
 */
export type AuditAction =
  | 'create'
  | 'delete'
  | 'file_delete'
  | 'file_upload'
  | 'update'
  | ({} & string)

/**
 * Retention policy for audit log entries. Both limits may be set at once; a
 * prune run removes any entry that violates either rule (age first, then count).
 * Enforced by a Payload scheduled task registered when a limit is configured.
 */
export interface AuditRetentionConfig {
  /**
   * Cron expression for the prune task's schedule.
   * Default: `0 0 * * *` (daily at midnight).
   */
  cron?: string
  /**
   * Register the prune task but without a schedule, so it only runs when
   * triggered manually (e.g. via `payload.jobs.queue`). Default: `false`.
   */
  disableSchedule?: boolean
  /** Delete entries older than this many days. Disabled when undefined. */
  maxAge?: number
  /** Keep at most this many entries; oldest beyond the limit are removed. */
  maxEntries?: number
  /** Queue the prune task is scheduled on. Default: `default`. */
  queue?: string
}

/**
 * Access control overrides for the audit log collection. Only `read` is
 * configurable — create/update/delete are always denied so the trail stays
 * immutable (entries are written internally with `overrideAccess`).
 */
export interface AuditAccessConfig {
  /** Read access for audit log entries. Default: any authenticated user. */
  read?: Access
}

/**
 * Optional multi-tenant support. When enabled, the audit log collection gains a
 * `tenant` relationship and each entry records the tenant of the audited
 * document, so logs can be scoped per tenant.
 *
 * Designed to interoperate with `@payloadcms/plugin-multi-tenant`:
 *
 * | Multi-tenant plugin option | Audit plugin option        |
 * |----------------------------|----------------------------|
 * | `tenantField.name`         | `tenantFieldName`          |
 * | `tenantsSlug`              | `tenantsCollectionSlug`    |
 *
 * To enforce tenant-scoped read access in the admin UI, also register the audit
 * collection with the multi-tenant plugin's `collections` option.
 */
export interface AuditMultiTenantConfig {
  /**
   * When `true`, the plugin scans the host app's collections for a field named
   * `tenantFieldName` and automatically enables multi-tenant mode if at least
   * one audited collection has it. (`@payloadcms/plugin-multi-tenant` adds the tenant field).
   */
  autoDetect?: boolean
  /** Turn multi-tenant support on. Default: `false`. */
  enabled?: boolean
  /**
   * Name of the tenant field on audited documents and on the audit collection.
   * Maps to `tenantField.name` in `@payloadcms/plugin-multi-tenant`.
   * Default: `tenant`.
   */
  tenantFieldName?: string
  /**
   * Slug of the tenants collection for the relationship.
   * Maps to `tenantsSlug` in `@payloadcms/plugin-multi-tenant`.
   * Default: `tenants`.
   */
  tenantsCollectionSlug?: string
}

/**
 * Forensic metadata captured alongside each audit entry to aid breach
 * investigation. All fields are opt-in so existing installations do not gain
 * new collection fields or captured data without explicit configuration.
 *
 * The token fingerprint is designed for the exact scenario where a credential
 * has been stolen: it lets you correlate every action performed with the same
 * token (and see where it first appeared) without ever persisting the token
 * itself. Only a non-reversible prefix + SHA-256 hash is stored.
 */
export interface AuditForensicsConfig {
  /**
   * Record which auth strategy authenticated the request
   * (e.g. `local-jwt`, `local-api-key`, `cookie`, or a custom strategy name
   * exposed via `req.user._strategy`). Default: `true`.
   *
   * Always safe — no sensitive data, just the strategy identifier.
   */
  authStrategy?: boolean
  /**
   * Record the HTTP method of the originating request (GET, POST, …).
   * Default: `true`.
   */
  requestMethod?: boolean
  /**
   * Record the request URL path (without query string). Default: `false`.
   *
   * Warning: paths may contain sensitive data (document IDs, PII-derived
   * slugs). Enable only when the forensic value outweighs the sensitivity.
   * Query strings are always stripped.
   */
  requestPath?: boolean
  /**
   * Record a non-reversible fingerprint of the auth token used for the
   * request, enabling correlation of all actions performed with the same
   * token. Default: `false`.
   *
   * The fingerprint is `<prefix8>:<sha256(rest)>` — the first 8 characters of
   * the token (so a user can recognise which of their tokens it was) followed
   * by the SHA-256 hash of the full token. The raw token is never stored.
   *
   * Extracted from the `Authorization: Bearer <token>` header (JWT/session
   * tokens) and the `Payload-API-Key` header (API keys). Cookie-based session
   * auth does not expose a bearer token in a stable header, so no fingerprint
   * is recorded for those requests (the `authStrategy` field still identifies
   * them).
   */
  tokenFingerprint?: boolean
}

/**
 * Custom action type beyond the built-in lifecycle events. Either a plain
 * string or an object with `value` and an optional `label` for the select UI.
 */
export interface AuditExtraAction {
  /** Label shown in the admin select and list view. */
  label?: string
  /** Value stored in the audit entry (e.g. `impersonation.started`). */
  value: string
}

/**
 * Shape of a user object involved in delegation. Mirrors the relevant subset
 * of `req.user` so the plugin can resolve polymorphic relationships and keep
 * denormalised snapshots without coupling to a host app's generated types.
 */
export interface AuditDelegationUser {
  /**
   * Optional nested delegator. RFC 8693 `act` claims can be chained, so a single
   * request may carry User → Agent → Service identity information.
   */
  _delegatedBy?: AuditDelegationUser
  /** Auth collection slug, required when multiple auth collections exist. */
  collection?: string
  /** Email snapshot for the audit trail. */
  email?: string
  /** Document id of the user. */
  id?: number | string
  /** Display name snapshot for the audit trail. */
  name?: string
}

/**
 * Entry in the serialised delegation chain stored on each audit log entry.
 */
export interface AuditDelegationChainEntry {
  collection?: string
  email?: string
  id?: number | string
  name?: string
}

/**
 * Controls delegation-aware audit logging (RFC 8693 `act` semantics).
 *
 * When enabled, the audit collection gains `onBehalfOf` relationship and
 * snapshot fields and `writeAuditLog` resolves the delegator/actor from
 * `req.user._delegatedBy`.
 */
export interface AuditDelegationConfig {
  /**
   * Turn delegation-aware fields and resolution on. Default: `true`.
   *
   * The fields are still only populated when a request actually carries
   * delegation information (`req.user._delegatedBy`), so enabling this does
   * not add empty noise to non-delegated actions.
   */
  enabled?: boolean
  /**
   * Maximum depth of nested delegation chains to store in `delegationChain`.
   * Deeper levels are counted in `delegationChainDropped`. Default: `10`.
   */
  maxChainDepth?: number
}

/**
 * Configuration accepted by {@link auditLogPlugin}.
 */
export interface AuditLogPluginConfig {
  /** Access control for the audit log collection. */
  access?: AuditAccessConfig
  /**
   * Override the slug of the generated audit log collection.
   * Default: `audit-logs`.
   */
  collectionSlug?: string
  /**
   * Delegation-aware audit logging (RFC 8693 `act` claim semantics). Default:
   * enabled with a maximum chain depth of 10.
   */
  delegation?: AuditDelegationConfig
  /**
   * Collection slugs that should NOT be audited. The audit log collection
   * itself is always excluded. Default: `[]`.
   */
  disabledCollections?: string[]
  /** Master switch. When `false`, the plugin is a no-op. Default: `true`. */
  enabled?: boolean
  /**
   * Custom action types beyond the built-in lifecycle events (e.g.
   * `impersonation.started`). Useful for manually emitted audit entries or
   * delegated/impersonation-specific events.
   */
  extraActions?: Array<AuditExtraAction | string>
  /**
   * Forensic metadata to capture alongside each audit entry (auth strategy,
   * token fingerprint, HTTP method, request path). All opt-in except
   * `authStrategy` and `requestMethod`, which default to `true`.
   */
  forensics?: AuditForensicsConfig
  /** Optional multi-tenant support. Disabled unless `enabled` is `true`. */
  multiTenant?: AuditMultiTenantConfig
  /** Retention policy. When omitted, entries are kept indefinitely. */
  retention?: AuditRetentionConfig
}

/** Arguments shared by the generated audit hooks. */
export interface AuditHookOptions {
  /** Slug of the collection that stores audit entries. */
  auditCollectionSlug: string
  /** Auth-enabled collection slugs, used to shape the `actor` relationship. */
  authCollectionSlugs: string[]
  /** Slug of the collection being audited. */
  collectionSlug: string
  /**
   * Delegation configuration passed through to `writeAuditLog`. Controls
   * whether `onBehalfOf` and `delegationChain` fields are written.
   */
  delegation?: AuditDelegationConfig
  /**
   * Resolved forensic capture flags. When a flag is `false` the corresponding
   * metadata is neither extracted nor written, keeping entries lean.
   */
  forensics?: {
    authStrategy: boolean
    requestMethod: boolean
    requestPath: boolean
    tokenFingerprint: boolean
  }
  /** Whether the audited collection is upload-enabled (stores files). */
  isUpload: boolean
  /**
   * When multi-tenant support is on, the tenant field name to read from the
   * audited document and write onto the audit entry. Undefined disables it.
   */
  tenantFieldName?: string
  /**
   * Snapshot of the tenant's display name, extracted when the tenant field is
   * populated (best-effort). Survives deletion of the tenant document.
   */
  tenantName?: string
  /** The audited collection's `admin.useAsTitle` field, if any. */
  useAsTitle?: string
}

/** Request-derived metadata captured alongside each audit entry. */
export interface RequestMeta {
  /** Auth strategy that authenticated the request, e.g. `local-jwt`. */
  authStrategy?: string
  ipAddress?: string
  /** HTTP method of the originating request, e.g. `POST`. */
  requestMethod?: string
  /** Request URL path (query string stripped). */
  requestPath?: string
  /**
   * Non-reversible fingerprint of the auth token: `<prefix8>:<sha256(token)>`.
   * The raw token is never stored.
   */
  tokenFingerprint?: string
  userAgent?: string
}

/**
 * Payload's `RequestContext` is loosely typed. Setting `skipAuditLog: true` on
 * a request's `context` suppresses audit logging for that single operation —
 * useful when a consumer emits a more specific entry manually.
 */
export interface AuditRequestContext {
  skipAuditLog?: boolean
}

export type { Access, PayloadRequest }
