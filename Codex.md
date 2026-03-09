# Codex.md

This file provides guidance to Codex when working with code in this repository.

## What is Stratum?

Stratum is a minimalist tech intelligence dashboard that aggregates research papers, startup news, finance data, and general tech signals into a single dense, monochrome interface. Built with Next.js App Router, it fetches from real APIs (arXiv, HN, GitHub, RSS feeds, FRED, SEC EDGAR) and caches results via a two-tier system (in-memory + Upstash Redis).

**Production URL:** stratum.aarushagarwal.dev

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `node --test --experimental-strip-types tests/**/*.test.ts` — run all tests
- `node --test --experimental-strip-types tests/cache-ttl.test.ts` — run a single test file

Tests use Node's built-in test runner (`node:test` + `node:assert/strict`), not Jest or Vitest.

## Architecture

### Scope/Section model

The core abstraction is **Scopes** (top-level nav tabs: "AI Research", "Finance", "Global News") containing **Sections** (individual feed panels like "Papers", "Earnings", "Geopolitics"). All scope/section definitions live in `lib/scopes.ts` as a static registry (`SCOPES` array of `ScopeDef`). Each section declares its `apiPath`, `itemType`, and data sources.

### Data flow

1. **Client**: `ScopeFeed` (client component) uses SWR to fetch all sections for a scope in parallel, keyed by scope ID. Refresh interval is 1 hour.
2. **API routes**: Each section has a dedicated route in `app/api/` that calls a data fetcher wrapped in `cachedFetchWithFallback()`.
3. **Caching** (`lib/server/cache.ts`): Two-tier cache (in-memory Map → Upstash Redis REST API) with negative caching, stale fallback on fetch failure, and request deduplication via inflight map.
4. **HTTP caching** (`lib/server/http-cache.ts`): Standardized `Cache-Control` headers by tier (fast/medium/slow/static).

### Data fetchers (`lib/data/`)

Each file fetches from a specific external source: `arxiv.ts` (arXiv API XML), `discussions.ts` (HN Algolia + Lobste.rs), `repos.ts` (GitHub Search API), `rss.ts`/`rss-parser.ts` (RSS feeds by topic, including all global-news and ai-research news sections), `finance-*.ts` (FMP, FRED, SEC EDGAR), `overview.ts` (Claude API for daily AI overview bullets), `morning-brief.ts` (Claude API for daily morning brief), `overview-generators.ts` (Claude API for weekly/monthly periodic overviews). Fresh fetches are also persisted to Supabase via `persist-after-fetch.ts`.

### Article scrapers (`lib/data/scrapers/`)

Used by the summary feature (`/api/summary`) to extract article text for AI-generated summaries. Registry (`registry.ts`) resolves Google News redirect URLs and dispatches to domain-specific scrapers (`arxiv.ts`, `github.ts`) or the `generic.ts` fallback. The generic scraper uses linkedom for HTML parsing and extracts text from semantic containers (`<article>`, `<main>`) with a largest-block fallback. Resolved Google News URLs are persisted to Supabase (`gnews_resolved_urls` table) for long-term storage beyond the Redis 24h TTL — the resolution flow checks memory → Redis → Supabase → Google.

### Google News proxy (`services/gnews-proxy/`)

A Cloudflare Worker that transparently forwards requests to `news.google.com`. Needed because Vercel's shared IPs get rate-limited or blocked by Google News, breaking `decodeGoogleNewsUrl()`. Edge IPs rarely get blocked, there are no cold starts, and the free tier is sufficient. Auth uses the `x-proxy-key` header; `/health` does not require auth. Deploy with `wrangler deploy`; set `PROXY_API_KEY` via `wrangler secret put`. Configure via `GNEWS_PROXY_URL` and `GNEWS_PROXY_KEY` env vars — direct fetch is used when unset.

### Item types

Five item types defined in `lib/types.ts`: `paper`, `discussion`, `repo`, `earnings`, `news`. Each has a corresponding component in `components/items/` and a typed interface. All API responses conform to `SectionData { items: FeedItem[], fetchedAt: string }`.

### Scheduled jobs (QStash cron)

Four cron jobs trigger POST requests to `/api/cron/*` routes, verified via `@upstash/qstash` signature verification (`verifySignatureAppRouter`). Schedules are configured in the QStash dashboard (not in repo):

