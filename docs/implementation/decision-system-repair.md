# Decision system repair

This change extends the existing research, immutable recommendation, watchlist,
and private-worker pipeline. Ownership judgments and research progress are
separate. No order execution is involved.

## Shared report contract

`researchContractVersion: 1` identifies a complete analytical upgrade, independently
of immutable report version numbers and `advice.version`. Existing business,
evidence, new-capital and ownership dimensions keep their existing meanings.

`evidenceAssessment.version: 1` records every known collection/coverage gap by a
stable ID, its availability, the actions it prevents, and its resolution path.
Availability distinguishes a retrieval failure, an incomplete investigation, and
a fact the company does not publicly disclose. A material gap prevents each
action in `affectedActions`; an explanation cannot waive it.

`actionSupport` records supported actions with captured source IDs, an explanation,
all reviewed gap IDs, and observable reversal conditions. The independent
recommendation reviewer checks materiality and the reasoning. Structural schema
validation establishes completeness and citation integrity, not truth or
investment performance.

An otherwise supported Hold/Trim/Sell can survive a limitation affecting only
Buy/Add. Identity, provenance, ownership, cutoff and applicable portfolio checks
remain required. Historical reports and editions are preserved without being
silently relabeled as upgraded. A missing/older research contract forces a full
report, even when a new packet is economically equivalent to the prior packet.

## Acceptance criteria

- A supported Hold and a supported exit survive an unrelated entry-only gap;
  the same actions fail when a material ownership gap, invalid identity, or
  unavailable supporting source exists.
- A current-contract report cannot omit known gaps, invent supporting sources,
  use uncaptured evidence, or unlock an action with a long justification alone.
- A portfolio whose holdings each have entry-only gaps still reaches generation
  and independent review. New-capital gates remain stricter.
- Contract upgrades precede equivalent/reprice/revalidate refresh paths; job
  deduplication must not reuse a completed older-contract repair.
- Equity and fund holdings follow their own research paths. Displayed current
  coverage requires the current contract and valid research freshness.
- Explicit interests bypass the price-driven discovery shortlist. Owned,
  interest/watchlist and rotation queues share bounded admission and record
  selection reasons, review dates and overdue state. Capacity shortages remain
  visible rather than creating a false service guarantee.
- Database access, persisted heartbeat, active worker release, research contract,
  queue state and published artifacts are distinct health signals. A running
  process or a ready web deployment alone does not prove a healthy pipeline.
- The laptop memo shows ownership and new-capital judgments separately, exposes
  limitations and actual blockers, and preserves the recommendation's own
  counter-case. Report generation status does not imply another job is queued.

## Ordered production acceptance

1. Apply the backward-compatible readiness and coverage migrations.
2. Deploy the integrated web and worker release; require database access and a
   fresh healthy worker heartbeat identifying the expected release and contract.
3. Seed the authorized interests additively and inspect the due queues.
4. Dry-run the bounded portfolio upgrade planner, then enqueue upgrades within
   the shared database admission limit and worker/provider concurrency limits.
5. Inspect accepted current-contract reports for every holding. Publish a new
   immutable recommendation edition after dependencies finish, retaining failed
   dependencies as explicit unresolved evidence.
6. Audit ownership judgments, opposing cases, reversal conditions, critic results,
   remaining decision gaps and overdue coverage. Never count directional actions
   or successful jobs as proof of investment quality.

If production credentials, migration access or private-worker connectivity are
missing, complete and verify the implementation and preserve the release behind
a reviewable branch. Do not merge application behavior around missing migrations
or claim the portfolio was regenerated.

## Implementation and verification state (2026-10-03)

The three workstreams are implemented together on `codex/decision-system-repair`.
The readiness and coverage migrations have been exercised against PostgreSQL
through PGlite. Regression coverage includes immutable decision generation,
independent reviewer vetoes, publication, action-specific company/fund gaps,
contract refreshes, daily review idempotency, owner isolation, bounded admission,
rollback release guards and deliberate rotation.

The complete test suite passes with 876 tests and one skip. The production
Next.js build and lint pass. The build in this managed environment
uses `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 NODE_USE_ENV_PROXY=1`
to fetch the existing Google Fonts through its configured TLS proxy. No build
checks were disabled. Standalone TypeScript checking retains existing test
fixture errors; comparison with the untouched base establishes no new errors.
The ownership/new-capital components were verified at 1672 × 941 in light and
dark modes using a clearly labeled temporary illustrative fixture, which was
removed from the release. This verifies presentation, not production judgments.

Production acceptance remains blocked: this environment has no Supabase service
credentials, configured outbound identity, VPN or permitted network path to
Supabase and the private worker. Read-only Vercel inspection found a READY web
deployment, without enough commit metadata to identify the worker release.
Neither observation establishes database or worker health. The readiness and
dry-run backfill commands fail closed, make no admissions and report incomplete.
No migration, production deployment, portfolio backfill or new recommendation
edition has been performed from this environment.

Resume with the existing private-worker environment and reconciled Supabase
migration history, following [the rollout commands](../markets-deployment.md#research-rollout-and-portfolio-upgrade).
Deployment, backfill and the per-holding outcome audit remain ordered acceptance
steps; local tests do not substitute for them.
