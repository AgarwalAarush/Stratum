<p align="center">
  <span style="display:inline-flex; align-items:center; gap:0.12em;">
    <img src="app/icon-text.jpg" alt="S" height="45" />
    <strong style="font-size:3.5em; letter-spacing:-0.02em;">tratum</strong>
  </span>
</p>
<p align="center" style="font-size:1.4em; font-weight:500; margin-top:-0.5em; color:#333;">Intelligence and market-analysis platform</p>

> A minimalist, real-time aggregation dashboard for technology, research, startups, and finance — signal over noise.

<p align="center">
  <img src="app/overview.png" alt="Stratum dashboard overview" width="800" />
</p>

## Overview

A focused intelligence layer for staying on top of everything that matters in tech: new research papers, startup moves, market-moving deals, earnings events, and breaking releases — all in one fast, clean interface. Purpose-built for the tech and finance ecosystem.

**Design philosophy:** Minimalist. Black and white. Dense but never cluttered. Inline where possible. Information-first.

---

## Scopes

Stratum is organized into **scopes** — top-level navigation tabs that each contain multiple **sections** (feed panels).

### AI Research

- **AI Overview** — Claude-generated daily briefing bullets synthesized from all sections' headlines; weekly and monthly synthesized overviews also available
- **General AI News** — aggregated from VentureBeat AI, The Verge AI, MIT Tech Review, Reuters, Bloomberg, and Google News RSS
- **AI Policy & Regulation** — Politico Tech, EU Digital Policy, global AI regulation coverage
- **Tech Events** — hackathons, CTFs, developer competitions (MLH, Devpost, etc.)
- **Research Papers** — recent arXiv papers filtered by CS/AI/ML categories
- **Venture Capital** — TechCrunch Venture, Crunchbase News, CB Insights, a16z, Y Combinator
- **Startups** — TechCrunch Startups, VentureBeat, EU Startups, Tech in Asia, unicorn/IPO tracking
- **Infra & Hardware** — Tom's Hardware, SemiAnalysis, InfoQ, The New Stack, cloud outage monitoring
- **Cybersecurity** — Krebs, The Hacker News, Dark Reading, Schneier, CISA, ransomware tracking
- **New Technology** — TechCrunch, Ars Technica, The Verge, Hacker News, TechMeme
- **Trending Discussions** — Hacker News (Algolia API) + Lobste.rs
- **Emerging GitHub Repos** — GitHub Search API, ranked by recent star velocity

### Finance

- **Earnings** — upcoming/recent earnings with EPS/revenue actuals vs estimates (FMP API + RSS fallback)
- **Deals & M&A** — funding rounds, acquisitions, IPO filings (FMP API + Google News RSS)
- **Research Reports** — Citrini, ARK Invest, a16z, Delphi Digital, and other publications via RSS
- **Macro** — FRED indicators (CPI, PCE, unemployment, Fed funds rate) + Fed calendar events

### Markets

Markets is a private, evidence-first investment workflow—not a trading terminal. Its flow is deliberately separated:

1. **Candidate Scout** identifies names worth investigating across the S&P 500, Russell 2000, technology themes, and user-owned/watchlisted/thesis names. It can surface leadership, dislocations, and thesis-led selloffs; a price decline is not automatically a rejection.
2. **Stock dossier** provides a deterministic partial brief: why it surfaced, what changed, the remaining question, risks, decisive numbers, price history, and links to the underlying feeds. This is screening evidence, not an investment recommendation.
3. **Full equity research** builds a durable CompanyPacket and a validated, 15-section research note. Each refresh creates a new immutable version and explains whether the opinion became more constructive, less constructive, or stayed unchanged.
4. **Theses and portfolio decisions** remain explicit user-reviewed records. Monitoring can flag entry-zone, kill-criteria, and material thesis events, but it never silently changes an accepted view or places trades.

Current CompanyPacket evidence includes Alpaca price history; FMP statements, ratios, analyst estimates, segments, grades, peers, and the latest two earnings-call transcripts; SEC filing links; stored company events; industry context; and prior user research/thesis context. Forward P/E uses the nearest positive annual consensus EPS estimate and remains blank when that estimate is unavailable or non-positive.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4, IBM Plex Sans/Mono |
| State | Zustand (theme) + SWR (data fetching) |
| Data sources | RSS/Atom feeds, arXiv API, HN Algolia, GitHub Search, FMP, FRED, SEC EDGAR |
| AI | Server-only OpenAI/Codex synthesis for Markets research; legacy intelligence workflows remain separately managed |
| Caching | Two-tier: in-memory Map + Upstash Redis (REST API) |
| Persistence | Supabase (overview storage) |
| Scheduling | Upstash QStash (cron job triggers with signature verification) |
| Deployment | Vercel |
| Long-running work | Private macserver worker (Supabase queue) |

---

## Getting Started

