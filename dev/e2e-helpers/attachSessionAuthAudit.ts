import type { Plugin } from 'payload'

import { emitAuthEvent } from '../../src/utils/emitAuthEvent'

/**
 * Host-side snippet from the README: map session create/delete to auth
 * events. Used by the external-auth E2E configs (pwless / Better Auth).
 */
export function attachSessionAuthAudit(slug: string): Plugin {
  return (config) => {
    const collection = config.collections?.find((c) => c.slug === slug)
    if (!collection) {
      return config
    }
    collection.hooks ??= {}
    collection.hooks.afterChange = [
      ...(collection.hooks.afterChange ?? []),
      async ({ doc, operation, req }) => {
        if (operation === 'create') {
          const raw = (doc as { user?: unknown }).user
          const user = typeof raw === 'object' && raw != null ? raw : { id: raw }
          await emitAuthEvent({ event: 'login.success', req, user })
        }
        return doc
      },
    ]
    collection.hooks.afterDelete = [
      ...(collection.hooks.afterDelete ?? []),
      async ({ doc, req }) => {
        const raw = (doc as { user?: unknown } | undefined)?.user
        const user = typeof raw === 'object' && raw != null ? raw : { id: raw }
        await emitAuthEvent({ event: 'logout', req, user })
        return doc
      },
    ]
    return config
  }
}
