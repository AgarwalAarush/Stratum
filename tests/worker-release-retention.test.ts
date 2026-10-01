import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('release deletion requires its exact inventory and preserves configuration and rollback copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'stratum-release-retention-'))
  try {
    const source = join(root, 'source'), releases = join(root, 'releases'), archive = join(root, 'archive')
    mkdirSync(source); mkdirSync(releases)
    const git = (args: string[]) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
    git(['init', '-q']); writeFileSync(join(source, '.gitignore'), '.next/\n.env*\nnext-env.d.ts\n')
    const revisions: string[] = []
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(source, 'source.txt'), String(i)); git(['add', 'source.txt', '.gitignore'])
      git(['-c','user.name=Stratum Test','-c','user.email=test@example.invalid','commit','-qm',`release ${i}`])
      const revision = git(['rev-parse','HEAD']); revisions.push(revision)
      const path = join(releases, revision); git(['worktree','add','--detach',path,revision])
      mkdirSync(join(path,'.next')); writeFileSync(join(path,'.next','BUILD_ID'),revision)
      writeFileSync(join(path,'.env.worker'),`TEST_CONFIG=${i}\n`,{mode:0o600})
    }
    // Preserve user-authored content even in an otherwise obsolete release.
    writeFileSync(join(releases,revisions[0],'notes.txt'),'keep this')
    const env = { ...process.env, STRATUM_RELEASE_ROOT: releases, STRATUM_PRODUCTION_LINK: join(releases,revisions[4]), STRATUM_RELEASE_CONFIG_ARCHIVE: archive }
    const script = resolve('scripts/worker-release-retention.ts')
    const run = (args: string[]) => execFileSync(process.execPath,['--experimental-strip-types',script,...args], { env, encoding:'utf8',stdio:['ignore','pipe','pipe'] })
    const inventory = JSON.parse(run([]))
    assert.equal(inventory.remove.length,1)
    assert.equal(inventory.remove[0].revision,revisions[1])
    assert.throws(()=>run(['--approve','wrong']),/Command failed/)
    assert.ok(existsSync(join(releases,revisions[1])))
    run(['--approve',inventory.planHash])
    assert.equal(existsSync(join(releases,revisions[1])),false)
    assert.ok(existsSync(join(releases,revisions[4])))
    assert.ok(existsSync(join(releases,revisions[0],'notes.txt')))
    const config=inventory.remove[0].configurations[0]
    assert.equal(readFileSync(config.destination,'utf8'),'TEST_CONFIG=1\n')
  } finally { rmSync(root,{recursive:true,force:true}) }
})
