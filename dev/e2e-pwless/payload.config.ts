import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { authPlugin } from '@trieb.work/payload-auth-pwless'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig } from 'payload'

import { auditLogPlugin } from '../../src/index'
import { attachSessionAuthAudit } from '../e2e-helpers/attachSessionAuthAudit'
import { testEmailAdapter } from '../helpers/testEmailAdapter.js'

process.env.PAYLOAD_SECRET ??= 'pwless-e2e-secret_key'

const startMemoryDb = async () => {
  if (process.env.PWLESS_DATABASE_URL) {
    return process.env.PWLESS_DATABASE_URL
  }
  const memoryDB = await MongoMemoryReplSet.create({
    replSet: { count: 1, dbName: 'payload-audit-pwless' },
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
      authPlugin({
        enableAgentLogin: false,
        enableMagicLink: false,
        enableOAuth: false,
        enableOnboarding: false,
        enableWebAuthn: false,
        serverURL: 'http://localhost:3000',
      }),
      auditLogPlugin({
        disabledCollections: ['sessions', 'webauthn-credentials'],
      }),
      attachSessionAuthAudit('sessions'),
    ],
    secret: 'pwless-e2e-secret_key',
  })
})()
