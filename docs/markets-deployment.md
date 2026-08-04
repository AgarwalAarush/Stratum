# Markets worker deployment

## Active runtime split

- **Vercel** serves the Next.js interface, cached reads, and signed enqueue-only cron routes.
- **Supabase** stores normalized market data, immutable snapshots, intelligence artifacts, and the worker queue.
- **Upstash Redis/QStash** caches responses and can dispatch signed schedules to Vercel as an operationally independent backup.
- **macserver** runs the private worker for Alpaca ingestion, FMP news/document ingestion, deterministic calculations, and `codex exec` synthesis.

The worker is not an HTTP backend and opens no inbound application port. It schedules due jobs, polls Supabase, and needs only outbound HTTPS to Alpaca, Financial Modeling Prep, Supabase, and OpenAI. The website never starts `codex exec` or waits for a Codex run.

## macserver

The active host is the private Intel MacBook reachable through Tailscale as `ssh macserver`. It is a private data plane: it opens no application port and remains reachable only through Tailscale. Vercel serves persisted Supabase artifacts; it never reads the local corpus.

Prerequisites:

- Node.js 22 and Codex CLI installed on the host.
- A proper USB-C PD charger connected; do not operate the worker while macOS is power-throttling the machine.
- `.env.worker` containing Supabase service credentials plus Alpaca and FMP server credentials.
- Codex authenticated with a scoped `CODEX_API_KEY` (recommended) or a persisted `codex login --device-auth` session on this trusted host.
- The repository dependencies installed with `npm ci`.

### Production worker and local corpus

The worker must run from an immutable release checkout, not a development checkout. `scripts/deploy-macserver-release.sh` fetches `origin/main`, creates a detached worktree, runs installation/tests/build, then atomically repoints `~/Projects/Stratum-production-current`. Retain old release worktrees for rollback.

The corpus root is `STRATUM_DATA_ROOT=/Users/Shared/StratumData`. It contains content-addressed raw/extracted evidence, DuckDB, Parquet observations, and rendered artifacts. The worker reserves 60 GiB free disk, caps its own managed corpus at 120 GiB, pauses optional downloads below 50 GiB free, and pauses non-critical ingestion below 40 GiB. DuckDB is private-worker-only; Vercel consumes normalized Supabase artifacts.

### First real market-memory vertical: AI/power

With `MARKET_WORLD_MODEL_ENABLED=true`, the worker fetches the curated `ai-power-v1` packet at 17:00 ET, archives the original source bytes before storing extracted text, and queues fresh global plus `ai-power` baselines and hypothesis synthesis. The initial packet is intentionally primary-source-heavy: EIA demand and deliverable-capacity material, FERC large-load interconnection action, DOE transformer supply-chain evidence, and NERC's independent reliability cross-check. Failed sources are retained in the job result as explicit gaps; a partial packet is never presented as complete diligence.

Keep `MARKET_AUTO_THESIS_ENABLED=false` through the first real end-to-end validation. The first run may form a hypothesis; it cannot create a capital decision and auto-promotion is a separate, later gate.

### Candidate critical-materials vertical

`critical-materials-v1` is the next governed packet. Its USGS Mineral Commodity Summaries, DOE critical-material assessment, MP Materials filing, and Lynas annual report map resource supply, processing concentration, trade constraints, and substitution without making a commodity-price or security call. The domain stays `candidate` until its approved sources have been durably ingested by the private worker and the governed activation path records a successful coverage review.

### Source control and scout policy

Sources are governed independently from the documents they emit. `world_source_registry` records candidate, probation, approved, blocked, and retired sources; every newly governed source needs an immutable active contract that constrains hosts, paths, MIME types, cadence, and observation kinds. The worker rejects a source outside that contract before it can create a `world_document` or observation.

`scout-world-sources` is an explicit, bounded worker job rather than a broad daily crawl. It uses `STRATUM_SOURCE_SCOUT_MODEL` to propose at most twelve **candidate** source-level URLs for one domain and one stated coverage gap. It cannot approve a source or publish evidence. Approval must create a contract through the authenticated source-control API; use `STRATUM_MARKET_RESEARCH_MODEL` for durable analyst/critic runs and `STRATUM_MARKET_STANDARD_MODEL` only for bounded planning/evaluation. Keep those variables worker-only.

The worker also runs `verify-world-source-health` at 16:00 ET. It records reachability, final redirect destination, HTTP status, MIME type, and latency in `world_source_health_checks`, validating the result against each source's active contract. A health failure is review telemetry only: it does not auto-approve, block, retire, ingest, activate a domain, form a thesis, or trigger a capital action.

For boot persistence, replace the login-dependent LaunchAgent with the LaunchDaemon installer. Pass the stable production symlink rather than a release path:

```bash
cd ~/Projects/Stratum
./scripts/deploy-macserver-release.sh
sudo ./scripts/install-macserver-worker-daemon.sh ~/Projects/Stratum-production-current macserver-user
```

The daemon installer creates:

- `/Library/LaunchDaemons/com.aarush.stratum-markets-worker.plist`
- `/Users/Shared/StratumData/runtime/stratum-worker`
- `/Users/Shared/StratumData/logs/worker.stdout.log`
- `/Users/Shared/StratumData/logs/worker.stderr.log`

Useful operations:

```bash
sudo launchctl print "system/com.aarush.stratum-markets-worker"
sudo launchctl kickstart -k "system/com.aarush.stratum-markets-worker"
tail -f /Users/Shared/StratumData/logs/worker.stderr.log
cd ~/Projects/Stratum-production-current
node --experimental-strip-types scripts/markets-worker.ts --once
```

The worker environment file is mode `0600`, owned by the existing macserver user; only the service wrapper sources it. The daemon runs under that user after boot, so it survives logout. Tailscale and SSH should still be checked after a reboot.

### Backups

When `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` are configured, the worker runs an encrypted nightly Restic backup at 02:30 ET and a sampled repository verification each Sunday. Configure retention externally or with `restic forget --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune`; never prune while the latest successful backup is over 48 hours old. Record a quarterly full restore drill in `market_corpus_backup_runs` before relying on automatic corpus eviction.

## Credential boundary

The worker process needs Supabase and Alpaca credentials to execute jobs. When configured, the `codex exec` child receives only a single-run `CODEX_API_KEY` plus basic process settings. Otherwise, this trusted host may use its persisted Codex login through `HOME`. Supabase and Alpaca secrets are never inherited. Codex runs ephemerally with:

- a read-only sandbox
- no interactive approvals
- user configuration and project rules ignored
- an empty shell-command environment
- a checked-in output schema followed by application validation

`OPENAI_API_KEY` is accepted by the application as a temporary compatibility fallback for older worker environments, but new worker installations should set `CODEX_API_KEY`.

## Database and Vercel

Migrations are an ordered, durable record. Before any `supabase db push`, run `supabase migration list` from the repository root and make sure the local and remote histories agree. Do not run `migration repair` merely to silence unknown historical versions; reconcile the actual source history first.

The current Markets migration set includes `202608040001_world_source_control_plane.sql`, which adds governed source registry, contract versions, candidate discovery runs, and domain-pack records. The application remains backward-compatible with legacy documents that predate a source registry ID, but all new governed adapters must provide an approved source slug. Do not let an unreconciled legacy migration ledger block the read path or worker.

Configure Supabase, QStash signing keys, and read-side cache values in Vercel. Keep Alpaca, FMP, and Codex credentials on macserver unless direct OpenAI Responses generation is intentionally enabled on Vercel.

## Worker schedule and optional QStash redundancy

The worker scheduler is enabled by default and checks once per minute. It creates the jobs below with deterministic deduplication keys, so restarting the Mac or also configuring QStash cannot execute the same logical interval twice.

| Schedule | Worker job | Optional signed QStash route/body |
| --- | --- | --- |
| Daily | `sync-market-assets` | `/api/cron/agent-jobs` with `{"jobType":"sync-market-assets"}` |
| Every five minutes | `refresh-market-screener` | `/api/cron/agent-jobs` with `{"jobType":"refresh-market-screener"}` |
| Every fifteen minutes | `refresh-fmp-intelligence` | `/api/cron/agent-jobs` with `{"jobType":"refresh-fmp-intelligence"}` |
| After market-leadership materialization | `run-candidate-scout` | Enqueued by the materializer with a trading-date dedupe key |
| Every five minutes while relevant | `monitor-investment-theses` | `/api/cron/agent-jobs` with the monitored-thesis payload |
| Explicit coverage request only | `scout-world-sources` | `/api/cron/agent-jobs` with a bounded domain and source-gap reason |
| Daily at 16:00 ET when the market-world model is enabled | `verify-world-source-health` | `/api/cron/agent-jobs` with `{"jobType":"verify-world-source-health"}` |
| Daily after 12:00 UTC | `generate-morning-brief` | `/api/cron/morning-brief` |
| Mondays after 13:00 UTC | `generate-weekly-overview` | `/api/cron/weekly-overview` |
| 1st and 15th after 14:00 UTC | `generate-monthly-overview` | `/api/cron/monthly-overview` |

The screener job refreshes every five minutes while Alpaca reports the market open. While closed, it refreshes once when the latest stored publication is at least six hours old so a restarted worker cannot preserve a multi-day stale snapshot. A market snapshot is published only after all rows are written; its follow-up memo is a separate job tied to the immutable snapshot ID.

Set `WORKER_SCHEDULER_ENABLED=false` only when an external scheduler is intentionally the sole source of jobs. QStash requests must remain signed POSTs.

Monitor queued/running/failed rows in `agent_jobs` and execution metadata in `agent_runs`. Keep market-data displays private until Alpaca display and redistribution terms are confirmed.

## Optional Linux/Docker replacement

`Dockerfile.worker` and `docker-compose.worker.yml` remain available if macserver is later replaced with a Linux VPS. The same worker queue and persisted artifacts allow changing hosts without changing the Vercel frontend.
