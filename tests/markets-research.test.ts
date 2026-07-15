import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('research route accepts validated screener symbols and stays source-backed', async () => {
  const source = await readFile(new URL('../app/markets/research/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /\^\[A-Z\]\[A-Z0-9.-\]/)
  assert.match(source, /fetchFinanceReports/)
  assert.match(source, /Company-specific authored notes will join/)
})
