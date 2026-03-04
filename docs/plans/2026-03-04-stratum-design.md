# Stratum — Product Requirements Document

> **Version:** 0.1 draft
> **Date:** 2026-03-04
> **Status:** Approved for implementation

---

## 1. Product Vision

Stratum is a minimalist, text-first intelligence dashboard for people who need to track technology, research, startups, and markets — without noise.

The core metaphor is a **curated newspaper front page**, dynamically assembled per domain. The user picks a scope (e.g. "AI Research"), and Stratum presents a clean, structured feed of everything worth paying attention to in that domain: papers, threads, repos, filings, earnings, deals — organized by section, refreshed automatically.

**What Stratum is:**
- A fast, focused feed organized by domain scope
- Text-dense, monochrome, data-first
- A signal aggregator with smart sections per topic
- A foundation built to add AI-powered features incrementally

**What Stratum is not:**
- A news aggregator with images, headlines, and ads
- A draggable panel dashboard (à la Bloomberg Terminal)
- A social media replacement
- An all-in-one reader with algorithmic ranking

**Design north star:** If the Wall Street Journal's front page and a terminal had a minimalist child, this is it.

---

## 2. UI/UX Design

### 2.1 Layout Overview

```
┌──────────────────┬───────────────────────────────────────────────────────┐
│                  │                                                         │
│   STRATUM        │   AI Research                                           │
│                  │   ──────────────────────────────────────────────────   │
│   ──────────     │   Last updated: 4 min ago                              │
│                  │                                                         │
│   AI Research    │   ┌─ Research Papers ──────────────────────────────┐   │
│   Finance        │   │  arXiv  ·  alphaXiv  ·  Semantic Scholar       │   │
│   Startups       │   ├────────────────────────────────────────────────┤   │
│   Releases       │   │  Scaling Laws for Reward Model Overoptimization │   │
│   Markets        │   │  Amodei et al.  ·  cs.LG  ·  2h ago            │   │
│   Macro          │   │                                                 │   │
│                  │   │  Phi-4 Technical Report                         │   │
│   ──────────     │   │  Microsoft Research  ·  cs.CL  ·  5h ago        │   │
│   ☀ / 🌙        │   │                                                 │   │
│                  │   │  (3 more)                                       │   │
│                  │   └─────────────────────────────────────────────────┘   │
│                  │                                                         │
│                  │   ┌─ Trending Discussions ──────────────────────────┐   │
│                  │   │  Hacker News  ·  Lobste.rs                     │   │
│                  │   ├────────────────────────────────────────────────┤   │
│                  │   │  Ask HN: What are you building with LLMs?      │   │
│                  │   │  847 pts  ·  312 comments  ·  3h ago           │   │
│                  │   │                                                 │   │
│                  │   │  Show HN: I built a local Perplexity clone     │   │
│                  │   │  412 pts  ·  89 comments  ·  6h ago            │   │
│                  │   └─────────────────────────────────────────────────┘   │
│                  │                                                         │
│                  │   ┌─ GitHub Trending ───────────────────────────────┐   │
│                  │   │  daily  ·  weekly                               │   │
│                  │   ├────────────────────────────────────────────────┤   │
│                  │   │  ...                                            │   │
└──────────────────┴───────────────────────────────────────────────────────┘
```

### 2.2 Left Sidebar

- **Fixed position**, ~220px wide, full viewport height
- Divided into: wordmark at top, scope list in the middle, utilities (theme toggle) at the bottom
- Scope list items: left-border accent on active scope, no icon (text only)
- Scope navigation changes the center feed immediately (client-side routing via Next.js `<Link>`)
- Collapsed to a top horizontal nav bar on mobile (≤768px)

### 2.3 Center Feed

- Scope title: large, clean, left-aligned heading
- Subtitle line: "Last updated X min ago" — refreshes on data fetch
- Vertical stack of **SectionContainers**, each containing one data category
- No horizontal split, no right panel — single scrollable column
- Sections are ordered by the scope registry (defined in `lib/scopes.ts`)

### 2.4 Section Container

