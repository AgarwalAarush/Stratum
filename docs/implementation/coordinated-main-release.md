# Coordinated main releases

Production web and the macserver worker must use the same verified main commit.
Keep the Vercel ignored-build hold in place while integrating code, applying
migrations, and staging a release. Preserve Sol ownership routing, investigation
budgets, independent review, and World shadow authority throughout the rollout.

## Verification and staging

`npm run verify` runs lint, all tests, the default production build, and standalone
typechecking. Typechecking follows the build so it checks freshly generated route
types as well as test fixtures. GitHub Actions uses Node 24, matching Vercel.

Run `scripts/deploy-macserver-release.sh CHECKOUT --stage-only` on macserver to
install and verify an immutable main release without moving the active worker.
The staged marker must match both the commit and build ID. Stage the frontend
with production settings without moving production aliases.

## Durable drain and migration order

Migration `202610030004_worker_claim_gate.sql` is a backward-compatible preparatory
migration. Apply it before calendar-aging migration `202610010006`. To apply the
gate first using the normal migration CLI, construct a temporary linked migration
directory containing all already-applied migrations and 030004, omitting only
the still-pending 006. Verify the dry run lists only 030004. Do not repair history
or reapply the already-live 030002 input-freeze migration.

Using the staged code and worker environment, run:

```
node --experimental-strip-types scripts/worker-release-control.ts pause --required-release=TARGET_SHA --worker-pid=OLD_PID
```

The database claim RPC and gate setter share an advisory lock. Pausing prevents
new claims by both legacy and updated workers without changing queued jobs or
interrupting running attempts. The file barrier also prevents the updated worker
from scheduling, recovering, or claiming work while paused. The pause command
records all current supervisor descendants, including nested Codex hosts.

Wait for the claim-status RPC to report zero running jobs and attempts, then run
`verify-activation` with the same SHA and supervisor PID. It also requires all
recorded and current descendants to have exited. Keep the old supervisor alive
until activation; launchd KeepAlive otherwise restarts it immediately.

Snapshot live RPC definitions and inspect the full migration dry run. Apply 006
only after this drain. Historical aging tasks are retrospective; new publications
create seven prospective checkpoints. The old worker cannot process calendar
horizons and must not resume after this migration.

Regenerate database types from the linked, migrated schema using `npm run db:types
-- PROJECT_REF`. Commit them, verify the final source, and stage the final main SHA.
If the final SHA changes, update both gates with a fresh pause command targeting
that SHA before activation.

## Activation and resume

`--activate-only` verifies the drained database and process state, required schema,
and staged marker before changing the symlink. The new worker starts paused and
must produce fresh healthy local evidence for its exact SHA, database access,
required schema, and empty attempt pool. Failed verification leaves claims paused.

Promote the production-configured frontend artifact for that same SHA. Verify
actual authenticated routes in Dia, release identity, accepted persisted reads,
and error logs. Then explicitly resume:

```
node --experimental-strip-types scripts/worker-release-control.ts resume --required-release=TARGET_SHA
```

Resume requires matching release identity and fresh drained evidence. If clearing
the file barrier fails, the command restores the database pause. Verify a fresh
heartbeat, active claiming, and queue progress after resuming. Remove the Vercel
Git build hold only after the matched release is healthy.

Keep a staged schema-compatible release available during cutover. The pre-006
worker alone is insufficient as a rollback after calendar tasks exist. If a
verification fails, retain both barriers and use a compatible staged release.

## Storage and acceptance

Primary corpus ingestion requires at least 40 GiB free and pauses optional work
below 50 GiB. Confirm the live disk guard after recovery. Regenerable `.next` and
`node_modules` caches in clean, obsolete, unused releases can be inventoried
separately from source/worktree deletion. Protect the active release, running
references, unique configuration, and verified rollback releases.

Whole-release retention still requires approval of its exact inventory. Automatic
retention and destructive corpus pruning remain disabled without their approved
policy and verified backup/restore prerequisites.

Code convergence does not establish investment efficacy. Ownership upgrades,
fresh frozen editions and independent review, company-feedback retries, primary
capture coverage, and the positive World publication-to-recall path need their
own persisted acceptance evidence. Missing historical originals stay explicitly
blocked. World remains shadow-only.
