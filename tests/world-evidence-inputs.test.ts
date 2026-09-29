import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { writeWorldEvidenceInputs } from '../lib/server/world-evidence-inputs.ts'

test('large World prior state remains exact and source-readable to the critic', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'world-evidence-test-'))
  try {
    const sections = {
      nodes: Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, body: 'retained evidence '.repeat(5000), sourceIds: [`source-${i}`] })),
      priorSources: Array.from({ length: 100 }, (_, i) => ({ id: `source-${i}`, url: `https://example.org/${i}?long=${'a'.repeat(1000)}` })),
      proposal: { changed: 'node-99' },
    }
    const prompt = await writeWorldEvidenceInputs(directory, 'critic', sections)
    assert.ok(prompt.length < 5000)
    const index = JSON.parse(prompt.split('\n')[1])
    for (const entry of index) {
      const json = await readFile(entry.file, 'utf8')
      assert.deepEqual(JSON.parse(json), sections[entry.section as keyof typeof sections])
      assert.equal(createHash('sha256').update(json).digest('hex'), entry.sha256)
      assert.equal((await stat(entry.file)).mode & 0o777, 0o600)
    }
    await assert.rejects(writeWorldEvidenceInputs(directory, '../escape', sections), /Invalid/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
