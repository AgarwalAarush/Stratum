import { writeFile } from 'node:fs/promises'
import { MARKETS_OWNER_ID } from '../lib/auth/markets-auth.ts'
import { loadResearchCoverage } from '../lib/server/interest-coverage.ts'
import { getSupabaseClient } from '../lib/server/supabase.ts'
import { investigationDate } from '../lib/server/research-investigations.ts'
import { ownershipCatchUpSql } from '../lib/server/ownership-research-catch-up.ts'

// Produces reviewable SQL only. Applying it requires the existing admin path.
const output = process.argv[2], expected = Number(process.argv[3]), key = process.argv[4]
if (!output || !Number.isInteger(expected) || expected < 1 || !key) throw new Error('Usage: plan-owned-research-catch-up.ts OUTPUT EXPECTED_COUNT AUTHORIZATION_KEY')
const ownerId = MARKETS_OWNER_ID, date = investigationDate(), db = getSupabaseClient()
if (!db) throw new Error('Worker service credentials are unavailable')
const coverage = await loadResearchCoverage(ownerId)
const remaining = coverage.holdings.filter(h => !h.contractCurrent).map(h => h.symbol)
if (remaining.length !== expected) throw new Error('Authoritative remaining holding count changed; inspect before proceeding')
const jobs = await db.from('agent_jobs').select('id,status,payload,dedupe_key').contains('payload', { ownerId })
  .in('job_type', ['generate-company-research', 'generate-etf-research']).in('status', ['queued', 'running'])
if (jobs.error) throw new Error(jobs.error.message)
const upgrades = remaining.map(symbol => jobs.data.find(j => j.dedupe_key === `research-upgrade:${ownerId}:${symbol}:2`))
if (upgrades.some(j => !j || j.status !== 'queued')) throw new Error('A holding upgrade is missing or already running; inspect before proceeding')
const sql = ownershipCatchUpSql({ ownerId, date, jobIds: upgrades.map(j => j!.id), key,
  reason: 'Owner requested all 18 remaining holding upgrades today and GPT-6.1 Sol for these investigations and their independent decision review' })
await writeFile(output, sql, { mode: 0o600 })
console.info(JSON.stringify({ planned: upgrades.length, date, model: 'gpt-6.1-sol', normalDailyLimit: 8, output }))
