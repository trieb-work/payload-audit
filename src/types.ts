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
 */
export type AuditAction = 'create' | 'delete' | 'file_delete' | 'file_upload' | 'update'

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
   * Collection slugs that should NOT be audited. The audit log collection
   * itself is always excluded. Default: `[]`.
   */
  disabledCollections?: string[]
  /** Master switch. When `false`, the plugin is a no-op. Default: `true`. */
  enabled?: boolean
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
  /** Whether the audited collection is upload-enabled (stores files). */
  isUpload: boolean
  /** The audited collection's `admin.useAsTitle` field, if any. */
  useAsTitle?: string
}

/** Request-derived metadata captured alongside each audit entry. */
export interface RequestMeta {
  ipAddress?: string
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
