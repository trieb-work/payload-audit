import type { AuditLogCustomConfig, PayloadRequest } from '../types'

import { AUDIT_LOG_CUSTOM_KEY } from '../types'

/**
 * Reads the runtime config the plugin stored on `payload.config.custom.auditLog`.
 * Returns `null` when the plugin is not registered (or was disabled).
 */
export function getAuditLogCustom(req: PayloadRequest): AuditLogCustomConfig | null {
  const custom = req.payload?.config?.custom as Record<string, unknown> | undefined
  const stored = custom?.[AUDIT_LOG_CUSTOM_KEY]
  if (!stored || typeof stored !== 'object') {
    return null
  }
  return stored as AuditLogCustomConfig
}
