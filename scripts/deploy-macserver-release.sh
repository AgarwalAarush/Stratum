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

# A linked Git worktree stores .git as a file, not a directory.
if [[ ! -e "$release_dir/.git" ]]; then
  git -C "$source_checkout" worktree add --detach "$release_dir" "$revision"
fi

cd "$release_dir"
npm ci
npm run lint
node --test --experimental-strip-types tests/world-memory.test.ts tests/candidate-scout.test.ts
npm run build

# The worker environment is intentionally gitignored. Carry its existing
# owner-only file into the immutable release before the symlink switches.
if [[ ! -f "$release_dir/.env.worker" && -f "$active_link/.env.worker" ]]; then
  cp "$active_link/.env.worker" "$release_dir/.env.worker"
  chmod 600 "$release_dir/.env.worker"
fi
if [[ ! -f "$release_dir/.env.worker" ]]; then
  echo "Missing worker environment in $release_dir" >&2
  exit 1
fi

next_link="${active_link}.next"
rm -f "$next_link"
ln -s "$release_dir" "$next_link"
mv -f -h "$next_link" "$active_link"
daemon_pid="$(launchctl print "system/$label" 2>/dev/null | awk '/pid =/{print $3; exit}')"
if [[ "$daemon_pid" == <-> ]]; then
  # The daemon deliberately runs as the macserver user. Terminating that
  # process is enough for KeepAlive to relaunch the stable wrapper and follow
  # the new production symlink—without requiring sudo for each release.
  kill -TERM "$daemon_pid"
else
  echo "Release is staged, but no running system worker was found to restart." >&2
fi
echo "Deployed $revision at $active_link. The prior release worktree is retained for rollback."
