import type { Payload } from 'payload'

export const devUser = {
  email: 'dev@payload-audit.local',
  password: 'test',
}

/**
 * Seeds a single admin user so the dev/test app can authenticate immediately.
 * Idempotent: skips creation when the user already exists.
 */
export const seed = async (payload: Payload): Promise<void> => {
  const existing = await payload.find({
    collection: 'users',
    limit: 1,
    where: { email: { equals: devUser.email } },
  })

  if (existing.docs.length > 0) {
    return
  }

  await payload.create({
    collection: 'users',
    data: {
      email: devUser.email,
      password: devUser.password,
    },
  })

  payload.logger.info(`[seed] Created dev admin user: ${devUser.email}`)
}
