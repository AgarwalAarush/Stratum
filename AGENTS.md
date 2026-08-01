# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What is Stratum?

Stratum is a minimalist intelligence and market-analysis platform. It currently aggregates research papers, startup news, finance data, macroeconomic news, and general technology signals into a dense monochrome interface. The active product direction expands Stratum into two top-level modes: the existing general intelligence product and a financial product with a stock screener, market overview, macro analysis, research, and watchlists.

Built with Next.js App Router, Stratum fetches from real APIs (arXiv, HN, GitHub, RSS feeds, FRED, SEC EDGAR, and planned Alpaca market data) and uses Upstash Redis plus Supabase for caching and persistence.

**Production URL:** stratum.aarushagarwal.dev

## Active product direction

Stratum should evolve in this repository rather than becoming a separate financial application. Preserve and reuse the existing ingestion, caching, persistence, scheduling, and briefing infrastructure.

### Intelligence / Markets shell

The planned global product switch is **Intelligence | Markets**, analogous to a top-level workspace switch. It sits above the existing scope model and changes the available navigation.

- **Intelligence** contains the existing Morning Brief, AI Research, Global News, technology feeds, and periodic intelligence briefings.
- **Markets** will contain Market Overview, Stock Screener, Macro, Market News, Research, and later Watchlists and Alerts.
- Do not force interactive Markets pages into `SCOPES`. Scopes remain the abstraction for feed-style pages. A screener, market overview, or watchlist should have a dedicated route and page model.
- Preserve existing URLs where practical. If the current `/finance` scope is replaced, redirect it to the appropriate Markets page rather than silently breaking it.
- The two modes should share the app shell, theme system, ingestion primitives, persistence, and deployment.

### Intended Markets routes

The exact URLs may change during design, but use this structure as the planning baseline:

- `/markets` or `/markets/overview` — current market state and generated market memo
- `/markets/screener` — interactive stock table, filters, sorting, and saved screens
- `/markets/macro` — economic indicators, releases, policy, rates, and macro news
- `/markets/news` — market-moving and company news
- `/markets/research` — company and thematic research artifacts
- `/markets/watchlists` — saved names and alerts; post-MVP

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

Each file fetches from a specific external source: `arxiv.ts` (arXiv API XML), `discussions.ts` (HN Algolia + Lobste.rs), `repos.ts` (GitHub Search API), `rss.ts`/`rss-parser.ts` (RSS feeds by topic), and `finance-*.ts` (FMP, FRED, SEC EDGAR).

The current AI generators in `overview.ts`, `global-news-overview.ts`, `morning-brief.ts`, `overview-generators.ts`, and `app/api/summary/route.ts` still use the Anthropic SDK. Migrating those workflows to Codex/OpenAI is active planned work; do not describe the migration as complete until the imports, environment variables, tests, and deployed jobs have actually moved.

### Article scrapers (`lib/data/scrapers/`)

Used by the summary feature (`/api/summary`) to extract article text for Codex-generated summaries. Registry (`registry.ts`) resolves Google News redirect URLs and dispatches to domain-specific scrapers (`arxiv.ts`, `github.ts`) or the `generic.ts` fallback. The generic scraper uses linkedom for HTML parsing and extracts text from semantic containers (`<article>`, `<main>`) with a largest-block fallback.

### Item types

Five item types defined in `lib/types.ts`: `paper`, `discussion`, `repo`, `earnings`, `news`. Each has a corresponding component in `components/items/` and a typed interface. All API responses conform to `SectionData { items: FeedItem[], fetchedAt: string }`.

### Scheduled jobs (QStash cron)

Three cron jobs trigger POST requests to `/api/cron/*` routes, verified via `@upstash/qstash` signature verification (`verifySignatureAppRouter`). Schedules are configured in the QStash dashboard (not in repo):

