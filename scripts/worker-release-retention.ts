import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, realpathSync, existsSync, statSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs'
import { join, resolve } from 'node:path'

const releaseRoot = realpathSync(resolve(process.env.STRATUM_RELEASE_ROOT || `${process.env.HOME}/Projects/Stratum-releases`))
const activeLink = process.env.STRATUM_PRODUCTION_LINK || `${process.env.HOME}/Projects/Stratum-production-current`
const active = realpathSync(activeLink)
const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const archiveRoot = process.env.STRATUM_RELEASE_CONFIG_ARCHIVE || '/Users/Shared/StratumData/runtime/release-config-archive'
const protectedPaths = new Set([active])
// Only process cwd paths under Stratum's release root are retained in the inventory.
try {
  const cwd = execFileSync('lsof', ['-n', '-d', 'cwd', '-Fpn'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  for (const line of cwd.split('\n')) if (line.startsWith(`n${releaseRoot}/`)) {
    const path = line.slice(1).split('/').slice(0, releaseRoot.split('/').length + 1).join('/')
    protectedPaths.add(path)
  }
} catch { throw new Error('Cannot verify process working directories; release deletion is disabled') }
const releases = readdirSync(releaseRoot).filter(name => /^[a-f0-9]{40}$/.test(name)).map(name => {
  const path = join(releaseRoot, name)
  const reasons: string[] = []
  const configurations: Array<{ source: string; sha256: string; destination: string }> = []
  if (realpathSync(path) !== path) reasons.push('symlink or unexpected path')
  if (protectedPaths.has(path)) reasons.push('active or running process')
  const changes = git(path, ['status', '--porcelain', '--ignored']).split('\n').filter(Boolean)
  for (const line of changes) {
    const file = line.slice(3)
    if (line.startsWith('!! ') && ['node_modules/', '.next/', 'tsconfig.tsbuildinfo', '.DS_Store', 'next-env.d.ts'].includes(file)) continue
    if (line.startsWith('!! ') && /^\.env[\w.-]*$/.test(file) && !lstatSync(join(path, file)).isSymbolicLink()) {
      const sha256 = hash(join(path, file))
      configurations.push({ source: join(path, file), sha256, destination: join(archiveRoot, `.env.worker.${sha256}`) })
      continue
    }
    reasons.push(`preserve changed or unique file: ${file}`)
  }
  if (git(path, ['rev-parse', 'HEAD']) !== name) reasons.push('revision mismatch')
  try { git(active, ['merge-base', '--is-ancestor', name, 'HEAD']) } catch { reasons.push('not an ancestor of active release') }
  return { revision: name, path, configurations, modifiedAt: statSync(path).mtimeMs, built: existsSync(join(path, '.next', 'BUILD_ID')), reasons }
}).sort((a, b) => b.modifiedAt - a.modifiedAt)
for (const rollback of releases.filter(r => r.path !== active && r.built && !r.reasons.length).slice(0, 2)) rollback.reasons.push('verified built rollback release')
const inventory = { policyVersion: 1, active, retain: releases.filter(r => r.reasons.length), remove: releases.filter(r => !r.reasons.length) }
const planHash = createHash('sha256').update(JSON.stringify(inventory)).digest('hex')
function preserveConfiguration(release: typeof releases[number]) {
  mkdirSync(archiveRoot, { recursive: true, mode: 0o700 })
  if (lstatSync(archiveRoot).isSymbolicLink() || (statSync(archiveRoot).mode & 0o077)) throw new Error('Configuration archive must be a private real directory')
  for (const config of release.configurations) {
    if (hash(config.source) !== config.sha256) throw new Error('Configuration changed since inventory')
    if (!existsSync(config.destination)) writeFileSync(config.destination, readFileSync(config.source), { mode: 0o600, flag: 'wx' })
    if (lstatSync(config.destination).isSymbolicLink() || (statSync(config.destination).mode & 0o077) || hash(config.destination) !== config.sha256) throw new Error('Configuration archive verification failed')
  }
}
const approved = process.argv.indexOf('--approve')
if (approved >= 0) {
  if (process.argv[approved + 1] !== planHash) throw new Error('Inventory changed or approval hash does not match; nothing was removed')
  for (const release of inventory.remove) {
    // Git removes the registered checkout, retaining its committed source history.
    preserveConfiguration(release)
    git(active, ['worktree', 'remove', '--force', release.path])
  }
  console.log(JSON.stringify({ planHash, removed: inventory.remove.length, retained: inventory.retain.length }))
} else if (process.argv.includes('--automatic')) {
  const consent = process.env.STRATUM_RELEASE_RETENTION_APPROVAL_FILE
  if (!consent || !existsSync(consent) || JSON.parse(readFileSync(consent, 'utf8')).policyVersion !== 1) {
    console.log(JSON.stringify({ blocked: 'Release retention policy has not been approved', planHash, ...inventory }))
  } else {
    const healthPath = process.env.STRATUM_WORKER_HEALTH_FILE || '/Users/Shared/StratumData/health/worker.json'
    const health = JSON.parse(readFileSync(healthPath, 'utf8'))
    if (health.release !== git(active, ['rev-parse', 'HEAD']) || health.status !== 'healthy' || Date.now() - Date.parse(health.checkedAt) > 180000) throw new Error('Current release has not passed worker health verification')
    for (const release of inventory.remove) { preserveConfiguration(release); git(active, ['worktree', 'remove', '--force', release.path]) }
    console.log(JSON.stringify({ removed: inventory.remove.length, retained: inventory.retain.length }))
  }
} else {
  const output = JSON.stringify({ planHash, ...inventory }, null, 2)
  const target = process.argv.indexOf('--output')
  if (target >= 0) writeFileSync(process.argv[target + 1], output, { mode: 0o600 })
  console.log(output)
}
