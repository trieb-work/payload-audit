import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { auditLogPlugin } from '../src/index'
import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const buildConfigWithMemoryDB = async () => {
  // Use an in-memory MongoDB replica set whenever no external connection string
  // is provided. This keeps the dev/test experience zero-config.
  const hasExternalDb = Boolean(process.env.DATABASE_URL || process.env.MONGODB_URI)
  if (!hasExternalDb) {
    // A single-node replica set still supports the multi-document
    // transactions Payload relies on, and starts faster / more reliably than a
    // 3-node set for local dev and tests.
    const memoryDB = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        dbName: 'payloadmemory',
      },
    })

    process.env.DATABASE_URL = `${memoryDB.getUri()}&retryWrites=true`
    process.env.MONGODB_URI = process.env.DATABASE_URL
  } else {
    // Keep both env names in sync so downstream code can rely on either.
    if (!process.env.DATABASE_URL && process.env.MONGODB_URI) {
      process.env.DATABASE_URL = process.env.MONGODB_URI
    }
    if (!process.env.MONGODB_URI && process.env.DATABASE_URL) {
      process.env.MONGODB_URI = process.env.DATABASE_URL
    }
  }

  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      {
        slug: 'users',
        admin: { useAsTitle: 'email' },
        auth: true,
        fields: [],
      },
      {
        slug: 'posts',
        admin: { useAsTitle: 'title' },
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'content', type: 'textarea' },
        ],
      },
      {
        slug: 'pages',
        admin: { useAsTitle: 'title' },
        fields: [{ name: 'title', type: 'text', required: true }],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
    ],
    db: mongooseAdapter({
      ensureIndexes: true,
      url: process.env.DATABASE_URL || '',
    }),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      auditLogPlugin({
        // `pages` is intentionally excluded to exercise the disabledCollections option.
        disabledCollections: ['pages'],
        // Exercise the retention/prune task. Small maxEntries keeps the dev
        // trail bounded; maxAge demonstrates age-based pruning.
        retention: {
          maxAge: 90,
          maxEntries: 500,
        },
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'dev-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithMemoryDB()