- `/api/cron/morning-brief` — daily at 12 PM UTC. Calls `generateMorningBrief()` (fetches sources in parallel, currently synthesizes with Anthropic), saves to Supabase.
- `/api/cron/weekly-overview` — Mondays at 1 PM UTC. Fetches the week's daily overviews and currently synthesizes the briefing with Anthropic.
- `/api/cron/monthly-overview` — 1st and 15th at 2 PM UTC. Fetches 30 days of dailies + weeklies + previous monthly and currently synthesizes the strategic briefing with Anthropic.

All persisted via `overview-persistence.ts` to Supabase `overviews` table (upsert on type+date). Public read routes: `/api/morning-brief`, `/api/overviews/weekly`, `/api/overviews/monthly`.

## AI provider migration: Anthropic to Codex/OpenAI

The target provider for Stratum intelligence generation is Codex/OpenAI. Anthropic is transitional legacy infrastructure.

### Migration scope

Migrate these active workflows:

- AI Research daily overview (`lib/data/overview.ts`)
- Global News daily overview (`lib/data/global-news-overview.ts`)
- Morning Brief (`lib/data/morning-brief.ts`)
- Weekly and monthly overviews (`lib/data/overview-generators.ts`)
- Article summaries (`app/api/summary/route.ts`)
- Related tests, UI labels, README/env documentation, and error messages

### Migration rules

- Do not add new Anthropic-backed features or expand the Anthropic dependency.
- Migrate one workflow at a time and preserve its response shape, citations, fallback behavior, caching, persistence, and tests before moving to the next workflow.
- Scheduled or heavyweight intelligence should run as background work, not inside a user-facing request path.
- The website must never start `codex exec` directly in response to a page view. Vercel reads accepted, persisted results.
- Long-running Codex jobs will run on a private worker/VPS and should be triggered by signed QStash jobs or a durable job queue.
- Prefer structured outputs with a checked-in JSON Schema. Validate the final object before persistence or publication.
- Store `generatedAt`, `dataAsOf`, input/source references, model/provider metadata, job status, and error details for every generated intelligence artifact.
- Use the least-capable sandbox that works. Analysis jobs should be read-only unless a narrowly scoped output directory is required.
- Scope `CODEX_API_KEY` to the single `codex exec` process on the worker. Do not expose Codex/OpenAI credentials to browser code, checked-in configuration, build scripts, or unrelated processes.
- Direct OpenAI API calls may be used for fast, deterministic structured generation when that is operationally simpler than Codex CLI. Keep provider access behind a server-only adapter so workflows do not depend directly on an SDK throughout the codebase.
- Do not hard-code a model name across workflow files. Put the active model choice in one server-only configuration point and make tests provider-independent.

### Intelligence artifact model

Generated analysis should be treated as a durable artifact, not ephemeral prose. Market analysis should first consume a deterministic `MarketState`, then produce a validated `MarketMemo` containing at least:

- regime and what changed
- supporting evidence and source URLs
- sector implications and notable beneficiaries/losers
- catalysts, risks, and watch items
- confidence
- `dataAsOf` and `generatedAt`

The AI must not invent current prices, economic values, or source claims. Numerical market facts come from normalized data records and retain their source/feed timestamp.

## Markets data architecture

### Candidate, thesis, and research loop (implemented)

Keep three decisions distinct: discovery answers **what deserves investigation**; a thesis records **the affirmative, versioned belief**; an entry decision answers **what to do with capital now**. Never turn a Candidate Scout screen into an unreviewed buy recommendation or silently rewrite an accepted thesis.

