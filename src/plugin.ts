import type { Config, Plugin } from 'payload'

import type { AuditLogPluginConfig } from './types'

import { buildAuditLogsCollection } from './collections/auditLogs'
import { createAuditAfterChangeHook } from './hooks/afterChangeHook'
import { createAuditAfterDeleteHook } from './hooks/afterDeleteHook'
import { createPruneAuditLogsTask } from './tasks/pruneAuditLogs'
import { DEFAULT_AUDIT_COLLECTION_SLUG } from './types'

/**
 * Payload's internal collections. These are never audited: they are framework
 * bookkeeping (jobs, locks, preferences, migrations, key-value) and auditing
 * them would create noise and, in the case of `payload-jobs`, feedback from the
 * prune task itself.
 */
const PAYLOAD_INTERNAL_COLLECTIONS = [
  'payload-jobs',
  'payload-locked-documents',
  'payload-preferences',
  'payload-migrations',
  'payload-kv',
]

/**
 * Payload CMS audit logging plugin.
 *
 * Attaches `afterChange` and `afterDelete` hooks to every collection (except
 * those opted out via `disabledCollections` and the audit collection itself),
 * and registers an immutable `audit-logs` collection that records the trail.
 *
 * @example
 * ```ts
 * plugins: [
 *   auditLogPlugin({
 *     disabledCollections: ['sessions'],
 *     access: { read: ({ req }) => req.user?.role === 'admin' },
 *   }),
 * ]
 * ```
 */
export const auditLogPlugin =
  (pluginConfig: AuditLogPluginConfig = {}): Plugin =>
  (config: Config): Config => {
    if (pluginConfig.enabled === false) {
      return config
    }

    const auditCollectionSlug = pluginConfig.collectionSlug ?? DEFAULT_AUDIT_COLLECTION_SLUG

    // Never audit the audit collection itself (would recurse), Payload's
    // internal collections, or any explicitly disabled collections.
    const disabled = new Set(pluginConfig.disabledCollections ?? [])
    disabled.add(auditCollectionSlug)
    for (const slug of PAYLOAD_INTERNAL_COLLECTIONS) {
      disabled.add(slug)
    }

    const collections = config.collections ?? []

    // Auth-enabled collections shape the `actor` relationship on the trail.
    const authCollectionSlugs = collections
      .filter((collection) => Boolean(collection.auth))
      .map((collection) => collection.slug)

    // Resolve multi-tenant settings (disabled unless explicitly enabled or
    // auto-detected).
    const mt = pluginConfig.multiTenant
    const tenantFieldName = mt?.tenantFieldName ?? 'tenant'
    const tenantsCollectionSlug = mt?.tenantsCollectionSlug ?? 'tenants'

    let multiTenantEnabled = mt?.enabled ?? false
    if (mt?.autoDetect && !multiTenantEnabled) {
      for (const collection of collections) {
        if (disabled.has(collection.slug)) {
          continue
        }
        const hasTenantField = collection.fields?.some(
          (field) =>
            'name' in field &&
            typeof field.name === 'string' &&
            field.name === tenantFieldName,
        )
        if (hasTenantField) {
          multiTenantEnabled = true
          break
        }
      }
    }

    const multiTenant = multiTenantEnabled ?
      {
        tenantFieldName,
        tenantsCollectionSlug,
      }
    : undefined

    for (const collection of collections) {
      if (disabled.has(collection.slug)) {
        continue
      }

      const useAsTitle =
        typeof collection.admin?.useAsTitle === 'string' ? collection.admin.useAsTitle : undefined

      const hookOptions = {
        auditCollectionSlug,
        authCollectionSlugs,
        collectionSlug: collection.slug,
        isUpload: Boolean(collection.upload),
        tenantFieldName: multiTenant?.tenantFieldName,
        useAsTitle,
      }

      collection.hooks ??= {}
      collection.hooks.afterChange = [
        ...(collection.hooks.afterChange ?? []),
        createAuditAfterChangeHook(hookOptions),
      ]
      collection.hooks.afterDelete = [
        ...(collection.hooks.afterDelete ?? []),
        createAuditAfterDeleteHook(hookOptions),
      ]
    }

    config.collections = [
      ...collections,
      buildAuditLogsCollection({
        slug: auditCollectionSlug,
        access: pluginConfig.access,
        authCollectionSlugs,
        multiTenant,
      }),
    ]

    // Register the retention/prune task only when a limit is configured. The
    // task is appended to any existing jobs the host app already defines.
    const retention = pluginConfig.retention
    if (retention && (retention.maxAge != null || retention.maxEntries != null)) {
      const pruneTask = createPruneAuditLogsTask({
        auditCollectionSlug,
        cron: retention.cron,
        disableSchedule: retention.disableSchedule,
        maxAge: retention.maxAge,
        maxEntries: retention.maxEntries,
        queue: retention.queue,
      })

      config.jobs ??= {}
      config.jobs.tasks = [...(config.jobs.tasks ?? []), pruneTask]
    }

    return config
  }
