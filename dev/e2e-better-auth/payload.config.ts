import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig } from 'payload'
import { betterAuthPlugin } from 'payload-auth/better-auth'

import { auditLogPlugin } from '../../src/index'
import { attachSessionAuthAudit } from '../e2e-helpers/attachSessionAuthAudit'
import { testEmailAdapter } from '../helpers/testEmailAdapter.js'

process.env.BETTER_AUTH_SECRET ??= 'better-auth-e2e-secret_key'
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
process.env.PAYLOAD_SECRET ??= 'better-auth-e2e-secret_key'

const startMemoryDb = async () => {
  if (process.env.BETTER_AUTH_DATABASE_URL) {
    return process.env.BETTER_AUTH_DATABASE_URL
  }
  const memoryDB = await MongoMemoryReplSet.create({
    replSet: { count: 1, dbName: 'payload-audit-better-auth' },
  })
  return `${memoryDB.getUri()}&retryWrites=true`
}

export default (async () => {
  const url = await startMemoryDb()

  return buildConfig({
    collections: [
      {
        slug: 'users',
        admin: { useAsTitle: 'email' },
        auth: true,
        fields: [],
      },
    ],
    db: mongooseAdapter({ ensureIndexes: true, url }),
    email: testEmailAdapter,
    plugins: [
      betterAuthPlugin({
        betterAuthOptions: {
          emailAndPassword: { enabled: true },
        },
      }),
      auditLogPlugin({
        disabledCollections: ['session', 'sessions', 'account', 'verification'],
      }),
      attachSessionAuthAudit('sessions'),
    ],
    secret: 'better-auth-e2e-secret_key',
  })
})()
