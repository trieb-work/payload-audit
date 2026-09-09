import type {
  CollectionAfterErrorHook,
  CollectionAfterForgotPasswordHook,
  CollectionAfterLoginHook,
  CollectionAfterLogoutHook,
  CollectionAfterRefreshHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from 'payload'

import type { AuditDelegationUser } from '../types'

import { emitAuthEvent } from '../utils/emitAuthEvent'

const AUTH_SKIP_OPERATIONS = new Set(['forgotPassword', 'login', 'logout', 'refresh'])

interface LooseFindPayload {
  find: (args: {
    collection: string
    limit?: number
    overrideAccess?: boolean
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

export function createAuditAfterErrorHook(): CollectionAfterErrorHook {
  return async ({ collection, error, req }) => {
    if (isLockedAuth(error)) {
      const identifier = extractIdentifier(req)
      const user = await findUserByIdentifier(req, collection?.slug, identifier)
      await emitAuthEvent({
        event: 'account.locked',
        identifier,
        req,
        user,
      })
      return
    }

    if (isAuthenticationError(error)) {
      const identifier = extractIdentifier(req)
      const user = await findUserByIdentifier(req, collection?.slug, identifier)
      await emitAuthEvent({
        event: 'login.failure',
        identifier,
        req,
        user,
      })
    }
  }
}

function isAuthenticationError(error: unknown): boolean {
  return errorName(error) === 'AuthenticationError'
}

function isLockedAuth(error: unknown): boolean {
  return errorName(error) === 'LockedAuth'
}

function errorName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const err = error as { constructor?: { name?: string }; name?: string }
  return err.name || err.constructor?.name
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

async function findUserByIdentifier(
  req: PayloadRequest,
  collectionSlug: string | undefined,
  identifier: string | undefined,
): Promise<AuditDelegationUser | null> {
  if (!identifier || !collectionSlug) {
    return null
  }

  try {
    const result = await (req.payload as unknown as LooseFindPayload).find({
      collection: collectionSlug,
      limit: 1,
      overrideAccess: true,
      where: { email: { equals: identifier } },
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
