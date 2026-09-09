import type { AuditAuthEvent, AuditDelegationUser, PayloadRequest } from '../types'

import { getAuditLogCustom } from './getAuditLogCustom'
import { AUTH_EVENT_TO_ACTION, isAuthEventEnabled } from './resolveAuthEvents'
import { writeAuditLog } from './writeAuditLog'

/** Document id used when no user document is known (failed login, etc.). */
export const UNKNOWN_AUTH_DOC_ID = 'unknown'

export interface EmitAuthEventArgs {
  /**
   * Override the recorded auth strategy. When omitted, `req.user._strategy` is
   * used when present.
   */
  authStrategy?: string
  /** The auth event to record. */
  event: AuditAuthEvent
  /**
   * Submitted login identifier (email/username). Persistence is gated by
   * `authEvents.captureIdentifier`.
   */
  identifier?: string
  /** The originating request. */
  req: PayloadRequest
  /**
   * Fresh token to fingerprint (e.g. JWT from `afterLogin`). Never stored.
   */
  token?: string
  /**
   * The user involved in the event. When omitted, `req.user` is used.
   * Failed login may omit this.
   */
  user?: AuditDelegationUser | null
}

/**
 * Writes a single auth audit entry using the plugin options stored on
 * `payload.config.custom.auditLog`.
 *
 * Automatic Payload auth hooks call this internally. External auth plugins
 * (passwordless, Better Auth, custom endpoints) should call it at login /
 * logout / failure — typically from an `afterChange` on their sessions
 * collection or directly from the login handler.
 *
 * Failures are swallowed after logging so auth is never blocked by the trail.
 */
export async function emitAuthEvent(args: EmitAuthEventArgs): Promise<void> {
  const { authStrategy, event, identifier, req, token, user } = args
  const runtime = getAuditLogCustom(req)

  if (!runtime) {
    req.payload?.logger?.error(
      '[payload-audit] emitAuthEvent called but auditLogPlugin is not registered',
    )
    return
  }

  if (!isAuthEventEnabled(runtime.authEvents, event)) {
    return
  }

  const collection = resolveAuthCollection(user, req, runtime.authCollectionSlugs)
  const actorUser = resolveActorUser(user, req)
  const knownUser = Boolean(actorUser?.id)
  const docTitle = resolveDocTitleForEvent({
    captureIdentifier: runtime.authEvents.captureIdentifier,
    event,
    identifier,
    knownUser,
    user: actorUser,
  })
  const docId = actorUser?.id != null ? String(actorUser.id) : UNKNOWN_AUTH_DOC_ID

  const reqForWrite = {
    ...req,
    user: actorUser ?? req.user,
  } as PayloadRequest

  try {
    await writeAuditLog({
      action: AUTH_EVENT_TO_ACTION[event],
      auditCollectionSlug: runtime.auditCollectionSlug,
      authCollectionSlugs: runtime.authCollectionSlugs,
      authStrategy,
      collection,
      delegation: runtime.delegation,
      docId,
      docTitle,
      forensics: runtime.forensics,
      req: reqForWrite,
      token,
    })
  } catch (error) {
    req.payload.logger.error(
      { err: error, event },
      '[payload-audit] Failed to write auth audit event',
    )
  }
}

function resolveActorUser(
  user: AuditDelegationUser | null | undefined,
  req: PayloadRequest,
): AuditDelegationUser | null {
  if (user && user.id != null) {
    return user
  }
  const reqUser = req.user as AuditDelegationUser | null | undefined
  if (reqUser && reqUser.id != null) {
    return reqUser
  }
  return user ?? reqUser ?? null
}

function resolveAuthCollection(
  user: AuditDelegationUser | null | undefined,
  req: PayloadRequest,
  authCollectionSlugs: string[],
): string {
  if (user?.collection) {
    return user.collection
  }
  const reqUser = req.user as AuditDelegationUser | null | undefined
  if (reqUser?.collection) {
    return reqUser.collection
  }
  return authCollectionSlugs[0] ?? 'users'
}

function resolveDocTitleForEvent(args: {
  captureIdentifier: ResolvedCapture
  event: AuditAuthEvent
  identifier?: string
  knownUser: boolean
  user: AuditDelegationUser | null
}): string | undefined {
  const { captureIdentifier, event, identifier, knownUser, user } = args
  const isFailure = event === 'login.failure' || event === 'account.locked'

  if (!isFailure) {
    return user?.email || user?.name || identifier
  }

  if (captureIdentifier === false) {
    return undefined
  }
  if (captureIdentifier === 'known-user' && !knownUser) {
    return undefined
  }
  return identifier || user?.email || user?.name
}

type ResolvedCapture = 'always' | 'known-user' | false
