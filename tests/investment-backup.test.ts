import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  INVESTMENT_BACKUP_TABLES,
  verifyInvestmentLedgerExport,
} from '../lib/server/investment-backup.ts'
import { safeWorkerError } from '../lib/server/worker-local-health.ts'
test('restored ledger verification rejects altered bytes and unsafe paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ledger-verify-'))
  try {
    const files = []
    for (const table of INVESTMENT_BACKUP_TABLES) {
      const body =
          JSON.stringify({ id: 'record-1', value: 'private evidence' }) + '\n',
        file = `${table}.jsonl`
      await writeFile(join(directory, file), body)
      files.push({
        table,
        file,
        count: 1,
        sha256: createHash('sha256').update(body).digest('hex'),
      })
    }
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ format: 1, files }),
    )
    assert.equal(
      (await verifyInvestmentLedgerExport(directory)).records,
      files.length,
    )
    await writeFile(join(directory, files[0].file), 'altered')
    await assert.rejects(
      () => verifyInvestmentLedgerExport(directory),
      /checksum/,
    )
    files[0].file = '../private-data'
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ format: 1, files }),
    )
    await assert.rejects(
      () => verifyInvestmentLedgerExport(directory),
      /unsafe/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  assert.equal(
    safeWorkerError(new Error('<!DOCTYPE html>' + 'x'.repeat(10000))),
    'Database gateway unavailable',
  )
})
