# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

The core abstraction is **Scopes** (top-level nav tabs like "AI Research", "Finance") containing **Sections** (individual feed panels like "Papers", "Earnings"). All scope/section definitions live in `lib/scopes.ts` as a static registry (`SCOPES` array of `ScopeDef`). Each section declares its `apiPath`, `itemType`, and data sources.

### Data flow

1. **Client**: `ScopeFeed` (client component) uses SWR to fetch all sections for a scope in parallel, keyed by scope ID. Refresh interval is 1 hour.
2. **API routes**: Each section has a dedicated route in `app/api/` that calls a data fetcher wrapped in `cachedFetchWithFallback()`.
3. **Caching** (`lib/server/cache.ts`): Two-tier cache (in-memory Map → Upstash Redis REST API) with negative caching, stale fallback on fetch failure, and request deduplication via inflight map.
4. **HTTP caching** (`lib/server/http-cache.ts`): Standardized `Cache-Control` headers by tier (fast/medium/slow/static).

### Data fetchers (`lib/data/`)

Each file fetches from a specific external source: `arxiv.ts` (arXiv API XML), `discussions.ts` (HN Algolia + Lobste.rs), `repos.ts` (GitHub Search API), `rss.ts`/`rss-parser.ts` (RSS feeds by topic), `finance-*.ts` (FMP, FRED, SEC EDGAR), `overview.ts` (Codex API for daily AI overview bullets), `morning-brief.ts` (Codex API for daily morning brief), `overview-generators.ts` (Codex API for weekly/monthly periodic overviews).

### Article scrapers (`lib/data/scrapers/`)

Used by the summary feature (`/api/summary`) to extract article text for Codex-generated summaries. Registry (`registry.ts`) resolves Google News redirect URLs and dispatches to domain-specific scrapers (`arxiv.ts`, `github.ts`) or the `generic.ts` fallback. The generic scraper uses linkedom for HTML parsing and extracts text from semantic containers (`<article>`, `<main>`) with a largest-block fallback.

### Item types

Five item types defined in `lib/types.ts`: `paper`, `discussion`, `repo`, `earnings`, `news`. Each has a corresponding component in `components/items/` and a typed interface. All API responses conform to `SectionData { items: FeedItem[], fetchedAt: string }`.

### Scheduled jobs (QStash cron)

Three cron jobs trigger POST requests to `/api/cron/*` routes, verified via `@upstash/qstash` signature verification (`verifySignatureAppRouter`). Schedules are configured in the QStash dashboard (not in repo):

- `/api/cron/morning-brief` — daily at 12 PM UTC. Calls `generateMorningBrief()` (fetches 14 sources in parallel, synthesizes with Codex Sonnet), saves to Supabase.
- `/api/cron/weekly-overview` — Mondays at 1 PM UTC. Fetches the week's daily overviews, synthesizes with Codex Sonnet into a 400-600 word briefing.
- `/api/cron/monthly-overview` — 1st and 15th at 2 PM UTC. Fetches 30 days of dailies + weeklies + previous monthly, synthesizes 600-900 word strategic briefing.

All persisted via `overview-persistence.ts` to Supabase `overviews` table (upsert on type+date). Public read routes: `/api/morning-brief`, `/api/overviews/weekly`, `/api/overviews/monthly`.

### Route patterns

- `app/[scope]/page.tsx` — dynamic scope page, validates scope ID, renders `ScopeFeed`
- `app/api/[scope]/[section]/route.ts` — generic fallback route (serves mock data)
- `app/api/ai-research/papers/route.ts` (etc.) — dedicated routes with real fetchers override the generic catch-all
- `app/api/cron/*` — QStash-triggered POST routes (morning-brief, weekly-overview, monthly-overview)
- `app/api/morning-brief/route.ts` — public GET for latest morning brief
- `app/api/overviews/[type]/route.ts` — public GET for weekly/monthly overviews

### Layout & styling

- Tailwind CSS v4, IBM Plex Sans/Mono fonts
- CSS custom properties for theming (`--bg`, `--text`, `--surface-2`, etc.) with `data-theme` attribute on `<html>`
- Zustand store for theme state (`store/theme.ts`)
- `ClientLayout` wraps the app with nav panel; `ScopeFeed` handles section grid layout
- `SummaryCard` renders as a fixed overlay portal with streaming markdown; uses `--summary-card-bg` CSS variable for theme-aware background

## Environment variables

Copy `.env.example` to `.env.local`. Redis (`UPSTASH_REDIS_REST_URL`/`TOKEN`) is the only required variable. Supabase (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) is needed for overview persistence. QStash signing keys (`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`) are needed for cron job verification. All others (FMP, FRED, SEC, GitHub, Anthropic) are optional and gracefully degrade.

## Key conventions

- Path alias: `@/*` maps to project root
- API routes export `CACHE_TTL_SECONDS` constants — tests verify these values
- Cache keys follow pattern `stratum:{scope}:{section}:v{n}`
- The `cachedFetchWithFallback` function is the standard way to add any new data source — handles caching, dedup, stale fallback, and negative caching