```bash
git clone https://github.com/yourusername/stratum.git
cd stratum
npm install
cp .env.example .env.local  # Add API keys
npm run dev
```

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Yes | Redis cache tier |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Redis auth |
| `SUPABASE_URL` | Yes* | Overview and Markets persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes* | Server-only persistence access |
| `MARKETS_ACCESS_PASSWORD_HASH` | Yes* | PBKDF2 hash for the private Markets workspace |
| `MARKETS_SESSION_SECRET` | Yes* | Signs the private, HttpOnly Markets session |
| `QSTASH_CURRENT_SIGNING_KEY` | Yes* | QStash cron verification |
| `QSTASH_NEXT_SIGNING_KEY` | Yes* | QStash cron key rotation |
| `ANTHROPIC_API_KEY` | No | AI overviews & morning brief (falls back to static content) |
| `FMP_API_KEY` | No | Finance earnings/deals enrichment |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | Worker | Server-side US-equity snapshots and bars |
| `CODEX_API_KEY` | Worker | Scoped key for background schema-constrained research synthesis |
| `STRATUM_SOURCE_SCOUT_MODEL` | Worker | Cheap model tier for non-authoritative source candidates |
| `STRATUM_MARKET_STANDARD_MODEL` | Worker | Bounded planning and prediction-evaluation tier |
| `STRATUM_MARKET_RESEARCH_MODEL` | Worker | Strong analyst/critic tier for durable market artifacts |
| `FRED_API_KEY` | No | Macro indicators from FRED |
| `SEC_API_USER_AGENT` | No | SEC EDGAR requests |
| `GITHUB_TOKEN` | No | Higher GitHub API rate limits |

\* Required for the morning brief and periodic overview features. All other optional variables degrade gracefully — the dashboard works without them, just with fewer data sources.

### Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npm test          # Run all tests (Node built-in test runner)
```

---

## Architecture

```
app/
  [scope]/page.tsx              # Dynamic scope page (validates ID, renders ScopeFeed)
  morning-brief/page.tsx        # Morning brief page
  api/
    ai-research/                # Dedicated API routes per section
      papers/route.ts
      discussions/route.ts
      repos/route.ts
      overview/route.ts         # Claude-powered daily AI briefing
      news/[topic]/route.ts     # RSS news by topic
      ...
    finance/
      earnings/route.ts
      deals/route.ts
      reports/route.ts
    macro/indicators/route.ts
    morning-brief/route.ts      # Public GET — latest morning brief
    overviews/[type]/route.ts   # Public GET — weekly/monthly overviews
    cron/                       # QStash-triggered POST routes
      morning-brief/route.ts    # Daily at 12 PM UTC
      weekly-overview/route.ts  # Mondays at 1 PM UTC
      monthly-overview/route.ts # 1st & 15th at 2 PM UTC
    [scope]/[section]/route.ts  # Generic fallback (mock data)

components/
  sections/                     # ScopeFeed, ScopeSection, AIOverview
  items/                        # PaperItem, DiscussionItem, RepoItem, NewsItem, EarningsItem
  layout/                       # ClientLayout, NavPanel, ScopeHeader, ThemeToggle

lib/
  scopes.ts                     # Scope/section registry (central config)
  types.ts                      # All TypeScript interfaces
  data/                         # Data fetchers (one per external source)
    morning-brief.ts            # Morning brief generator (14 sources + Claude Sonnet)
    overview.ts                 # Daily overview generator (Claude Haiku)
    overview-generators.ts      # Weekly/monthly overview generators (Claude Sonnet)
    overview-persistence.ts     # Supabase read/write for all overview types
  server/
    cache.ts                    # Two-tier cache with stale fallback + dedup
    http-cache.ts               # Standardized Cache-Control headers
    supabase.ts                 # Supabase client singleton

store/
  theme.ts                      # Zustand theme store
```

**Data flow:** Client (`ScopeFeed` via SWR) -> API routes -> `cachedFetchWithFallback()` -> external APIs. Cache layers: in-memory -> Redis -> fresh fetch -> stale fallback.

**Markets data flow:** private worker -> Supabase materialized data and immutable artifacts -> Vercel read APIs -> authenticated Markets UI. The browser never calls Alpaca/FMP directly and Vercel never starts a Codex process during a page view.

See [Markets deployment](docs/markets-deployment.md) for the queue, worker, credential boundary, and production operations.

---

## Roadmap

- [x] AI-generated daily overview bullets per scope
- [x] Morning brief — daily synthesized intelligence digest
- [x] Weekly and monthly periodic overviews (Claude Sonnet)
- [x] Article summarization — Claude-powered inline summaries with streaming markdown
- [x] Semantic tagging on feed items (in progress)
- [x] Mobile-responsive layout with collapsible nav
- [ ] Semantic search over paper abstracts (local embeddings)
- [ ] Trend clustering across sources
- [ ] Keyboard shortcuts
- [ ] Saved filters / watchlists
- [ ] Drag-to-reorder panels

---

## Inspiration

- [tldr.tech](https://tldr.tech) — curated tech newsletter model
- [Exploding Topics](https://explodingtopics.com) — trend detection UI

---

## License

MIT
