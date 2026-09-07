import { createHmac, timingSafeEqual } from 'node:crypto'
export function verifyNewsletterWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): boolean {
  const id = headers.get('svix-id'),
    timestamp = headers.get('svix-timestamp'),
    signature = headers.get('svix-signature')
  if (
    !id ||
    !timestamp ||
    !signature ||
    !secret.startsWith('whsec_') ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Number(timestamp) * 1000 - now) > 300000
  )
    return false
  const expected = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest()
  return signature.split(' ').some((s) => {
    const [version, value] = s.split(',')
    if (version !== 'v1' || !value) return false
    const actual = Buffer.from(value, 'base64')
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    )
  })
}
