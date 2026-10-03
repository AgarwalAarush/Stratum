import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runIsolatedAgentAttempt } from '../lib/server/isolated-agent-attempt.ts'
import { agentAttemptEnvironment, ownerRequestedCatchUpAllowance } from '../lib/server/agent-attempt-environment.ts'
import { ownershipResearchModel } from '../lib/ai/config.ts'
import { testEnvironment } from './fixtures/environment.ts'

test('ordinary ownership investigations and reviews use one model policy without changing budgets or World', () => {
  const environment = testEnvironment({ CODEX_SYNTHESIS_MODEL: 'legacy-synthesis', STRATUM_MARKET_STANDARD_MODEL: 'legacy-standard', STRATUM_WORLD_CRITIC_MODEL: 'world-critic' })
  for (const job_type of ['generate-company-research', 'generate-etf-research', 'event-refresh-company-research', 'generate-daily-recommendations']) {
    const scoped = agentAttemptEnvironment({ job_type, payload: {} }, environment)
    assert.equal(ownershipResearchModel(scoped), 'gpt-6.1-sol')
    assert.equal(scoped.CODEX_SYNTHESIS_MODEL, 'gpt-6.1-sol')
    assert.equal(scoped.STRATUM_MARKET_STANDARD_MODEL, 'gpt-6.1-sol')
    assert.equal(scoped.STRATUM_MARKET_RESEARCH_MODEL, 'gpt-6.1-sol')
    assert.equal(scoped.STRATUM_WORLD_CRITIC_MODEL, 'world-critic')
    assert.equal(scoped.STRATUM_MARKET_RESEARCH_RUN_LIMIT, undefined)
    assert.equal(ownerRequestedCatchUpAllowance([{ payload: {} }], '2026-10-03'), 0)
  }
  assert.equal(environment.CODEX_SYNTHESIS_MODEL, 'legacy-synthesis')
  assert.equal(agentAttemptEnvironment({ job_type: 'run-world-thinker' }, environment), environment)
})

test('ongoing ownership models reach isolated child processes without a catch-up authorization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stratum-ongoing-model-'))
  try {
    const script = join(directory, 'attempt.mjs')
    await writeFile(script, `process.once('message',()=>process.send({type:'result',output:{model:process.env.STRATUM_OWNERSHIP_RESEARCH_MODEL??null,synthesis:process.env.CODEX_SYNTHESIS_MODEL??null,world:process.env.STRATUM_WORLD_CRITIC_MODEL??null}},()=>process.exit(0)))`)
    const [research, world] = await Promise.all([
      runIsolatedAgentAttempt({ job_type: 'generate-etf-research', payload: {} }, 5000, async () => {}, pathToFileURL(script)),
      runIsolatedAgentAttempt({ job_type: 'run-world-thinker', payload: {} }, 5000, async () => {}, pathToFileURL(script)),
    ])
    assert.deepEqual(research, { model: ownershipResearchModel(), synthesis: ownershipResearchModel(), world: process.env.STRATUM_WORLD_CRITIC_MODEL ?? null })
    assert.deepEqual(world, { model: process.env.STRATUM_OWNERSHIP_RESEARCH_MODEL ?? null, synthesis: process.env.CODEX_SYNTHESIS_MODEL ?? null, world: process.env.STRATUM_WORLD_CRITIC_MODEL ?? null })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

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
  const environment = testEnvironment({ CODEX_SYNTHESIS_MODEL: 'gpt-5.6-terra', STRATUM_WORLD_CRITIC_MODEL: 'world-critic' })
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
