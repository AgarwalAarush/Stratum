import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('macserver releases recognize an existing linked worktree', async () => {
  const source = await readFile(new URL('../scripts/deploy-macserver-release.sh', import.meta.url), 'utf8')
  assert.match(source, /if \[\[ ! -e "\$release_dir\/\.git" \]\]; then/)
  assert.doesNotMatch(source, /if \[\[ ! -d "\$release_dir\/\.git" \]\]; then/)
})
