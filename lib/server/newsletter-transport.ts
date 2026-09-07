import { readFile, stat } from 'node:fs/promises'
import nodemailer from 'nodemailer'

export const NEWSLETTER_OWNER = 'aarushaga@gmail.com'
export type NewsletterProvider = 'resend' | 'gmail'
export type NewsletterMessage = {
  id: string
  sender: string
  recipient: string
  subject: string
  html: string
  plain_text: string
}

export function newsletterProvider(): NewsletterProvider {
  const provider = process.env.STRATUM_NEWSLETTER_PROVIDER || 'resend'
  if (provider !== 'resend' && provider !== 'gmail')
    throw new Error('Unsupported newsletter provider')
  return provider
}

export function newsletterSender(provider: NewsletterProvider): string {
  if (provider === 'gmail') return NEWSLETTER_OWNER
  const sender = process.env.STRATUM_NEWSLETTER_FROM?.trim()
  if (!sender) throw new Error('STRATUM_NEWSLETTER_FROM must identify a verified email sender')
  return sender
}

export async function gmailTransport() {
  const path = process.env.STRATUM_GMAIL_APP_PASSWORD_FILE
  if (!path) throw new Error('Connect the owner Gmail account on the private worker first')
  const info = await stat(path)
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
    throw new Error('Gmail credential file must be owned by the worker user with mode 0600')
  const password = (await readFile(path, 'utf8')).replace(/\s/g, '')
  if (!/^[a-zA-Z0-9]{16}$/.test(password)) throw new Error('Invalid Gmail app-password format')
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: NEWSLETTER_OWNER, pass: password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    logger: false, debug: false,
  })
}

/** Only self-delivery is authorized. A Message-ID aids reconciliation, but is
 * not an SMTP deduplication guarantee. The database permits one Gmail attempt. */
export function gmailMessage(message: NewsletterMessage) {
  if (message.sender !== NEWSLETTER_OWNER || message.recipient !== NEWSLETTER_OWNER)
    throw new Error('Gmail newsletter must be sent from and to the owner')
  return {
    from: { name: 'Aarush · Stratum', address: NEWSLETTER_OWNER },
    to: NEWSLETTER_OWNER,
    envelope: { from: NEWSLETTER_OWNER, to: [NEWSLETTER_OWNER] },
    messageId: `<stratum-newsletter-${message.id}@gmail.com>`,
    subject: message.subject, html: message.html, text: message.plain_text,
    disableFileAccess: true, disableUrlAccess: true,
  }
}
