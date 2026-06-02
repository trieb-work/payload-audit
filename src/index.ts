export { buildAuditLogsCollection } from './collections/auditLogs'
export type { BuildAuditLogsCollectionArgs } from './collections/auditLogs'

export { createAuditAfterChangeHook } from './hooks/afterChangeHook'
export { createAuditAfterDeleteHook } from './hooks/afterDeleteHook'

export { auditLogPlugin } from './plugin'

export {
  createPruneAuditLogsTask,
  type CreatePruneAuditLogsTaskArgs,
  PRUNE_AUDIT_LOGS_TASK_SLUG,
  pruneAuditLogs,
  type PruneAuditLogsArgs,
  type PruneAuditLogsResult,
} from './tasks/pruneAuditLogs'

export {
  type AuditAccessConfig,
  type AuditAction,
  type AuditHookOptions,
  type AuditLogPluginConfig,
  type AuditMultiTenantConfig,
  type AuditRequestContext,
  type AuditRetentionConfig,
  DEFAULT_AUDIT_COLLECTION_SLUG,
  type RequestMeta,
} from './types'

export { extractRequestMeta } from './utils/extractRequestMeta'
export { extractTenant } from './utils/extractTenant'
export { resolveDocTitle } from './utils/resolveDocTitle'
export { writeAuditLog } from './utils/writeAuditLog'
export type { WriteAuditLogArgs } from './utils/writeAuditLog'
