import type { Config, Plugin } from 'payload'

import type { AuditLogPluginConfig } from './types'

import { buildAuditLogsCollection } from './collections/auditLogs'
import { createAuditAfterChangeHook } from './hooks/afterChangeHook'
import { createAuditAfterDeleteHook } from './hooks/afterDeleteHook'
import { DEFAULT_AUDIT_COLLECTION_SLUG } from './types'

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

    // Never audit the audit collection itself (would recurse), plus any
    // explicitly disabled collections.
    const disabled = new Set(pluginConfig.disabledCollections ?? [])
    disabled.add(auditCollectionSlug)

    const collections = config.collections ?? []

    // Auth-enabled collections shape the `actor` relationship on the trail.
    const authCollectionSlugs = collections
      .filter((collection) => Boolean(collection.auth))
      .map((collection) => collection.slug)

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
      }),
    ]

    return config
  }
