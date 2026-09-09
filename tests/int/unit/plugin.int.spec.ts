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
        'onBehalfOf',
        'onBehalfOfEmail',
        'onBehalfOfName',
        'delegationChain',
        'delegationChainDropped',
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

  it('injects auth-event hooks on auth collections only', () => {
    const result = apply()
    const users = findCollection(result, 'users')
    expect(users?.hooks?.beforeOperation?.length).toBe(1)
    expect(users?.hooks?.afterLogin?.length).toBe(1)
    expect(users?.hooks?.afterLogout?.length).toBe(1)
    expect(users?.hooks?.afterError?.length).toBe(1)
    expect(users?.hooks?.afterRefresh?.length ?? 0).toBe(0)
    expect(users?.hooks?.afterForgotPassword?.length ?? 0).toBe(0)
    expect(result.hooks?.afterError?.length).toBe(1)
    expect(findCollection(result, 'posts')?.hooks?.afterLogin).toBeUndefined()
  })

  it('attaches afterRefresh and afterForgotPassword only when those events are enabled', () => {
    const result = apply({
      authEvents: { events: { forgotPassword: true, refresh: true } },
    })
    const users = findCollection(result, 'users')
    expect(users?.hooks?.afterRefresh?.length).toBe(1)
    expect(users?.hooks?.afterForgotPassword?.length).toBe(1)
  })

  it('skips auth-event hooks when authEvents.enabled is false', () => {
    const result = apply({ authEvents: { enabled: false } })
    const users = findCollection(result, 'users')
    expect(users?.hooks?.afterLogin?.length ?? 0).toBe(0)
    expect(users?.hooks?.afterLogout?.length ?? 0).toBe(0)
    expect(users?.hooks?.afterError?.length ?? 0).toBe(0)
    expect(result.hooks?.afterError?.length ?? 0).toBe(0)
  })

  it('stores runtime config on config.custom.auditLog', () => {
    const result = apply()
    const stored = (result.custom as { auditLog?: { auditCollectionSlug?: string } } | undefined)
      ?.auditLog
    expect(stored?.auditCollectionSlug).toBe('audit-logs')
  })

  it('includes auth actions in the action select by default', () => {
    const result = apply()
    const auditCollection = findCollection(result, 'audit-logs')
    const actionField = (auditCollection?.fields ?? []).find((f: any) => f.name === 'action') as
      | { options?: Array<{ value?: string } | string> }
      | undefined
    const optionValues = (actionField?.options ?? []).map((o: any) =>
      typeof o === 'string' ? o : o.value,
    )
    expect(optionValues).toContain('auth.login.success')
    expect(optionValues).toContain('auth.login.failure')
    expect(optionValues).toContain('auth.logout')
  })

  it('omits auth actions when authEvents.enabled is false', () => {
    const result = apply({ authEvents: { enabled: false } })
    const auditCollection = findCollection(result, 'audit-logs')
    const actionField = (auditCollection?.fields ?? []).find((f: any) => f.name === 'action') as
      | { options?: Array<{ value?: string } | string> }
      | undefined
    const optionValues = (actionField?.options ?? []).map((o: any) =>
      typeof o === 'string' ? o : o.value,
    )
    expect(optionValues).not.toContain('auth.login.success')
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

  it('adds authStrategy and requestMethod by default, but not requestPath or tokenFingerprint', () => {
    const fieldNames = (findCollection(apply(), 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(fieldNames).toContain('authStrategy')
    expect(fieldNames).toContain('requestMethod')
    expect(fieldNames).not.toContain('requestPath')
    expect(fieldNames).not.toContain('tokenFingerprint')
  })

  it('adds requestPath and tokenFingerprint only when explicitly enabled', () => {
    const result = apply({
      forensics: { requestPath: true, tokenFingerprint: true },
    })
    const fieldNames = (findCollection(result, 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(fieldNames).toContain('requestPath')
    expect(fieldNames).toContain('tokenFingerprint')
  })

  it('can disable authStrategy and requestMethod via forensics config', () => {
    const result = apply({ forensics: { authStrategy: false, requestMethod: false } })
    const fieldNames = (findCollection(result, 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(fieldNames).not.toContain('authStrategy')
    expect(fieldNames).not.toContain('requestMethod')
  })

  it('adds delegation fields by default', () => {
    const fieldNames = (findCollection(apply(), 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(fieldNames).toContain('onBehalfOf')
    expect(fieldNames).toContain('onBehalfOfEmail')
    expect(fieldNames).toContain('onBehalfOfName')
    expect(fieldNames).toContain('delegationChain')
    expect(fieldNames).toContain('delegationChainDropped')
  })

  it('can disable delegation fields via delegation config', () => {
    const result = apply({ delegation: { enabled: false } })
    const fieldNames = (findCollection(result, 'audit-logs')?.fields ?? []).map((f: any) => f.name)
    expect(fieldNames).not.toContain('onBehalfOf')
    expect(fieldNames).not.toContain('delegationChain')
  })

  it('merges extraActions into the action select options', () => {
    const result = apply({
      extraActions: [
        'impersonation.started',
        { label: 'Impersonation ended', value: 'impersonation.ended' },
      ],
    })
    const auditCollection = findCollection(result, 'audit-logs')
    const actionField = (auditCollection?.fields ?? []).find((f: any) => f.name === 'action') as
      | { options?: Array<{ value?: string } | string> }
      | undefined
    const optionValues = (actionField?.options ?? []).map((o: any) =>
      typeof o === 'string' ? o : o.value,
    )
    expect(optionValues).toContain('impersonation.started')
    expect(optionValues).toContain('impersonation.ended')
  })

  it('COPILIT #3: de-duplicates extraActions by value, including built-in collisions', () => {
    const result = apply({
      extraActions: [
        'impersonation.started',
        'impersonation.started',
        { label: 'Custom Create', value: 'create' },
        { label: 'Impersonation ended', value: 'impersonation.ended' },
      ],
    })
    const auditCollection = findCollection(result, 'audit-logs')
    const actionField = (auditCollection?.fields ?? []).find((f: any) => f.name === 'action') as
      | { options?: Array<{ value?: string } | string> }
      | undefined
    const optionValues = (actionField?.options ?? []).map((o: any) =>
      typeof o === 'string' ? o : o.value,
    )
    const startedCount = optionValues.filter((v: string) => v === 'impersonation.started').length
    const createCount = optionValues.filter((v: string) => v === 'create').length
    expect(startedCount).toBe(1)
    expect(createCount).toBe(1)
  })

  it('COPILIT #5: does not include actor/onBehalfOf in defaultColumns when no auth collections exist', () => {
    const cfg: Config = {
      collections: [{ slug: 'posts', admin: { useAsTitle: 'title' }, fields: [] }],
    } as unknown as Config
    const result = apply({}, cfg)
    const auditCollection = findCollection(result, 'audit-logs')
    const defaultColumns = (auditCollection?.admin as any)?.defaultColumns ?? []
    expect(defaultColumns).not.toContain('actor')
    expect(defaultColumns).not.toContain('onBehalfOf')
  })
})
