import type { AuditAuthEvent, AuditAuthEventsConfig, ResolvedAuditAuthEventsConfig } from '../types'

/** Maps a public {@link AuditAuthEvent} onto the stored `action` value. */
export const AUTH_EVENT_TO_ACTION = {
  'account.locked': 'auth.account.locked',
  'login.failure': 'auth.login.failure',
  'login.success': 'auth.login.success',
  logout: 'auth.logout',
  'password.forgot': 'auth.password.forgot',
  'token.refresh': 'auth.token.refresh',
} as const satisfies Record<AuditAuthEvent, string>

/** Select options for the built-in auth actions. */
export const BUILT_IN_AUTH_ACTION_OPTIONS = [
  { label: 'Login', value: 'auth.login.success' },
  { label: 'Login failed', value: 'auth.login.failure' },
  { label: 'Logout', value: 'auth.logout' },
  { label: 'Token refresh', value: 'auth.token.refresh' },
  { label: 'Account locked', value: 'auth.account.locked' },
  { label: 'Password forgot', value: 'auth.password.forgot' },
] as const

const EVENT_FLAG: Record<AuditAuthEvent, keyof ResolvedAuditAuthEventsConfig['events']> = {
  'account.locked': 'accountLocked',
  'login.failure': 'loginFailure',
  'login.success': 'login',
  logout: 'logout',
  'password.forgot': 'forgotPassword',
  'token.refresh': 'refresh',
}

/**
 * Resolves auth-event config with defaults. `login` / `loginFailure` / `logout`
 * / `accountLocked` default on; `refresh` and `forgotPassword` default off.
 */
export function resolveAuthEventsConfig(
  input?: AuditAuthEventsConfig,
): ResolvedAuditAuthEventsConfig {
  return {
    captureIdentifier: input?.captureIdentifier ?? 'known-user',
    enabled: input?.enabled ?? true,
    events: {
      accountLocked: input?.events?.accountLocked ?? true,
      forgotPassword: input?.events?.forgotPassword ?? false,
      login: input?.events?.login ?? true,
      loginFailure: input?.events?.loginFailure ?? true,
      logout: input?.events?.logout ?? true,
      refresh: input?.events?.refresh ?? false,
    },
  }
}

/** Whether automatic / emitAuthEvent writing is enabled for this event. */
export function isAuthEventEnabled(
  config: ResolvedAuditAuthEventsConfig,
  event: AuditAuthEvent,
): boolean {
  if (!config.enabled) {
    return false
  }
  return config.events[EVENT_FLAG[event]]
}