- Candidate Scout covers the S&P 500, Russell 2000, explicit technology/theme coverage, and every owned, watchlisted, or thesis-covered symbol. It uses multiple lanes, including thesis-led selloffs and possible overreactions; momentum strength is not a universal gate.
- Every candidate must open to a deterministic partial brief at `/markets/stocks/[symbol]`: why it surfaced, what changed, the question before acting, light risk checks, decisive numbers, and source links. Label it screening evidence rather than a completed investment opinion.
- A full CompanyPacket is durable evidence, not UI state. It currently combines Alpaca price/technical history; FMP profile, statements, ratios, consensus estimates, segments, grades, and peers; the latest two FMP earnings-call transcripts; SEC filing links; persisted company events; industry context; and the user's existing thesis/decision.
- Display forward P/E as the price divided by the nearest positive annual consensus EPS estimate after the packet's data date. It is unavailable for missing or non-positive estimates; do not substitute a trailing P/E.
- `generate-company-research` runs on the private worker, writes an immutable research version, validates the fixed 15-section schema, and persists its source ledger. A refresh loads the complete preceding version and must return a structured opinion comparison: `more_constructive`, `less_constructive`, or `unchanged`, with explained before/after fields.
- Research revisions are first-class evidence in note content. `previous_research_note_id` is an optional database foreign-key optimization introduced by `202607300006_research_revision_lineage.sql`; keep the runtime fallback until production migration history has been reconciled. Legacy reports should render an explicit legacy revision fallback rather than pretending they contain a structured comparison.
- Links from an intercepted stock modal to full research must use canonical navigation so the research page is not left behind the modal or returned to the underlying portfolio page on close.

### Alpaca role

Alpaca is the planned primary source for US equity assets, quotes, trades, snapshots, and historical bars. It is appropriate for a price/volume/technical screener, but it is not the complete fundamentals source.

- Synchronize the active asset universe on a schedule.
- The published screener universe must contain the active, tradable S&P 500 constituents at minimum, plus every symbol in Stratum watchlists. A narrow smoke-test snapshot must never replace that production universe.
- Resolve S&P 500 membership from State Street's official daily SPY holdings, persist the normalized membership, and retain the last complete universe when the upstream workbook is temporarily unavailable.
- Fetch multi-symbol snapshots and bars in batches on the server/worker; never call Alpaca from the browser.
- Materialize computed screener rows in Supabase/Postgres. Do not call Alpaca once per visitor or calculate the whole universe during a request.
- Initial filters should focus on price, daily change, gap, volume, relative volume, intraday range, moving averages, 52-week position, exchange, and tradability attributes.
- Market cap, valuation ratios, financial growth, margins, sector, and industry require a normalized SEC/FMP or other fundamentals dataset.
- Every stored or returned market value must include an `asOf` timestamp. Derived values must retain enough metadata to identify their source feed and calculation window.
- Never silently mix IEX, delayed SIP, and real-time SIP data. Feed choice is part of the data contract and must be visible in diagnostics.
- Keep the screener private until Alpaca market-data display and redistribution requirements for the intended hosted use have been confirmed.

### Private brokerage reconciliation

Robinhood is the broker-of-record only for the user’s private Personal portfolio. It is not a source for the general Markets screener, Explore, Watchlists, or any public/redistributed quote display.

- The macserver worker connects to Robinhood through its read-only MCP endpoint with a server-only OAuth session. Bootstrap it with `scripts/robinhood-mcp-auth.ts` on macserver; it uses a loopback callback and persists the dynamic-client registration plus refresh token in a worker-local `0600` OAuth store. Never copy a Codex desktop OAuth session, expose OAuth credentials to Vercel/browser code, or use a broker connection for order placement.
- Reconcile the matched brokerage account into immutable `brokerage_sync_runs`, `brokerage_account_snapshots`, and `brokerage_position_snapshots`. Keep that current-state evidence separate from the reviewable portfolio transaction ledger; do not turn each sync into duplicate synthetic trades.
- A successful brokerage snapshot is authoritative for Personal cash, equity value, position quantity, and broker cost basis. Retain the ledger/market-data path as the fallback until a successful snapshot exists.
- The worker’s normal cadence is 09:20 ET, 12:15 ET, 16:15 ET, and 20:00 ET on trading weekdays. Label the Portfolio UI with its private broker provenance and capture time; current/after-hours prices must retain their observed timestamp.
- Account matching is explicit and local to the worker configuration. Store only a masked account suffix in Supabase; never persist the full account number or any access token.

