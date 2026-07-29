# Markets worker deployment

## Active runtime split

- **Vercel** serves the Next.js interface, cached reads, and signed enqueue-only cron routes.
- **Supabase** stores normalized market data, immutable snapshots, intelligence artifacts, and the worker queue.
- **Upstash Redis/QStash** caches responses and can dispatch signed schedules to Vercel as an operationally independent backup.
- **macserver** runs the private worker for Alpaca ingestion, FMP news/document ingestion, deterministic calculations, and `codex exec` synthesis.

The worker is not an HTTP backend and opens no inbound application port. It schedules due jobs, polls Supabase, and needs only outbound HTTPS to Alpaca, Financial Modeling Prep, Supabase, and OpenAI. The website never starts `codex exec` or waits for a Codex run.

## macserver

The active host is the private Intel MacBook reachable through Tailscale as `ssh macserver`. Its Stratum checkout is `~/Projects/Stratum`, and a per-user `launchd` service keeps the worker running while the user session is logged in.

Prerequisites:

- Node.js 22 and Codex CLI installed on the host.
- A proper USB-C PD charger connected; do not operate the worker while macOS is power-throttling the machine.
- `.env.worker` containing Supabase service credentials plus Alpaca and FMP server credentials.
- Codex authenticated with a scoped `CODEX_API_KEY` (recommended) or a persisted `codex login --device-auth` session on this trusted host.
- The repository dependencies installed with `npm ci`.

Install or refresh the service:

```bash
cd ~/Projects/Stratum
npm ci
./scripts/install-macserver-worker.sh
```

The installer creates:

- `~/bin/stratum-worker`
- `~/Library/LaunchAgents/com.aarush.stratum-markets-worker.plist`
- `~/Library/Logs/Stratum/worker.stdout.log`
- `~/Library/Logs/Stratum/worker.stderr.log`

Useful operations:

```bash
launchctl print "gui/$UID/com.aarush.stratum-markets-worker"
launchctl kickstart -k "gui/$UID/com.aarush.stratum-markets-worker"
tail -f ~/Library/Logs/Stratum/worker.stderr.log
cd ~/Projects/Stratum
node --experimental-strip-types scripts/markets-worker.ts --once
```

Because this is a per-user LaunchAgent, FileVault or a reboot can require a local login before the service returns. Tailscale and SSH should be checked after any reboot.

## Credential boundary

The worker process needs Supabase and Alpaca credentials to execute jobs. When configured, the `codex exec` child receives only a single-run `CODEX_API_KEY` plus basic process settings. Otherwise, this trusted host may use its persisted Codex login through `HOME`. Supabase and Alpaca secrets are never inherited. Codex runs ephemerally with:

- a read-only sandbox
- no interactive approvals
- user configuration and project rules ignored
- an empty shell-command environment
- a checked-in output schema followed by application validation

`OPENAI_API_KEY` is accepted by the application as a temporary compatibility fallback for older worker environments, but new worker installations should set `CODEX_API_KEY`.

## Database and Vercel

1. Apply `supabase/migrations/202607150001_markets_core.sql`.
2. Apply `supabase/migrations/202607150002_agent_job_deduplication.sql`.
3. Configure Supabase, QStash signing keys, and read-side cache values in Vercel.
4. Keep Alpaca and Codex credentials on macserver unless direct OpenAI Responses generation is intentionally enabled on Vercel.

## Worker schedule and optional QStash redundancy

The worker scheduler is enabled by default and checks once per minute. It creates the jobs below with deterministic deduplication keys, so restarting the Mac or also configuring QStash cannot execute the same logical interval twice.

| Schedule | Worker job | Optional signed QStash route/body |
| --- | --- | --- |
| Daily | `sync-market-assets` | `/api/cron/agent-jobs` with `{"jobType":"sync-market-assets"}` |
| Every five minutes | `refresh-market-screener` | `/api/cron/agent-jobs` with `{"jobType":"refresh-market-screener"}` |
| Every fifteen minutes | `refresh-fmp-intelligence` | `/api/cron/agent-jobs` with `{"jobType":"refresh-fmp-intelligence"}` |
| Daily after 12:00 UTC | `generate-morning-brief` | `/api/cron/morning-brief` |
| Mondays after 13:00 UTC | `generate-weekly-overview` | `/api/cron/weekly-overview` |
| 1st and 15th after 14:00 UTC | `generate-monthly-overview` | `/api/cron/monthly-overview` |

The screener job refreshes every five minutes while Alpaca reports the market open. While closed, it refreshes once when the latest stored publication is at least six hours old so a restarted worker cannot preserve a multi-day stale snapshot. A market snapshot is published only after all rows are written; its follow-up memo is a separate job tied to the immutable snapshot ID.

Set `WORKER_SCHEDULER_ENABLED=false` only when an external scheduler is intentionally the sole source of jobs. QStash requests must remain signed POSTs.

Monitor queued/running/failed rows in `agent_jobs` and execution metadata in `agent_runs`. Keep market-data displays private until Alpaca display and redistribution terms are confirmed.

## Optional Linux/Docker replacement

`Dockerfile.worker` and `docker-compose.worker.yml` remain available if macserver is later replaced with a Linux VPS. The same worker queue and persisted artifacts allow changing hosts without changing the Vercel frontend.
