# Ownership research contract 2

Contract 2 and recommendation policy `prospective-v1.7` distinguish evidence completeness from support for a particular capital action. Historical reports and editions remain immutable and readable.

Each current assessment records cited support for Buy, Add, Hold, Trim and Sell; classified evidence gaps; explicit scenarios; the operating story, competitive position and strongest opposing case; and observable reversal conditions. Gaps distinguish capture failures, missing present facts, undisclosed metrics and future uncertainty. A conclusion cannot depend on an unsupported assumption. A limitation that blocks adding capital need not block independently supported retention or reduction. Price, identity, timestamps, liquidity, cash, sizing and the independent recommendation critic still apply.

The research contract lives in `lib/markets/research-contract.ts`. Current contracts require complete advice dimensions and decision support; legacy financial ratings cannot silently supply these fields. Hold needs affirmative retention grounds, Trim needs a positive reduction target, and Sell needs exit grounds and a zero target. An unresolved ownership stance must name the precise question and its next check.

## Investigation scheduling

The existing worker and durable queue schedule all authoritative positive holdings, deduplicated across accounts. Equity and issuer-backed ETF research use separate existing generation paths. Upgrade keys are stable by owner, symbol and target contract version. `forceFullResearch` prevents a fresh legacy report from returning through ordinary repricing or revalidation. Failed prerequisites remain visible; unchanged unresolved questions wait for their recorded checkpoint.

The database enforces eight full investigations per owner per New York calendar date, including idempotent starts and retries. Before the owned backfill finishes, six slots prioritize holdings and two rotate across interests. Afterwards, up to two serve holding maintenance and six serve interests. The selector borrows unused capacity, deduplicates overlapping themes and respects failure cooldowns. Existing worker concurrency and model configuration remain in force.

Owner-scoped interest inventories cover AI, photonics, nuclear, energy, sustainable energy and space. Managed membership is separate from manual watchlist limits and preserves owner exclusions. Classification uses active tradable US assets, existing provider classifications, confirmed theme symbols and product mappings with provenance. Confirmed additional names enter the existing search-coverage mechanism. Feed failures and unclassified listings remain visible rather than being treated as negative membership evidence.

The authenticated `/api/markets/research/coverage` read model and `/markets/research` coverage view expose investigation, upgrade, backlog, failure and next-check information. A name is decision-ready only when a current passed capital recommendation uses that exact contract-2 report version. Successful research completion alone does not establish decision readiness. Existing outcome and calibration reporting retains its separation between hypothetical outcomes and owner execution; this release makes no claim of demonstrated investment improvement.

Replacement recommendation preparation waits for all same-day research dependencies, including queued work scheduled later that day, and source repairs. Future-day backfill jobs do not hold an edition for days. Publication freezes terminal results, including failed prerequisites, and the independent critic checks proposed decisions against that frozen context.

## Scoped rollout checkpoint — October 3, 2026, 10:09 UTC

The feature branch is `codex/recommendation-decision-repair`, with product changes through `29ce8db`. The compatible production port is `codex/ownership-decisions-prod`, based on the previously deployed application baseline. Its worker revision is `8a5f44e8233c487df0b59bb3220f27465ddcd41b`; readers include the subsequent date/progress display correction at `38989046a13d1f03895e1784dcc2667b3e1d59aa`. The Vercel ignored-build hold (`exit 0`) remains in place; unrelated main-branch releases and migrations remain held.

Only these migrations were applied and recorded:

- `202610030001_research_interest_coverage.sql`: owner inventories, memberships and capped investigation reservations.
- `202610010007_research_refresh_checks.sql`: the narrow append-only checkpoint prerequisite used to prevent repeated checks of unchanged questions.

The final scoped readers are promoted to `stratum.aarushagarwal.dev`, deployment `dpl_HHxai1NTFyF7QD3yt4EZrF4W5hU5`. The macserver worker was activated at an observed idle queue point and reports healthy with the verified worker revision. Its previous release is retained for rollback. The reader-only follow-up does not restart active investigations.

All 24 current unique holdings have durable upgrade jobs. Six holdings per day are scheduled October 3–6; today's two interest investigations are Lumentum and AST SpaceMobile. At this checkpoint eight slots are reserved for October 3 and six holding slots for each following backfill day. Four investigations have started; AMD and Lumentum have completed and persisted validated contract-2 research. AMD has cited retention support with separate unresolved Buy/Add support. Lumentum has a specific unresolved entry question and a follow-up at earnings, production-deployment announcements or qualification updates. GRID routes to issuer-backed ETF research. The replacement edition preparation job `e3a6d535-110b-4fcc-aa57-ab5ab4a934e3` succeeded with nine dependencies (eight investigations and one market-source repair), and publication continuation `ee40b535-1b78-45db-bb39-4cb790757f34` waits for their terminal states.

The persisted inventory contains 551 confirmed symbols and 624 memberships across the six themes. It exposes 2,751 classification gaps among 13,205 eligible listings. Two exchange classification feeds are unavailable under the existing provider subscription; a bounded fallback is explicitly recorded as truncated. These figures establish a persisted backlog, not exhaustive successful classification of every listing.

Validation passed: 816 tests on the feature branch and 794 on the scoped release, each with one existing skip; lint without errors; production builds; and full tests/build on the staged macserver release. The subsequent reader correction passed focused date/coverage/preparation tests and a production build. Both local and authenticated production coverage were checked at 1672 × 941: theme selection, scheduled dates including Lumentum, no horizontal overflow, no console error or framework overlay after the correction. Live exclusion and restoration persisted correctly; the original preference was restored. Fresh unauthenticated production requests confirm the coverage endpoint rejects private reads and the research page redirects to sign-in.

Acceptance remains open: one of 24 holdings has contract-2 research, all others are scheduled, and the independently reviewed replacement edition remains pending. Completion requires each current holding to have contract-2 research or a documented failed prerequisite, plus verification of frozen report versions, reviewer results, live decisions and continued thematic progress. Automatic approval review rejected exporting the entire production environment for verification; no production environment file was exported. The existing authenticated in-app browser session provided the live UI check instead.

World remains shadow-only. This release adds no trading execution, data subscription or financial credentials.
