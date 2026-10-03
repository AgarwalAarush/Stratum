import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runIsolatedAgentAttempt } from '../lib/server/isolated-agent-attempt.ts'
import { agentAttemptEnvironment, ownerRequestedCatchUpAllowance } from '../lib/server/agent-attempt-environment.ts'

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

test('the visible catch-up allowance expires with its date and deduplicates repeated approval records', () => {
  const approval = { key:'explicit', date:'2026-10-03', jobIds:['one','two'] }
  const jobs = Array.from({length:2},()=>({payload:{ownerRequestedCatchUp:approval}}))
  assert.equal(ownerRequestedCatchUpAllowance(jobs,'2026-10-03'),2)
  assert.equal(ownerRequestedCatchUpAllowance(jobs,'2026-10-04'),0)
  assert.equal(ownerRequestedCatchUpAllowance([{payload:null},{payload:{}},...jobs],'2026-10-03'),2)
})

test('catch-up models reach the child and telemetry without changing sibling jobs or World', async () => {
  const environment = { CODEX_SYNTHESIS_MODEL: 'gpt-5.6-terra', STRATUM_WORLD_CRITIC_MODEL: 'world-critic' }
  const job = { job_type: 'generate-company-research', payload: { researchModel: 'gpt-6.1-sol', ownerRequestedCatchUp: { key: 'explicit', date: '2026-10-03', reason: 'Owner requested all upgrades today' } } }
  assert.equal(agentAttemptEnvironment(job, environment).CODEX_SYNTHESIS_MODEL, 'gpt-6.1-sol')
  assert.equal(agentAttemptEnvironment(job, environment).STRATUM_WORLD_CRITIC_MODEL, 'world-critic')
  assert.equal(agentAttemptEnvironment({}, environment), environment)
  assert.equal(environment.CODEX_SYNTHESIS_MODEL, 'gpt-5.6-terra')
  assert.throws(() => agentAttemptEnvironment({ ...job, job_type: 'run-world-thinker' }, environment), /Invalid/)
  assert.throws(() => agentAttemptEnvironment({ ...job, payload: { researchModel: 'arbitrary' } }, environment), /Invalid/)
  const directory = await mkdtemp(join(tmpdir(), 'stratum-model-isolation-'))
  try {
    const script = join(directory, 'attempt.mjs')
    await writeFile(script, `process.once('message',()=>process.send({type:'result',output:process.env.CODEX_SYNTHESIS_MODEL},()=>process.exit(0)))`)
    const [chosen, normal] = await Promise.all([
      runIsolatedAgentAttempt(job, 5000, async () => {}, pathToFileURL(script)),
      runIsolatedAgentAttempt({}, 5000, async () => {}, pathToFileURL(script)),
    ])
    assert.equal(chosen, 'gpt-6.1-sol')
    assert.equal(normal, process.env.CODEX_SYNTHESIS_MODEL)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
