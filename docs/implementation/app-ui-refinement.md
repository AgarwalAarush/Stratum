# App UI refinement — October 1, 2026

The Intelligence dashboard previously reserved a large, empty half-panel when
synthesis was unavailable. It now uses a compact status notice followed by live
source lists. Available synthesis shows two observations, with the complete
analysis and provenance available through disclosures. All eleven AI Research
source groups remain accessible; Global News uses the same adaptive layout.

Shared chrome is 56 pixels high with a 44-pixel navigation row. Content uses a
1520-pixel workspace, consistent gutters, restrained serif headings, stronger
metadata contrast and an olive interaction accent. The product switch remains
visible on mobile, with Intelligence settings and refresh inside its menu.

Research uses searchable report cards with separate rating and entry labels.
Portfolio summaries, Today, World, Explore and Recommendations use tighter
spacing. Full research revision comparisons adapt to the number of entries,
including a full-width layout for a single comparison. Source timestamps,
immutable version metadata, existing warnings and owner-review semantics remain
visible. UI changes do not enqueue research or modify portfolio records.

Relative times receive a shared server/browser reference at first render and
update every minute thereafter. This avoids hydration mismatches at minute
boundaries; absolute fallback dates use UTC consistently.

## Verification

- Production build and scoped ESLint passed. Existing ScopeFeed test helpers
  produce two unused-variable warnings, with no lint errors.
- Complete suite: 766 tests, 765 passed, one skipped, zero failures.
- Desktop 1672 × 941 and mobile 390 × 844: AI Research, Global News, Today,
  Portfolio, Research library, World, Explore, Recommendations, Market Overview,
  Screener and a full company research report. No page-wide horizontal overflow.
- Dark rendering: AI Research on mobile, plus Research, Portfolio, Today and
  World on desktop; unavailable synthesis was checked in both themes.
- Interactions: research search and its no-results reset, category dialog focus
  trapping/Escape/focus restoration, mobile settings navigation, complete
  synthesis disclosure, and full World assessment disclosure.
- A temporary unavailable-synthesis fixture used real cached feeds with a
  clearly labeled local test state. Its notice measured 47.5 pixels high.
  The route was removed before the final build and commit.
- Thirty-six local screenshots preserve seven before views and twenty-nine
  after/verification views. They remain outside Git because some captures
  contain private financial information.

## Delivery boundary

The existing production hold described in `decision-loop-program.md` remains in
effect. Current `main` includes Releases 2–5 and the foundation correction;
migrations 202610010006–008 and matching worker activation remain pending.
Vercel's held Git builds were verified as canceled. The production alias still
points to commit `8361d2b96c02a70400df466a74a2ac9e67fead29`.

Automatic approval review rejected an unspecified deployment because it could
activate the held backend releases without their matched prerequisites. This UI
feature requires no migration or backfill itself, but deploying the current main
branch requires the separately authorized coordinated rollout. A local build or
Git merge does not establish production delivery.
