import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('macserver releases recognize an existing linked worktree', async () => {
  const source = await readFile(new URL('../scripts/deploy-macserver-release.sh', import.meta.url), 'utf8')
  assert.match(source, /if \[\[ ! -e "\$release_dir\/\.git" \]\]; then/)
  assert.doesNotMatch(source, /if \[\[ ! -d "\$release_dir\/\.git" \]\]; then/)
  assert.match(source, /cp "\$active_link\/\.env\.worker" "\$release_dir\/\.env\.worker"/)
  assert.match(source, /mv -f -h "\$next_link" "\$active_link"/)
  assert.ok(source.indexOf('worker-release-control.ts verify-activation') < source.indexOf('mv -f -h'))
  assert.ok(source.indexOf('worker-release-control.ts schema') < source.indexOf('mv -f -h'))
  assert.match(source, /worker-release-control\.ts verify --required-release="\$revision" --drained/)
  assert.doesNotMatch(source, /worker-release-control\.ts resume --required-release="\$revision"/)
})
