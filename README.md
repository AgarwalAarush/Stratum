# [PROJECT NAME] — Tech Intelligence Dashboard

> A minimalist, real-time aggregation dashboard for technology, research, startups, and finance — signal over noise.

---

## Overview

A focused intelligence layer for staying on top of everything that matters in tech: new research papers, startup moves, market-moving deals, earnings events, and breaking releases — all in one fast, clean interface. Inspired by the architecture and panel model of [worldmonitor.app](https://github.com/koala73/worldmonitor), but purpose-built for the tech and finance ecosystem.

**Design philosophy:** Minimalist. Black and white. Dense but never cluttered. Inline where possible. Information-first.

---

## Core Modules

### Research
- **arXiv / alphaXiv feed** — recent papers filtered by CS, AI/ML, physics, bio, quant
- **Semantic search** — natural language queries over recent paper abstracts (local embedding, ONNX model)
- **Paper cards** — inline abstract preview, author list, topic tags, PDF link
- **Trending papers** — ranked by citation velocity, social mentions, and alphaXiv engagement score

### Startup & Tech News
- Curated RSS + API feeds from TechCrunch, The Information, Axios Pro Rata, Bloomberg Tech, Hacker News
- **Startup spotlights** — up-and-coming companies in adjacent fields (energy, biotech, defense tech, climate)
  - e.g. TerraPower (Bill Gates / Wyoming nuclear), xAI, Perplexity, Anduril, etc.
- **Product releases** — tracked model/software/hardware drops (GPT-5.x, Gemini, CUDA releases, etc.)
- **Funding rounds** — Series A/B/C announcements, seed rounds from reputable sources

### Finance & Markets
- **Earnings calendar** — upcoming and recent earnings with EPS/revenue actuals vs estimates
- **Earnings reports** — inline summary cards pulled from SEC EDGAR + earnings transcript feeds
- **Research reports** — Citrini Research, Delphi Digital, a16z publications, Ark Invest, etc.
- **Deals tracker** — M&A, strategic partnerships, IPO filings, SPAC activity
- **Macro signals** — FRED key indicators (CPI, PCE, unemployment), Fed calendar events

### General Tech Signals
- GitHub trending repos (daily/weekly)
- Product Hunt daily launches
- Hacker News top threads
- Lobsters / Lobste.rs for systems/PL news
- Patent filings (USPTO) — optional advanced module

---

## Data Sources

| Category | Source |
|---|---|
| Papers | arXiv API, alphaXiv, Semantic Scholar |
| Startup news | TechCrunch, The Information, Axios, Bloomberg |
| Finance | SEC EDGAR, Yahoo Finance, FRED API, Earnings Whispers |
| Research reports | RSS feeds from Citrini, ARK, a16z, Delphi |
| Deals | Crunchbase API, PitchBook (via RSS), Bloomberg M&A |
| General tech | HN Algolia API, GitHub Trending scraper, Product Hunt API |
| Releases | Custom tracked entity list + RSS watchers |

---

## UI Design

**Aesthetic:** Monochrome first. Black text on white, with a dark mode toggle. No color except for semantic indicators (green/red for market moves, subtle badges for categories).

**Layout principles:**
- Masonry or CSS Grid panel layout — resizable, drag-to-reorder (worldmonitor-style)
- Inline previews: expand article/abstract without leaving the dashboard
- Compact card mode vs expanded reading mode per panel
- Rounded corners (8–12px radius), clean sans-serif typography
- Sticky header with global search, date filter, and module toggles
- No sidebar clutter — everything accessible via keyboard shortcuts or top bar

**Panels (default layout):**
1. Research Feed (arXiv/alphaXiv)
2. Startup News
3. Releases Tracker
4. Earnings Calendar
5. Deals & Reports
6. Macro Signals
7. Trending (GitHub + HN + PH)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Data fetching | SWR + Edge API routes |
| Backend / API | Vercel Edge Functions (mirroring worldmonitor's handler pattern) |
| AI features | Anthropic Claude API (summaries, semantic search, tagging) |
| Embedding / search | ONNX (all-MiniLM-L6-v2) in Web Worker, IndexedDB vector store |
| Caching | Redis (Upstash) with in-memory fallback |
| Deployment | Vercel |

Architecture heavily references worldmonitor's handler/gateway pattern: proto definitions → Edge Function handlers → typed service clients in the frontend.

---

## AI Features

- **Auto-summarization** — 2–3 sentence summaries on paper abstracts and long articles
- **Tag inference** — automatic topic tagging (AI, biotech, energy, crypto, defense, etc.)
- **Semantic search** — local vector search over ingested headlines and abstracts
- **Trend clustering** — group related stories across sources (e.g., "nuclear energy" cluster aggregates 6 articles from 4 sources)
- **Release detection** — classify and extract structured data from unstructured release notes

---

## Roadmap

**v0.1 — Core scaffold**
- [ ] Panel layout engine with drag-and-drop
- [ ] arXiv + HN feeds live
- [ ] Earnings calendar integration
- [ ] Basic dark/light theme

**v0.2 — Data layer**
- [ ] Startup news RSS aggregator
- [ ] Deals tracker (Crunchbase)
- [ ] GitHub trending panel
- [ ] Research reports RSS

**v0.3 — AI layer**
- [ ] Claude-powered summarization
- [ ] Local embedding + semantic search
- [ ] Trend clustering

**v1.0 — Polish**
- [ ] Keyboard shortcuts
- [ ] Saved filters / watchlists
- [ ] Export (Notion, markdown)
- [ ] Mobile-responsive layout

---

## Inspiration & References

- [worldmonitor.app](https://worldmonitor.app) / [GitHub](https://github.com/koala73/worldmonitor) — panel architecture, feed aggregation patterns, AI summarization pipeline
- [tldr.tech](https://tldr.tech) — curated tech newsletter model
- [Exploding Topics](https://explodingtopics.com) — trend detection UI
- [Morning Brew](https://morningbrew.com) — editorial style for finance/tech summaries

---

## Getting Started

```bash
git clone https://github.com/yourusername/[project-name].git
cd [project-name]
npm install
cp .env.example .env.local  # Add API keys
npm run dev
```

Required env vars: `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_URL`, `CRUNCHBASE_API_KEY`, `FRED_API_KEY`

---

## License

MIT