### Persistence and caching

- Supabase/Postgres is the durable source of truth for assets, market observations, computed screener rows, generated briefs, and agent-job state.
- Upstash Redis is a response/cache acceleration layer, not the sole copy of market state.
- In-memory cache is opportunistic only; Vercel process lifetime must never be assumed.
- Ingestion jobs must be idempotent and safe to retry.
- Prefer atomic snapshot/version swaps or transactional upserts so visitors never see a partially refreshed screen.

Suggested initial tables or equivalent entities:

- `market_assets`
- `market_bars_daily`
- `market_snapshots`
- `screener_rows`
- `market_states`
- `market_memos`
- `agent_jobs` / `agent_runs`

### Route patterns

- `app/[scope]/page.tsx` — dynamic scope page, validates scope ID, renders `ScopeFeed`
- `app/api/[scope]/[section]/route.ts` — generic fallback route (serves mock data)
- `app/api/ai-research/papers/route.ts` (etc.) — dedicated routes with real fetchers override the generic catch-all
- `app/api/cron/*` — QStash-triggered POST routes (morning-brief, weekly-overview, monthly-overview)
- `app/api/morning-brief/route.ts` — public GET for latest morning brief
- `app/api/overviews/[type]/route.ts` — public GET for weekly/monthly overviews
- Planned dedicated Markets routes should live under `app/markets/`; do not extend the generic `[scope]` route for interactive tools.

### Layout & styling

- Tailwind CSS v4, IBM Plex Sans/Mono fonts
- CSS custom properties for theming (`--bg`, `--text`, `--surface-2`, etc.) with `data-theme` attribute on `<html>`
- Zustand store for theme state (`store/theme.ts`)
- `ClientLayout` wraps the app with nav panel; `ScopeFeed` handles section grid layout
- `SummaryCard` renders as a fixed overlay portal with streaming markdown; uses `--summary-card-bg` CSS variable for theme-aware background

## Environment variables

Copy `.env.example` to `.env.local`. Redis (`UPSTASH_REDIS_REST_URL`/`TOKEN`) is the only required variable for the current feed cache. Supabase (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) is needed for overview and future market-data persistence. QStash signing keys (`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`) are needed for cron job verification. FMP, FRED, SEC, GitHub, proxy, and the current Anthropic integration are optional and gracefully degrade.

Markets uses Alpaca credentials plus server-only OpenAI/Codex worker credentials. Never expose these through `NEXT_PUBLIC_*`. Anthropic remains legacy infrastructure for the existing Intelligence workflows until their per-workflow migration is complete; do not use it for new Markets work.

## Deployment topology

- **Vercel:** Next.js frontend, short route handlers, cached reads, and public delivery at `stratum.aarushagarwal.dev`.
- **Supabase:** durable market/intelligence data and job/artifact state.
- **Upstash Redis:** hot cache and stale-response support.
- **QStash:** signed schedules and job dispatch.
- **Worker VPS:** long-running ingestion, permitted scraping, indicator calculation, Codex jobs, and other work that does not fit a Vercel request.

Do not create a second full backend before it is necessary. Start with the current Next.js API surface plus a small worker service. Keep worker protocols explicit so the worker can later be split or replaced without changing frontend contracts.

The current Google News proxy is the pattern for source-specific egress problems: isolate an affected source instead of routing all ingestion through one scraper or assuming a particular cloud provider will avoid blocking.

## Build order

Unless the user changes priorities, implement the financial expansion in this order:

