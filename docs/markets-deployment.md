# Markets private-preview deployment

## Runtime split

- **Vercel** serves the Next.js interface, cached reads, and signed enqueue-only cron routes.
- **Supabase** stores normalized market data, immutable snapshots, intelligence artifacts, and the worker queue.
- **Upstash Redis/QStash** caches responses and dispatches signed schedules to Vercel.
- **Hetzner Cloud Ashburn** runs one private Docker worker for Alpaca ingestion, deterministic calculations, and `codex exec` synthesis.

The worker opens no inbound application port. It only needs outbound HTTPS to Alpaca, Supabase, and OpenAI. Do not place scraping proxies or a public API on this VPS.

## Hetzner host

Use a 4-vCPU/8-GB Ubuntu host in Ashburn. Allow SSH only from the operator IP, deny every other inbound port, enable automatic security updates, and install Docker Engine with the Compose plugin.

```bash
git clone <private-repository-url> /opt/stratum
cd /opt/stratum
cp .env.worker.example .env.worker
docker compose -f docker-compose.worker.yml up -d --build
```

Populate `.env.worker` directly on the host with the Supabase service-role key, Alpaca server credentials, and an OpenAI key that can authenticate the Codex CLI. Never expose these values through `NEXT_PUBLIC_*` variables.

## Database and Vercel

1. Apply `supabase/migrations/202607150001_markets_core.sql`.
2. Apply `supabase/migrations/202607150002_agent_job_deduplication.sql`.
3. Configure Supabase, QStash signing keys, and read-side cache values in Vercel.
4. Configure Alpaca and OpenAI credentials only on the worker unless direct/manual Responses generation is intentionally enabled on Vercel.

## QStash schedules

All requests are signed POSTs. The existing intelligence routes enqueue work; they no longer perform long-running synthesis on Vercel.

| Schedule | Route/body | Purpose |
| --- | --- | --- |
| Daily before market open | `/api/cron/agent-jobs` with `{"jobType":"sync-market-assets"}` | Refresh the tradable US-equity universe |
| Every five minutes | `/api/cron/agent-jobs` with `{"jobType":"refresh-market-screener"}` | Refresh only when Alpaca reports the market open |
| Daily | `/api/cron/morning-brief` | Enqueue Morning Brief synthesis |
| Mondays | `/api/cron/weekly-overview` | Enqueue the weekly briefing |
| 1st and 15th | `/api/cron/monthly-overview` | Enqueue the strategic briefing |

Every enqueue receives a deterministic deduplication key. A market snapshot is published only after all rows are written; its follow-up memo is a separate job tied to the immutable snapshot ID.

## Operations

```bash
docker compose -f docker-compose.worker.yml logs -f --tail=200
docker compose -f docker-compose.worker.yml run --rm markets-worker node --experimental-strip-types scripts/markets-worker.ts --once
docker compose -f docker-compose.worker.yml up -d --build
```

Monitor queued/running/failed rows in `agent_jobs` and execution metadata in `agent_runs`. Keep the preview private until Alpaca display and redistribution terms are confirmed. This architecture does not attempt to bypass publisher blocks; use licensed APIs/RSS and source-specific compliant fallbacks.