- `/api/cron/morning-brief` — daily at 12 PM UTC. Calls `generateMorningBrief()` (fetches 14 sources in parallel, synthesizes with Claude Sonnet), saves to Supabase.
- `/api/cron/weekly-overview` — Mondays at 1 PM UTC. Fetches the week's daily overviews, synthesizes with Claude Sonnet into a 400-600 word briefing.
- `/api/cron/monthly-overview` — 1st and 15th at 2 PM UTC. Fetches 30 days of dailies + weeklies + previous monthly, synthesizes a 600-900 word strategic briefing.
- `/api/cron/resolve-gnews` — every 30 minutes. Resolves pending Google News redirect URLs in small batches (max 20/run) to avoid rate limits. Persists to the `gnews_resolved_urls` table.

All persisted via `overview-persistence.ts` to Supabase `overviews` table (upsert on type+date). Public read routes: `/api/morning-brief`, `/api/overviews/weekly`, `/api/overviews/monthly`.

### Route patterns

- `app/[scope]/page.tsx` — dynamic scope page, validates scope ID, renders `ScopeFeed`
- `app/api/[scope]/[section]/route.ts` — generic fallback route (serves mock data)
- `app/api/ai-research/papers/route.ts` (etc.) — dedicated routes with real fetchers override the generic catch-all
- `app/api/ai-research/news/[topic]/route.ts` — dynamic topic route for AI Research news sections
- `app/api/global-news/news/[topic]/route.ts` — dynamic topic route for Global News sections
- `app/api/cron/*` — QStash-triggered POST routes (morning-brief, weekly-overview, monthly-overview, resolve-gnews)
- `app/api/morning-brief/route.ts` — public GET for latest morning brief
- `app/api/overviews/[type]/route.ts` — public GET for weekly/monthly overviews

### Layout & styling

- Tailwind CSS v4, IBM Plex Sans/Mono fonts
- CSS custom properties for theming (`--bg`, `--text`, `--surface-2`, etc.) with `data-theme` attribute on `<html>`
- Zustand store for theme state (`store/theme.ts`)
- `ClientLayout` wraps the app with nav panel; `ScopeFeed` handles section grid layout with scope-specific overrides
- `ScopeFeed` layout customization: AI Research has a fully custom layout. Other scopes use a generic branch with per-scope overrides — filter out "split" section IDs (for example `FINANCE_SPLIT_IDS`) and render them as side-by-side grid pairs, or pass `{ columns: 2 }` to `renderSection()` for multi-column content within a single section
- `SummaryCard` renders as a fixed overlay portal with streaming markdown; uses `--summary-card-bg` CSS variable for theme-aware background

## Environment variables

Copy `.env.example` to `.env.local`. Redis (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) is the only required integration. Supabase (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) is needed for overview persistence and Google News URL memory. QStash signing keys (`QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`) are needed for cron route verification. All others (FMP, FRED, SEC, GitHub, Anthropic, proxy credentials) are optional and degrade gracefully.

## Codex workflow

- Follow this order for feature work:
  1. Commit incrementally while building each meaningful chunk.
  2. Finish the feature or fix completely.
  3. Simplify the changed code where possible before wrapping up.
  4. Update `Codex.md` with any new repo knowledge, patterns, routes, jobs, or pitfalls discovered during the work.
  5. Make a final commit that includes the simplified code and the `Codex.md` update.
- Always commit when done, even if the work also included earlier incremental commits.
- Keep `Codex.md` current when adding new routes, architectural patterns, background jobs, infrastructure behavior, or workflow constraints that future Codex threads should know about.
- Prefer concise, repo-specific guidance over generic agent advice. This file is meant to inject project context quickly into a fresh thread.
- If you notice stale or contradictory guidance here, update it as part of the task instead of working around it silently.
- Document repeatable mistakes under `## Known pitfalls` when a future Codex thread is likely to make the same bad assumption.
- Prune stale details regularly so the file stays dense and useful.

## Key conventions

- Path alias: `@/*` maps to project root
- API routes export `CACHE_TTL_SECONDS` constants — tests verify these values
- Cache keys follow pattern `stratum:{scope}:{section}:v{n}`
- The `cachedFetchWithFallback` function is the standard way to add any new data source — it handles caching, deduplication, stale fallback, and negative caching

## Known pitfalls

- `AGENTS.md` may lag behind `CLAUDE.md` and the live code in a few places. When in doubt, verify route patterns, cron jobs, and provider details against the repository instead of assuming the agent docs are fully synchronized.
