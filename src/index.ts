import type { Config, Plugin } from 'payload'

/**
 * Configuration options for the audit log plugin.
 *
 * NOTE: This is a Phase 1 scaffolding stub. The full implementation (collection
 * injection, hooks, retention) lands in Phase 2/3.
 */
export type AuditLogPluginConfig = {
  /** Collection slugs that should NOT be audited. Default: []. */
  disabledCollections?: string[]
  /** Master switch. When false, the plugin is a no-op. Default: true. */
  enabled?: boolean
}

/**
 * Payload CMS audit logging plugin.
 *
 * Returns a Payload `Plugin` that (once fully implemented) registers an
 * `audit-logs` collection and attaches change/delete hooks to every collection
 * except those listed in `disabledCollections`.
 */
export const auditLogPlugin =
  (pluginConfig: AuditLogPluginConfig = {}): Plugin =>
  (config: Config): Config => {
    if (pluginConfig.enabled === false) {
      return config
    }

    // Phase 2 will inject the audit-logs collection and hooks here.
    return config
  }
