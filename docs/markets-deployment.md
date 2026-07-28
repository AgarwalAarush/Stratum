# Markets worker deployment

## Active runtime split

- **Vercel** serves the Next.js interface, cached reads, and signed enqueue-only cron routes.
- **Supabase** stores normalized market data, immutable snapshots, intelligence artifacts, and the worker queue.
- **Upstash Redis/QStash** caches responses and dispatches signed schedules to Vercel.
- **macserver** runs the private worker for Alpaca ingestion, deterministic calculations, and `codex exec` synthesis.

The worker is not an HTTP backend and opens no inbound application port. It polls Supabase and needs only outbound HTTPS to Alpaca, Supabase, and OpenAI. The website never starts `codex exec` or waits for a Codex run.

## macserver

The active host is the private Intel MacBook reachable through Tailscale as `ssh macserver`. Its Stratum checkout is `~/Projects/Stratum`, and a per-user `launchd` service keeps the worker running while the user session is logged in.

Prerequisites:

- Node.js 22 and Codex CLI installed on the host.
- A proper USB-C PD charger connected; do not operate the worker while macOS is power-throttling the machine.
- `.env.worker` containing Supabase service credentials and Alpaca server credentials.
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

## QStash schedules

All requests are signed POSTs.

| Schedule | Route/body | Purpose |
| --- | --- | --- |
| Daily before market open | `/api/cron/agent-jobs` with `{"jobType":"sync-market-assets"}` | Refresh the tradable US-equity universe |
| Every five minutes | `/api/cron/agent-jobs` with `{"jobType":"refresh-market-screener"}` | Refresh only when Alpaca reports the market open |
| Daily | `/api/cron/morning-brief` | Enqueue Morning Brief synthesis |
| Mondays | `/api/cron/weekly-overview` | Enqueue the weekly briefing |
| 1st and 15th | `/api/cron/monthly-overview` | Enqueue the strategic briefing |

Every enqueue receives a deterministic deduplication key. A market snapshot is published only after all rows are written; its follow-up memo is a separate job tied to the immutable snapshot ID.

Monitor queued/running/failed rows in `agent_jobs` and execution metadata in `agent_runs`. Keep market-data displays private until Alpaca display and redistribution terms are confirmed.

## Optional Linux/Docker replacement

`Dockerfile.worker` and `docker-compose.worker.yml` remain available if macserver is later replaced with a Linux VPS. The same worker queue and persisted artifacts allow changing hosts without changing the Vercel frontend.
