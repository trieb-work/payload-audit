import type { Config } from 'payload'

import { describe, expect, it } from 'vitest'

import type { AuditLogPluginConfig } from '../../../src/types'

import { auditLogPlugin } from '../../../src/plugin'

/** Minimal synthetic config with a few collections. */
const makeConfig = (): Config =>
  ({
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'posts', admin: { useAsTitle: 'title' }, fields: [] },
      { slug: 'pages', fields: [] },
      { slug: 'payload-jobs', fields: [] },
    ],
  }) as unknown as Config

/**
 * Applies the plugin and returns the resulting config. The `Plugin` type allows
 * a `Promise<Config>` return, but this plugin is synchronous, so the cast is
 * safe and keeps the assertions readable.
 */
const apply = (opts?: AuditLogPluginConfig, cfg: Config = makeConfig()): Config =>
  auditLogPlugin(opts)(cfg) as Config

const findCollection = (config: Config, slug: string) =>
  (config.collections ?? []).find((c) => c.slug === slug)

const auditHookCount = (config: Config, slug: string) => {
  const collection = findCollection(config, slug)
  return {
    afterChange: collection?.hooks?.afterChange?.length ?? 0,
    afterDelete: collection?.hooks?.afterDelete?.length ?? 0,
  }
}

describe('auditLogPlugin (config wiring)', () => {
  it('is a no-op passthrough when disabled', () => {
    const config = makeConfig()
    const result = apply({ enabled: false }, config)
    expect(result).toBe(config)
    expect(findCollection(result, 'audit-logs')).toBeUndefined()
  })

  it('registers the audit-logs collection', () => {
    const result = apply()
    const auditCollection = findCollection(result, 'audit-logs')
    expect(auditCollection).toBeDefined()
    const fieldNames = (auditCollection?.fields ?? []).map((f: any) => f.name)
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        'occurredAt',
        'action',
        'entityCollection',
        'docId',
        'docTitle',
        'actor',
        'actorEmail',
        'actorName',
        'ipAddress',
        'userAgent',
      ]),
    )
  })

  it('injects hooks on regular collections', () => {
    const result = apply()
    expect(auditHookCount(result, 'posts')).toEqual({ afterChange: 1, afterDelete: 1 })
    expect(auditHookCount(result, 'users')).toEqual({ afterChange: 1, afterDelete: 1 })
  })

  it('skips disabled collections, internal collections and the audit collection itself', () => {
    const result = apply({ disabledCollections: ['pages'] })
    expect(auditHookCount(result, 'pages')).toEqual({ afterChange: 0, afterDelete: 0 })
    expect(auditHookCount(result, 'payload-jobs')).toEqual({ afterChange: 0, afterDelete: 0 })
    expect(auditHookCount(result, 'audit-logs')).toEqual({ afterChange: 0, afterDelete: 0 })
  })

  it('honours a custom collection slug', () => {
    const result = apply({ collectionSlug: 'activity' })
    expect(findCollection(result, 'activity')).toBeDefined()
    expect(findCollection(result, 'audit-logs')).toBeUndefined()
  })

  it('registers the prune task only when retention is configured', () => {
    expect(apply().jobs?.tasks ?? []).toHaveLength(0)

    const withRetention = apply({ retention: { maxEntries: 100 } })
    const taskSlugs = (withRetention.jobs?.tasks ?? []).map((t: any) => t.slug)
    expect(taskSlugs).toContain('prune-audit-logs')
  })

  it('adds a tenant field only when multi-tenant is enabled', () => {
    const noTenant = (findCollection(apply(), 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(noTenant).not.toContain('tenant')

    const withMT = apply({ multiTenant: { enabled: true } })
    const withTenant = (findCollection(withMT, 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(withTenant).toContain('tenant')
  })
})
