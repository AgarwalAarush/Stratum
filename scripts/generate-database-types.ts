import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const projectId = process.argv[2] ?? process.env.SUPABASE_PROJECT_ID
if (!projectId || !/^[a-z]{20}$/.test(projectId)) throw new Error('Pass a Supabase project reference: npm run db:types -- PROJECT_REF')
const generated = spawnSync('supabase', ['gen', 'types', '--project-id', projectId, '--schema', 'public'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
if (generated.status !== 0) throw new Error(generated.stderr || 'Database type generation failed')
if (!generated.stdout.includes('export type Database =')) throw new Error('Supabase did not return a database type')
const target = resolve('lib/server/database.types.ts')
const temporary = `${target}.tmp`
const content = '// Generated from Stratum public schema with supabase gen types.\n// Regenerate after applying schema changes; do not hand-edit.\n' + generated.stdout
try {
  writeFileSync(temporary, content)
  if (readFileSync(temporary, 'utf8') !== content) throw new Error('Generated database types could not be verified')
  renameSync(temporary, target)
} finally {
  try { unlinkSync(temporary) } catch {}
}
