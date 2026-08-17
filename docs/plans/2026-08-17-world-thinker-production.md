# Stratum World Thinker — production migration

## Canonical ownership

| State | Canonical owner |
| --- | --- |
| Raw and extracted evidence | `/Users/Shared/StratumData`, protected by the existing backup process |
| Synthesized world state | private `AgarwalAarush/StratumWorld` Git repository |
| Jobs and run health | Supabase `agent_jobs`, `agent_runs`, and `world_thinker_runs` |
| Vercel read model | rebuildable `world_file_index` projection keyed by commit SHA |
| Market/company facts | existing normalized Supabase tables |
| Company theses and capital decisions | owner-scoped durable records; never stored in StratumWorld |

Raw documents, credentials, brokerage identifiers, account values, position quantities, and copyrighted corpora never enter the Git repository. Sanitized portfolio dependencies exist only in `/Users/Shared/StratumData/runtime/portfolio-context.json` for read-only retrieval.

## Runtime roles

- `STRATUM_WORLD_EVENT_MODEL`: Luna-class sensor default.
- `STRATUM_WORLD_THINKER_MODEL`: Terra-class synthesis default.
- `STRATUM_WORLD_CRITIC_MODEL`: Terra-class independent critic default.
- `STRATUM_WORLD_WEB_MODEL`: Terra-class Thinker run with native `--search` when consequential gaps remain.
- `STRATUM_WORLD_ROOT`: defaults to `/Users/Shared/StratumData/world-model`.
- `STRATUM_WORLD_BRANCH`: defaults to `shadow/world-thinker` before promotion.
- `STRATUM_WORLD_THINKER_ENABLED`: enables sensor and Thinker schedules.
- `STRATUM_WORLD_CUTOVER_ENABLED`: demotes the fixed baseline/template writers and marks new projections canonical. Keep false throughout shadow.

Codex child processes inherit no application secrets or project rules. They run read-only from `STRATUM_DATA_ROOT`. Source text is delimited as untrusted data. Web search is absent unless a specific approved run sets `webSearch: true`.

## Worker commands

```bash
node --experimental-strip-types scripts/init-world-repository.ts
node --experimental-strip-types scripts/backfill-world-events.ts
node --experimental-strip-types scripts/world-cli.ts status
node --experimental-strip-types scripts/markets-worker.ts --once
```

The backfill moves chronologically in weekly batches, retains the 25 most material clusters plus every thesis/portfolio-dependent cluster, and runs the Thinker after each batch. Set `STRATUM_WORLD_BACKFILL_MODEL=false` only for a deterministic clustering dry run; set `STRATUM_WORLD_BACKFILL_THINK=false` only when validating ingestion without synthesis.

## Failure semantics

- Validation or critic rejection creates no commit and advances no event checkpoint.
- Files are never deleted; they are superseded or archived with a reason and replacement link.
- A single-writer lock protects repository publication.
- Commit publication uses a detached temporary worktree and atomically advances one branch ref.
- Push failure retains the local canonical commit as `push_pending`; the worker retries instead of discarding it.
- Projection is idempotent by commit SHA. Canonical projection promotion uses one database transaction.
- Worker interruption leaves the durable agent job recoverable under existing retry policy.

## Shadow and promotion

1. Create the private remote and initialize `shadow/world-thinker`.
2. Apply `202608170001_world_thinker.sql`.
3. Deploy the worker with Thinker enabled and cutover disabled.
4. Run the one-year weekly backfill.
5. Deploy the authenticated World API/UI and Morning Brief integration.
6. Record the shadow start time and observe for 48 live hours.
7. Verify at least 95% benchmark high-materiality processing, complete factual lineage, no duplicate active nodes, no unsupported symbols or capital actions, median urgent latency below 45 minutes, and a human-approved non-template hypothesis plus explainable company lead.
8. Verify Git, Supabase, Morning Brief, and `/markets/world` show the same commit; tests, lint, build, worker heartbeat, queue, push, and deployment must be healthy.
9. Fast-forward the shadow branch to StratumWorld `main`, project that commit as canonical, then enable `STRATUM_WORLD_CUTOVER_ENABLED=true`.

Failure of any gate retains the old production read path. It does not authorize partial cutover.