Each section is a self-contained block with:
- **Header row**: section label (left) + source chips (right, e.g. `arXiv · Semantic Scholar`)
- **Divider line** below the header
- **Scrollable content area**: 3–5 items visible by default, scroll to see more
- **Border**: 1px solid, `border-radius: 8px`
- **"N more" footer** (tappable) if items overflow — expands or links to a full view
- Sections have a max-height to prevent any single section from dominating the page

### 2.5 Item Cards (text-only)

Each item inside a section is a compact text row. No images. Layout per item type:

**Paper (arXiv):**
```
Title of the Paper                                        [link →]
AuthorName et al.  ·  cs.LG  ·  2h ago
```

**Discussion (HN/Lobsters):**
```
Ask HN: What are people building with local LLMs?        [link →]
847 pts  ·  312 comments  ·  3h ago
```

**Repo (GitHub Trending):**
```
owner/repository-name  ·  TypeScript                     [link →]
★ 2,400 today  ·  "A fast local search engine"
```

**Earnings (Finance scope):**
```
NVDA  —  Nvidia Corp                                     [link →]
Q4 2025  ·  EPS: $0.89 actual vs $0.85 est  ·  Beat ↑
```

**News item:**
```
Headline text truncated to one line                       [link →]
TechCrunch  ·  Startup / Series B  ·  1h ago
```

### 2.6 Interaction Model

- **Scope switching**: click sidebar → updates URL and center feed
- **Section scroll**: independent scrollable area per section (overflow-y: auto on content div)
- **Item link**: entire row is clickable, opens external link in new tab
- **Theme toggle**: sidebar button, persisted in localStorage, applied via `data-theme` on `<html>`
- **Expand section**: "N more →" at bottom of section reveals additional items

---

## 3. Design System

### 3.1 Color

Monochrome base, with semantic color used sparingly and only where meaning is critical.

**CSS custom properties (via Tailwind config + globals.css):**

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--bg` | `#0c0c0c` | `#f5f5f5` | Page background |
| `--surface` | `#141414` | `#ffffff` | Section containers |
| `--surface-2` | `#1c1c1c` | `#f0f0f0` | Item hover, sub-surfaces |
| `--border` | `#2a2a2a` | `#e0e0e0` | Section borders |
| `--border-subtle` | `#1f1f1f` | `#ebebeb` | Item dividers |
| `--text` | `#e8e8e8` | `#111111` | Primary text |
| `--text-dim` | `#888888` | `#666666` | Metadata, timestamps |
| `--text-muted` | `#555555` | `#9a9a9a` | De-emphasized labels |
| `--accent` | `#ffffff` | `#000000` | Active scope indicator |
| `--green` | `#22c55e` | `#16a34a` | Positive delta (markets) |
| `--red` | `#ef4444` | `#dc2626` | Negative delta (markets) |

**Rule:** Only `--green` and `--red` are used for semantic color. Everything else is grayscale.

### 3.2 Typography

- **Primary font**: `Inter` (variable), fallback `system-ui, -apple-system, sans-serif`
- **Base size**: 13px
- **Line height**: 1.5 for body, 1.2 for headings
- **Font weight hierarchy**: 700 (headings), 600 (section labels), 500 (item titles), 400 (metadata)
- **Letter spacing**: normal for body; `0.04em` for uppercase labels

| Element | Size | Weight | Notes |
|---|---|---|---|
| Scope title | 22px | 700 | Uppercase, tight tracking |
| Section label | 11px | 700 | Uppercase, letter-spaced |
| Item title | 13px | 500 | Normal case |
| Item metadata | 11px | 400 | `--text-dim` color |
| Sidebar scope | 13px | 500 | Active = 600 |
| Source chip | 10px | 600 | Uppercase |

### 3.3 Spacing

Base unit: 4px. Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48px.

- Section gap (vertical between sections): 16px
- Section padding (inside container): 12px 16px
- Item padding: 8px 0
- Sidebar padding: 20px
- Section border-radius: 8px
- Item hover border-radius: 4px

### 3.4 Dark Mode

Dark is the default. Light mode is opt-in via toggle.

