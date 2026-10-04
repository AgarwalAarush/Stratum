#!/bin/zsh
# Prepare an immutable worker release from origin/main, then atomically point
# the daemon's production symlink at it only after install, test, and build.
set -euo pipefail

source_checkout="${1:-$PWD}"
deployment_mode="${2:---deploy}"
if [[ "$deployment_mode" != --deploy && "$deployment_mode" != --stage-only && "$deployment_mode" != --activate-only ]]; then
  echo "Usage: deploy-macserver-release.sh CHECKOUT [--stage-only|--activate-only]" >&2
  exit 1
fi
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
if [[ "$deployment_mode" != --activate-only ]]; then
npm ci
# Existing repository warnings are reported, but only lint errors should block
# an immutable worker release. Feature checks still run below before activation.
npm run verify
printf '%s\n%s\n' "$revision" "$(cat .next/BUILD_ID)" > .stratum-staged
else
  if [[ ! -f .stratum-staged || ! -f .next/BUILD_ID || "$(head -n 1 .stratum-staged)" != "$revision" || "$(tail -n 1 .stratum-staged)" != "$(cat .next/BUILD_ID)" ]]; then
    echo "Matching verified staged release is unavailable; run --stage-only first." >&2
    exit 1
  fi
  git diff --quiet
  git diff --cached --quiet
fi

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
if [[ "$deployment_mode" == --stage-only ]]; then
  echo "Verified $revision staged at $release_dir. Pause database and file claims, drain attempts, apply matching migrations, then run --activate-only. Active worker unchanged."
  exit 0
fi

# The model repository is initialized before the worker symlink moves. This is
# idempotent and writes synthesized state only; a missing or invalid remote is
# surfaced before the daemon starts a World Thinker job.
set -a
source "$release_dir/.env.worker"
set +a
export STRATUM_RELEASE_SHA="$revision"
daemon_pid="$(launchctl print "system/$label" 2>/dev/null | awk '/pid =/{print $3; exit}')"
if [[ "$daemon_pid" != <-> ]]; then
  echo "No running supervisor is available for a verified handoff; active release unchanged." >&2
  exit 1
fi
# The database barrier also stops legacy workers that do not understand the
# file pause. Existing attempts must finish before changing schema or code.
node --experimental-strip-types scripts/worker-release-control.ts verify-activation --required-release="$revision" --worker-pid="$daemon_pid"
node --experimental-strip-types scripts/worker-release-control.ts schema
node --experimental-strip-types scripts/init-world-repository.ts

# Record release identity without copying provider credentials into an artifact.
# The environment file already exists with owner-only permissions.
sed -i '' '/^STRATUM_RELEASE_SHA=/d' "$release_dir/.env.worker"
printf '\nSTRATUM_RELEASE_SHA=%s\n' "$revision" >> "$release_dir/.env.worker"
next_link="${active_link}.next"
rm -f "$next_link"
ln -s "$release_dir" "$next_link"
mv -f -h "$next_link" "$active_link"
# Both barriers remain in place as KeepAlive follows the new symlink. The new
# worker verifies schema and database health before it can acknowledge resume.
kill -TERM "$daemon_pid"
verified=false
for health_wait in {1..48}; do
  if node --experimental-strip-types scripts/worker-release-control.ts verify --required-release="$revision" --drained; then
    verified=true
    break
  fi
  sleep 5
done
if [[ "$verified" != true ]]; then
  echo "New release health is unverified; database and file claims remain paused. Previous release retained." >&2
  exit 1
fi
echo "Activated and verified $revision with claims paused. Verify the same web SHA, then run worker-release-control.ts resume --required-release=$revision. Prior release retained."

# Automatic retention requires a separately approved policy and fresh worker
# health for this exact release. Failure leaves rollback directories intact.
if [[ -n "${STRATUM_RELEASE_RETENTION_APPROVAL_FILE:-}" && ! -f "${STRATUM_DATA_ROOT:-/Users/Shared/StratumData}/health/worker-pause.json" ]]; then
  for retention_wait in {1..12}; do
    if node --experimental-strip-types scripts/worker-release-retention.ts --automatic; then
      break
    fi
    sleep 5
  done
fi
