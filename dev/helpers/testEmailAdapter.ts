import type { EmailAdapter, SendEmailOptions } from 'payload'

/**
 * No-op email adapter for the dev/test app. Logs to the console instead of
 * sending real mail so the zero-config dev experience never needs SMTP secrets.
 */
export const testEmailAdapter: EmailAdapter = ({ payload }) => ({
  name: 'test-email-adapter',
  defaultFromAddress: 'dev@payload-audit.local',
  defaultFromName: 'payload-audit dev',
  sendEmail: async (message: SendEmailOptions) => {
    payload.logger.info({ subject: message.subject, to: message.to }, '[testEmailAdapter] email')
    return Promise.resolve()
  },
})
