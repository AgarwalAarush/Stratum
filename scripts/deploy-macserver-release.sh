#!/bin/zsh
# Prepare an immutable worker release from origin/main, then atomically point
# the daemon's production symlink at it only after install, test, and build.
set -euo pipefail

source_checkout="${1:-$PWD}"
source_checkout="$(cd "$source_checkout" && pwd)"
release_root="${STRATUM_RELEASE_ROOT:-$HOME/Projects/Stratum-releases}"
active_link="${STRATUM_PRODUCTION_LINK:-$HOME/Projects/Stratum-production-current}"
label="com.aarush.stratum-markets-worker"

git -C "$source_checkout" fetch origin main
revision="$(git -C "$source_checkout" rev-parse origin/main)"
release_dir="$release_root/$revision"
mkdir -p "$release_root"

if [[ ! -d "$release_dir/.git" ]]; then
  git -C "$source_checkout" worktree add --detach "$release_dir" "$revision"
fi

cd "$release_dir"
npm ci
npm run lint
node --test --experimental-strip-types tests/world-memory.test.ts tests/candidate-scout.test.ts
npm run build

next_link="${active_link}.next"
rm -f "$next_link"
ln -s "$release_dir" "$next_link"
mv -f "$next_link" "$active_link"
launchctl kickstart -k "system/$label" 2>/dev/null || launchctl kickstart -k "gui/$UID/$label"
echo "Deployed $revision at $active_link. The prior release worktree is retained for rollback."
