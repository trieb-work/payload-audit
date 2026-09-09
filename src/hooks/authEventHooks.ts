import {
  AuthenticationError,
  type CollectionAfterErrorHook,
  type CollectionAfterForgotPasswordHook,
  type CollectionAfterLoginHook,
  type CollectionAfterLogoutHook,
  type CollectionAfterRefreshHook,
  type CollectionBeforeOperationHook,
  LockedAuth,
  type PayloadRequest,
  type SanitizedCollectionConfig,
} from 'payload'

import type { AuditDelegationUser, AuditRequestContext } from '../types'

import { emitAuthEvent } from '../utils/emitAuthEvent'
import { getAuditLogCustom } from '../utils/getAuditLogCustom'

const AUTH_SKIP_OPERATIONS = new Set(['forgotPassword', 'login', 'logout', 'refresh'])

interface LooseFindPayload {
  find: (args: {
    collection: string
    limit?: number
    overrideAccess?: boolean
    req?: PayloadRequest
    where?: unknown
  }) => Promise<{ docs: Array<Record<string, unknown>> }>
}

/**
 * Marks Payload auth operations so document hooks do not record the internal
 * user-doc updates (`sessions`, `loginAttempts`) as ordinary `update`s.
 */
export function createAuditBeforeOperationHook(): CollectionBeforeOperationHook {
  return ({ args, operation }) => {
    if (AUTH_SKIP_OPERATIONS.has(String(operation)) && args.req) {
      args.req.context = { ...(args.req.context ?? {}), skipAuditLog: true }
    }
    return args
  }
}

export function createAuditAfterLoginHook(): CollectionAfterLoginHook {
  return async ({ req, token, user }) => {
    await emitAuthEvent({
      event: 'login.success',
      req,
      token,
      user: user as AuditDelegationUser,
    })
    return user
  }
}

export function createAuditAfterLogoutHook(): CollectionAfterLogoutHook {
  return async ({ req }) => {
    await emitAuthEvent({ event: 'logout', req })
  }
}

export function createAuditAfterRefreshHook(): CollectionAfterRefreshHook {
  return async ({ req, token }) => {
    await emitAuthEvent({
      event: 'token.refresh',
      req,
      token: typeof token === 'string' ? token : undefined,
      user: req.user as AuditDelegationUser | undefined,
    })
  }
}

export function createAuditAfterForgotPasswordHook(): CollectionAfterForgotPasswordHook {
  return async (hookArgs) => {
    const req =
      'req' in hookArgs ?
        (hookArgs as { req?: PayloadRequest }).req
      : (hookArgs.args as { req?: PayloadRequest } | undefined)?.req
    if (!req) {
      return
    }
    const identifier = extractIdentifier(req, hookArgs.args)
    await emitAuthEvent({ event: 'password.forgot', identifier, req })
  }
}

/**
 * Records failed login / lockout. Attached to auth collections and to
 * `config.hooks.afterError` (GraphQL and production REST where collection
 * hooks still run — the context flag below prevents a double write).
 *
 * Detection cannot rely on `error.name` alone: Next production builds minify
 * Payload's error class names, so `AuthenticationError` becomes something
 * like `t`. `instanceof` plus 401-on-/login covers that.
 */
export function createAuditAfterErrorHook(): CollectionAfterErrorHook {
  return async ({ collection, error, req }) => {
    const context = req.context as AuditRequestContext
    if (context?.authAuditErrorEmitted) {
      return
    }

    const locked = isLockedAuth(error)
    const authFailure = isAuthenticationError(error) || isLoginUnauthorized(error, req)

    if (!locked && !authFailure) {
      return
    }

    req.context.authAuditErrorEmitted = true

    const identifier = extractIdentifier(req)
    const collectionSlug = collection?.slug ?? getAuditLogCustom(req)?.authCollectionSlugs[0]
    const collectionConfig =
      collection ?? (collectionSlug ? req.payload.collections[collectionSlug]?.config : undefined)
    const user = await findUserByIdentifier(req, collectionConfig, identifier)

    await emitAuthEvent({
      event: locked ? 'account.locked' : 'login.failure',
      identifier,
      req,
      user,
    })
  }
}

function isAuthenticationError(error: unknown): boolean {
  return error instanceof AuthenticationError || errorName(error) === 'AuthenticationError'
}

function isLockedAuth(error: unknown): boolean {
  return error instanceof LockedAuth || errorName(error) === 'LockedAuth'
}

/**
 * Production webpack/SWC can minify Payload error classes so both `name` and
 * `instanceof` fail across duplicate copies of `payload`. REST login still
 * throws 401 on `/login`.
 */
function isLoginUnauthorized(error: unknown, req: PayloadRequest): boolean {
  return errorStatus(error) === 401 && isLoginRoute(req)
}

function errorName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const err = error as { constructor?: { name?: string }; name?: string }
  return err.name || err.constructor?.name
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined
  }
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function isLoginRoute(req: PayloadRequest): boolean {
  const url = req.url
  if (typeof url !== 'string' || url.length === 0) {
    return false
  }
  try {
    return /\/login\/?$/i.test(new URL(url).pathname)
  } catch {
    return /\/login\/?(?:\?|$)/i.test(url)
  }
}

function extractIdentifier(req: PayloadRequest, extra?: unknown): string | undefined {
  const fromReq = identifierFromUnknown(req.data)
  if (fromReq) {
    return fromReq
  }
  return identifierFromUnknown(extra)
}

function identifierFromUnknown(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const data = value as {
    data?: { email?: string; username?: string }
    email?: string
    username?: string
  }
  const nested = data.data
  const email = data.email || nested?.email
  const username = data.username || nested?.username
  if (typeof email === 'string' && email.trim()) {
    return email.trim()
  }
  if (typeof username === 'string' && username.trim()) {
    return username.trim()
  }
  return undefined
}

function supportsUsernameLogin(collection?: SanitizedCollectionConfig): boolean {
  return typeof collection?.auth?.loginWithUsername === 'object'
}

function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim()
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed
}

function buildUserLookupWhere(identifier: string, collection?: SanitizedCollectionConfig): unknown {
  if (supportsUsernameLogin(collection)) {
    return {
      or: [{ email: { equals: identifier } }, { username: { equals: identifier } }],
    }
  }
  return { email: { equals: identifier } }
}

async function findUserByIdentifier(
  req: PayloadRequest,
  collection: SanitizedCollectionConfig | undefined,
  identifier: string | undefined,
): Promise<AuditDelegationUser | null> {
  const collectionSlug = collection?.slug
  if (!identifier || !collectionSlug) {
    return null
  }

  try {
    const result = await (req.payload as unknown as LooseFindPayload).find({
      collection: collectionSlug,
      limit: 1,
      overrideAccess: true,
      req,
      where: buildUserLookupWhere(normalizeIdentifier(identifier), collection),
    })
    const doc = result.docs[0]
    if (doc?.id == null) {
      return null
    }
    return {
      id: doc.id as number | string,
      name: typeof doc.name === 'string' ? doc.name : undefined,
      collection: collectionSlug,
      email: typeof doc.email === 'string' ? doc.email : undefined,
    }
  } catch {
    return null
  }
}