```
// Applied before first paint (in <head> via script tag — prevents flash)
const theme = localStorage.getItem('stratum-theme') || 'dark'
document.documentElement.dataset.theme = theme
```

CSS selectors:
```css
:root { /* dark defaults */ }
[data-theme="light"] { /* light overrides */ }
```

Tailwind: configure `darkMode: ['attribute', '[data-theme="dark"]']` so `dark:` utilities work.

Transition on toggle: `0.15s ease` on background-color, color, border-color.

### 3.5 Animation

Minimal. Only:
- Theme switch: 0.15s color/bg/border transitions
- Item hover: background-color 0.1s ease
- Section "show more" expand: max-height 0.2s ease

---

## 4. Architecture

### 4.1 Project Structure

```
Stratum/
├── app/
│   ├── layout.tsx               # Root: ThemeProvider, Sidebar, main wrapper
│   ├── page.tsx                 # Redirect → /ai-research (default scope)
│   ├── [scope]/
│   │   └── page.tsx             # Main feed page, renders ScopeHeader + sections
│   └── api/
│       └── [scope]/
│           └── [section]/
│               └── route.ts    # API route stub per section (empty for v0.1)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx          # Fixed left nav
│   │   ├── ScopeHeader.tsx      # Scope title + last-updated
│   │   └── ThemeToggle.tsx      # Dark/light switch
│   ├── sections/
│   │   ├── SectionContainer.tsx # Border wrapper, header, scroll area
│   │   └── SectionHeader.tsx    # Label + source chips
│   └── items/
│       ├── PaperItem.tsx        # arXiv paper row
│       ├── DiscussionItem.tsx   # HN/Lobsters thread row
│       ├── RepoItem.tsx         # GitHub trending row
│       ├── EarningsItem.tsx     # Earnings row
│       └── NewsItem.tsx         # Generic news row
├── lib/
│   ├── scopes.ts                # Scope registry (id, label, sections[])
│   ├── types.ts                 # Shared TypeScript interfaces
│   └── mock-data.ts             # Static mock data for v0.1
├── store/
│   └── theme.ts                 # Zustand: theme state (dark/light)
├── styles/
│   └── globals.css              # CSS custom properties, base resets
├── tailwind.config.ts           # Extends Tailwind with design tokens
├── next.config.ts
└── tsconfig.json
```

### 4.2 Routing

Next.js App Router with a single dynamic route:

- `/` → redirect to `/ai-research`
- `/[scope]` → renders the feed for that scope

Scope IDs are slugs defined in `lib/scopes.ts`. Invalid slugs fall back to 404 or redirect to default.

### 4.3 Scope Registry

`lib/scopes.ts` is the single source of truth for what exists in the app.

