export { buildAuditLogsCollection } from './collections/auditLogs'
export type { BuildAuditLogsCollectionArgs } from './collections/auditLogs'

export { createAuditAfterChangeHook } from './hooks/afterChangeHook'
export { createAuditAfterDeleteHook } from './hooks/afterDeleteHook'
export {
  createAuditAfterErrorHook,
  createAuditAfterForgotPasswordHook,
  createAuditAfterLoginHook,
  createAuditAfterLogoutHook,
  createAuditAfterRefreshHook,
  createAuditBeforeOperationHook,
} from './hooks/authEventHooks'

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
  AUDIT_LOG_CUSTOM_KEY,
  type AuditAccessConfig,
  type AuditAction,
  type AuditAuthCaptureIdentifier,
  type AuditAuthEvent,
  type AuditAuthEventsConfig,
  type AuditDelegationChainEntry,
  type AuditDelegationConfig,
  type AuditDelegationUser,
  type AuditExtraAction,
  type AuditHookOptions,
  type AuditLogCustomConfig,
  type AuditLogPluginConfig,
  type AuditMultiTenantConfig,
  type AuditRequestContext,
  type AuditRetentionConfig,
  DEFAULT_AUDIT_COLLECTION_SLUG,
  type RequestMeta,
  type ResolvedAuditAuthEventsConfig,
} from './types'

export { emitAuthEvent } from './utils/emitAuthEvent'
export type { EmitAuthEventArgs } from './utils/emitAuthEvent'
export { extractRequestMeta } from './utils/extractRequestMeta'
export { extractTenant, extractTenantName } from './utils/extractTenant'
export {
  AUTH_EVENT_TO_ACTION,
  BUILT_IN_AUTH_ACTION_OPTIONS,
  resolveAuthEventsConfig,
} from './utils/resolveAuthEvents'
export { resolveDelegation } from './utils/resolveDelegation'
export type { ResolvedDelegation } from './utils/resolveDelegation'
export { resolveDocTitle } from './utils/resolveDocTitle'
export { writeAuditLog } from './utils/writeAuditLog'
export type { WriteAuditLogArgs } from './utils/writeAuditLog'
