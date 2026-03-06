# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Stratum?

Stratum is a minimalist tech intelligence dashboard that aggregates research papers, startup news, finance data, and general tech signals into a single dense, monochrome interface. Built with Next.js App Router, it fetches from real APIs (arXiv, HN, GitHub, RSS feeds, FRED, SEC EDGAR) and caches results via a two-tier system (in-memory + Upstash Redis).

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

Each file fetches from a specific external source: `arxiv.ts` (arXiv API XML), `discussions.ts` (HN Algolia + Lobste.rs), `repos.ts` (GitHub Search API), `rss.ts`/`rss-parser.ts` (RSS feeds by topic), `finance-*.ts` (FMP, FRED, SEC EDGAR), `overview.ts` (Claude API for AI overview bullets).

### Item types

Five item types defined in `lib/types.ts`: `paper`, `discussion`, `repo`, `earnings`, `news`. Each has a corresponding component in `components/items/` and a typed interface. All API responses conform to `SectionData { items: FeedItem[], fetchedAt: string }`.

### Route patterns

- `app/[scope]/page.tsx` — dynamic scope page, validates scope ID, renders `ScopeFeed`
- `app/api/[scope]/[section]/route.ts` — generic fallback route (serves mock data)
- `app/api/ai-research/papers/route.ts` (etc.) — dedicated routes with real fetchers override the generic catch-all

### Layout & styling

- Tailwind CSS v4, IBM Plex Sans/Mono fonts
- CSS custom properties for theming (`--bg`, `--text`, `--surface-2`, etc.) with `data-theme` attribute on `<html>`
- Zustand store for theme state (`store/theme.ts`)
- `ClientLayout` wraps the app with nav panel; `ScopeFeed` handles section grid layout

## Environment variables

Copy `.env.example` to `.env.local`. Redis (`UPSTASH_REDIS_REST_URL`/`TOKEN`) is the only required variable — all others (FMP, FRED, SEC, GitHub, Anthropic) are optional and gracefully degrade.

## Key conventions

- Path alias: `@/*` maps to project root
- API routes export `CACHE_TTL_SECONDS` constants — tests verify these values
- Cache keys follow pattern `stratum:{scope}:{section}:v{n}`
- The `cachedFetchWithFallback` function is the standard way to add any new data source — handles caching, dedup, stale fallback, and negative caching