```typescript
export interface SectionDef {
  id: string
  label: string
  sources: string[]        // Display chips (e.g. ['arXiv', 'Semantic Scholar'])
  itemType: ItemType       // Determines which item component to render
  apiPath: string          // e.g. '/api/ai-research/papers'
}

export interface ScopeDef {
  id: string
  label: string
  sections: SectionDef[]
}

export const SCOPES: ScopeDef[] = [
  {
    id: 'ai-research',
    label: 'AI Research',
    sections: [
      { id: 'papers', label: 'Research Papers', sources: ['arXiv', 'alphaXiv', 'Semantic Scholar'], itemType: 'paper', apiPath: '/api/ai-research/papers' },
      { id: 'discussions', label: 'Trending Discussions', sources: ['Hacker News', 'Lobste.rs'], itemType: 'discussion', apiPath: '/api/ai-research/discussions' },
      { id: 'repos', label: 'GitHub Trending', sources: ['GitHub'], itemType: 'repo', apiPath: '/api/ai-research/repos' },
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    sections: [
      { id: 'earnings', label: 'Earnings', sources: ['SEC EDGAR', 'Earnings Whispers'], itemType: 'earnings', apiPath: '/api/finance/earnings' },
      { id: 'deals', label: 'Deals & M&A', sources: ['Crunchbase', 'Bloomberg'], itemType: 'news', apiPath: '/api/finance/deals' },
      { id: 'research-reports', label: 'Research Reports', sources: ['Citrini', 'ARK', 'a16z', 'Delphi'], itemType: 'news', apiPath: '/api/finance/reports' },
    ]
  },
  {
    id: 'startups',
    label: 'Startups',
    sections: [
      { id: 'funding', label: 'Funding Rounds', sources: ['Crunchbase', 'Axios Pro Rata'], itemType: 'news', apiPath: '/api/startups/funding' },
      { id: 'news', label: 'Startup News', sources: ['TechCrunch', 'The Information'], itemType: 'news', apiPath: '/api/startups/news' },
    ]
  },
  {
    id: 'releases',
    label: 'Releases',
    sections: [
      { id: 'models', label: 'Model Releases', sources: ['tracked entities'], itemType: 'news', apiPath: '/api/releases/models' },
      { id: 'products', label: 'Product Launches', sources: ['Product Hunt'], itemType: 'news', apiPath: '/api/releases/products' },
      { id: 'repos', label: 'GitHub Trending', sources: ['GitHub'], itemType: 'repo', apiPath: '/api/releases/repos' },
    ]
  },
  {
    id: 'markets',
    label: 'Markets',
    sections: [
      { id: 'earnings-cal', label: 'Earnings Calendar', sources: ['SEC EDGAR', 'Earnings Whispers'], itemType: 'earnings', apiPath: '/api/markets/earnings-calendar' },
      { id: 'macro', label: 'Macro Signals', sources: ['FRED', 'Fed Calendar'], itemType: 'news', apiPath: '/api/markets/macro' },
    ]
  },
  {
    id: 'macro',
    label: 'Macro',
    sections: [
      { id: 'indicators', label: 'Key Indicators', sources: ['FRED'], itemType: 'news', apiPath: '/api/macro/indicators' },
      { id: 'events', label: 'Fed & Policy Events', sources: ['Fed Calendar', 'FOMC'], itemType: 'news', apiPath: '/api/macro/events' },
    ]
  },
]
```

### 4.4 Data Fetching (v0.1: mock; v0.2+: live)

- Each section calls its `apiPath` via SWR
- In v0.1: API routes return static mock data from `lib/mock-data.ts`
- In v0.2+: API routes become real Vercel Edge Functions that call external APIs, cache via Upstash Redis

SWR config:
```typescript
// Per-section fetch, revalidates on focus + every 5 min by default
const { data, error, isLoading } = useSWR(section.apiPath, fetcher, {
  refreshInterval: 5 * 60 * 1000,
  revalidateOnFocus: true,
})
```

### 4.5 State Management

Zustand is used only for cross-component state. In v0.1 that is:
- `theme`: `'dark' | 'light'` — shared between ThemeToggle and CSS

Active scope is derived from the URL (Next.js route param), not stored in Zustand. This keeps URLs shareable and SSR-compatible.

---

## 5. v0.1 Milestone — Shell Complete

**Goal:** A fully functional, visually polished shell with mock data. No live API calls. Every design decision made once and made right.

### Acceptance criteria

- [ ] Next.js project initialized: App Router, TypeScript strict, Tailwind, ESLint
- [ ] `tailwind.config.ts` extends theme with all design tokens (colors, font sizes, spacing)
- [ ] `globals.css` defines all CSS custom properties for dark + light themes
- [ ] `lib/scopes.ts` defines all 6 scopes with their sections
- [ ] `lib/types.ts` defines `ScopeDef`, `SectionDef`, `ItemType`, and per-item interfaces
- [ ] `lib/mock-data.ts` has 4–6 realistic items per section for all scopes
- [ ] Sidebar renders all scope names, highlights active scope, clicking navigates
- [ ] `/[scope]` route renders scope title + ordered sections
- [ ] SectionContainer renders header, source chips, item list, "N more" placeholder
- [ ] All 5 item component types render correctly from mock data
- [ ] Dark/light toggle works, persisted in localStorage, no flash on load
- [ ] API route stubs exist at each `apiPath` (return mock data for now)
- [ ] Mobile: sidebar collapses to horizontal nav at ≤768px
- [ ] No console errors, TypeScript strict mode passes