1. Define and implement the Intelligence / Markets application shell.
2. Add the Alpaca server-side connector and normalized market-data types.
3. Add durable market tables and calculation tests.
4. Build a private MVP screener with preset and custom filters.
5. Build deterministic `MarketState` generation and Markets Overview.
6. Migrate existing Anthropic intelligence workflows to Codex/OpenAI one at a time.
7. Add the VPS worker when a real workload requires persistent or long-running execution.
8. Add watchlists, alerts, fundamentals, and company research.
9. Resolve data-display licensing before a public screener launch.

Trading execution is explicitly out of scope for this phase. Do not add order-placement tools or live-trading credentials unless the user separately authorizes that product expansion.

## Git and delivery discipline

Every completed change must be committed as a coherent, reviewable unit. Do not leave finished product work only in the working tree.

- Work on a `codex/*` feature branch unless the user explicitly requests another branch.
- Commit documentation/process changes separately from product code.
- Use one commit per logical feature, migration, integration, or cleanup. Do not mix unrelated UI, data, AI-provider, or infrastructure work.
- Stage exact paths. Do not use blanket staging when unrelated or user-authored work is present.
- Preserve existing worktree changes and attribute them to a separate commit only after verifying their intent and behavior.
- Before each commit, run the focused tests and lint checks for the changed files. At major milestones, also run the complete test suite and `npm run build`.
- Do not knowingly commit a new failing relevant check. If the repository has unrelated baseline failures, record them and prove the changed surface passes independently.
- For visual changes, verify the affected routes in a browser at the reference desktop viewport and a mobile viewport. Check content, interactions, responsiveness, console errors, and framework error overlays.
- Database migrations and the application behavior that depends on them belong in the same logical feature commit unless a backward-compatible preparatory migration must deploy first.
- **Default completion rule:** When a change is intended for the product (rather than explicitly local-only, exploratory, or draft work), finish the full delivery path in the same task: apply every required Supabase migration, run the relevant worker/backfill if the schema change requires one, merge the verified feature branch into `main`, push `main`, deploy production, and verify the affected live route and data path. Report any step that cannot be completed as a concrete blocker; do not describe a local commit as delivered.
- Before merging, confirm `main` has not advanced in a conflicting way. Keep migrations and the behavior that requires them together, and do not merge or deploy around a failed migration, missing production environment variable, or failed live verification.
- Use imperative conventional commit subjects such as `feat:`, `fix:`, `test:`, `docs:`, `chore:`, and `infra:`.

### Markets reference implementation

- `/markets` uses `Generated image 2 (1).png` from the July 15, 2026 design handoff as its desktop acceptance reference.
- `/markets/screener` uses `Generated image 2 (2).png` from the same handoff as its desktop acceptance reference.
- Implement the references as semantic, responsive application UI. Never ship the screenshots as page backgrounds.
- The root URL redirects to `/markets`; existing Intelligence routes remain available, with `/ai-research` as the Intelligence entry point.
- Markets uses a dedicated full-width shell. Intelligence keeps the current sidebar shell for this milestone. Both modes must expose a working Intelligence / Markets switch.
- The visual acceptance target is 1672 by 941 in light mode. Mobile acceptance uses a 390-pixel-wide viewport. Dark mode must remain usable even when exact screenshot parity is evaluated in light mode.
- Illustrative data must always be labeled `Illustrative`. Live responses must expose their actual Alpaca feed and data timestamp; never present mock or fallback data as live.

## Key conventions

- Path alias: `@/*` maps to project root
- API routes export `CACHE_TTL_SECONDS` constants — tests verify these values
- Cache keys follow pattern `stratum:{scope}:{section}:v{n}`
- The `cachedFetchWithFallback` function is the standard way to add any new data source — handles caching, dedup, stale fallback, and negative caching
- New external integrations need typed normalization, timeouts, rate-limit handling, stale behavior, provenance timestamps, and focused tests.
- Market calculations must be deterministic and tested independently from AI generation.
- AI output may explain or rank normalized facts, but it must not be the source of raw market facts.
- Preserve unrelated worktree changes. This repository may contain in-progress frontend work while backend or documentation tasks are underway.
