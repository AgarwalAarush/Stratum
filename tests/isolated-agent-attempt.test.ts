import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runIsolatedAgentAttempt } from '../lib/server/isolated-agent-attempt.ts'

test('a timed-out job is stopped before retry and does not terminate its sibling', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stratum-job-isolation-'))
  try {
    const script = join(directory, 'attempt.mjs')
    await writeFile(script, `process.once('message',job=>{if(job.hang)setInterval(()=>{},1000);else process.send({type:'result',output:'completed'},()=>process.exit(0))})`)
    const hung = assert.rejects(runIsolatedAgentAttempt({ hang: true }, 1000, async () => {}, pathToFileURL(script)), /deadline/)
    const sibling = runIsolatedAgentAttempt({}, 5000, async () => {}, pathToFileURL(script))
    assert.equal(await sibling, 'completed')
    await hung
  } finally { await rm(directory, { recursive: true, force: true }) }
})
