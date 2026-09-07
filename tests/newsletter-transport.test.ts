import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gmailMessage, gmailTransport, NEWSLETTER_OWNER } from '../lib/server/newsletter-transport.ts'

test('Gmail transport limits both envelope and headers to the owner and prevents content file reads', () => {
  const input = { id: 'edition-1', sender: NEWSLETTER_OWNER, recipient: NEWSLETTER_OWNER, subject: 'Test', html: '<p>Test</p>', plain_text: 'Test' }
  const message = gmailMessage(input)
  assert.deepEqual(message.envelope, { from: NEWSLETTER_OWNER, to: [NEWSLETTER_OWNER] })
  assert.equal(message.to, NEWSLETTER_OWNER)
  assert.equal(message.from.address, NEWSLETTER_OWNER)
  assert.equal(message.messageId, '<stratum-newsletter-edition-1@gmail.com>')
  assert.equal(message.disableFileAccess, true)
  assert.equal(message.disableUrlAccess, true)
  assert.throws(() => gmailMessage({ ...input, sender: 'someone@example.com' }), /owner/)
  assert.throws(() => gmailMessage({ ...input, recipient: 'someone@example.com' }), /owner/)
})

test('Gmail connection rejects exposed credentials before network access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stratum-gmail-test-'))
  const path = join(directory, 'credential'), previous = process.env.STRATUM_GMAIL_APP_PASSWORD_FILE
  process.env.STRATUM_GMAIL_APP_PASSWORD_FILE = path
  try {
    await writeFile(path, 'abcdefghijklmnop', { mode: 0o644 })
    await chmod(path, 0o644)
    await assert.rejects(gmailTransport, /0600/)
    await chmod(path, 0o600)
    await writeFile(path, 'invalid')
    await assert.rejects(gmailTransport, /format/)
    await writeFile(path, 'abcd efgh ijkl mnop')
    const transport = await gmailTransport()
    transport.close()
  } finally {
    if (previous === undefined) delete process.env.STRATUM_GMAIL_APP_PASSWORD_FILE
    else process.env.STRATUM_GMAIL_APP_PASSWORD_FILE = previous
    await rm(directory, { recursive: true })
  }
})