### Not in v0.1

- Live API calls
- SWR polling (stubs just load mock data synchronously)
- AI summaries or tagging
- Search
- Keyboard shortcuts
- Animations beyond hover + theme toggle transition

---

## 6. Roadmap

### v0.2 — First Live Data
- arXiv API → Research Papers section
- HN Algolia API → Discussions section
- GitHub Trending scraper → Repos section
- Vercel Edge Function API routes with Upstash Redis caching
- SWR polling active; "last updated" counter live

### v0.3 — Finance Layer
- SEC EDGAR filings → Earnings sections
- Crunchbase API → Deals & Funding sections
- RSS feeds → Research Reports, Startup News
- Earnings calendar with upcoming/recent view

### v0.4 — AI Layer
- Claude API: 2–3 sentence summary per paper abstract and long article
- Auto-tagging (AI, biotech, energy, crypto, defense)
- Local semantic search (ONNX all-MiniLM-L6-v2 in Web Worker, IndexedDB vector store)
- Trend clustering: group related stories across sources

### v1.0 — Polish
- Global search (cmd+K) across all sections
- Saved watchlists / custom scope filters
- Keyboard shortcuts for scope navigation
- Export to Markdown or Notion
- Mobile-responsive layout finalized
- PWA support

---

## 7. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR-friendly, Vercel-native, App Router = server components for initial data |
| Language | TypeScript (strict) | Type safety from day 1 |
| Styling | Tailwind CSS 4 | Utility classes + custom theme extension for design tokens |
| State | Zustand | Minimal, no boilerplate |
| Data fetching | SWR | Simple client-side revalidation; pairs with Edge Functions |
| API layer | Vercel Edge Functions | Low latency, same repo, matches worldmonitor's gateway pattern |
| Caching | Upstash Redis | Serverless Redis, works on Edge runtime |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | Summaries, tagging, semantic analysis |
| Embeddings | ONNX (all-MiniLM-L6-v2) in Web Worker | Local vector search, no API cost |
| Deployment | Vercel | Co-located with Edge Functions |

**Required env vars (add to `.env.local`):**
```
ANTHROPIC_API_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
CRUNCHBASE_API_KEY=     # v0.3+
FRED_API_KEY=           # v0.3+
```

---

## 8. Reference: worldmonitor Patterns to Adapt

Stratum deliberately differs from worldmonitor in layout (feed vs panels) but can borrow:

| worldmonitor pattern | Stratum adaptation |
|---|---|
| CSS variables + `[data-theme]` attribute | Same pattern, via Tailwind `data-theme` config |
| Cache tier system in gateway.ts | Same tiers (fast/medium/slow/daily) in Edge Functions |
| Per-source circuit breaker | Replicate in Edge route error handling |
| RefreshScheduler hidden-tab awareness | SWR `revalidateOnFocus` + `refreshInterval` covers this |
| `color-mix()` for semantic color tints | Use in SectionContainer active state, item highlights |
| 6px custom scrollbar styling | Replicate in globals.css for section scroll areas |
| Virtual scrolling for long lists | Add in v0.2+ when real data volume is known |

**Key worldmonitor files for reference:**
- `worldmonitor/server/gateway.ts` — cache tier + auth gateway pattern
- `worldmonitor/src/components/Panel.ts` — lifecycle pattern (adapt to React components)
- `worldmonitor/src/styles/main.css` — full CSS variable reference
- `worldmonitor/src/app/refresh-scheduler.ts` — polling logic (adapt to SWR config)

---

## 9. Open Questions (to resolve in v0.2)

1. **arXiv filtering**: which categories does "AI Research" scope pull? (cs.AI, cs.LG, cs.CL, stat.ML)
2. **Earnings calendar**: does it show upcoming earnings (calendar view) or past (results view) by default?
3. **Section ordering within scope**: fixed order per scope registry, or user-configurable later?
4. **"N more" behavior**: expand inline, or navigate to a dedicated full-section page?
5. **Rate limits**: GitHub Trending requires scraping (no official API) — need proxy or third-party service?
