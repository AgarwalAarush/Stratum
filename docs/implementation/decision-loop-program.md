# Decision-loop simplification delivery

October 3 reconciliation note: ownership repair PR 65, maintainability PR 72,
and coordinated release guards PR 73 are merged into main. Migrations 006–008
and the preparatory 030004 worker gate are applied. Calendar aging was applied
with database and file claims paused and zero running attempts; its 15,330
historical checkpoints are explicitly retrospective. The already-live 030002
freeze migration is restored in source and its live definition is unchanged.
Follow [coordinated-main-release.md](coordinated-main-release.md)
for current drain, staging, migration, activation, and verification procedures.
The October 1 snapshot below is historical; recheck live release and migration
evidence before reusing its pending-state descriptions.

Status on October 1, 2026: the complete program and foundation follow-up are
merged into `main`, with deployment explicitly held by the owner. Only the earlier
Release 1 worker/frontend changes are live. Primary collection remains blocked by
corpus disk capacity. PR 42's indirect shadow-boundary and truthful-readiness
corrections and Releases 2–5 are merged but not deployed. Migrations 006–008,
worker activation, backfills, retention and backup configuration remain unapplied.
Passing tests establish contracts and mechanics, not investment efficacy.

Vercel's Git integration automatically deploys `main`. To honor the merge-only
request, its ignored-build command was changed from `null` to `exit 0` before
merging. The merge attempts are canceled; the live domain retains its previous
release. Restore the original command only when deployment is authorized and the
matching migration/worker activation sequence is ready. GitHub merging alone is
not safe as a deployment gate for this project.

The owner subsequently authorized the app UI deployment. A UI-only backport
`137eb14` based on the existing live `8361d2b` release was promoted separately;
see `app-ui-refinement.md` for deployment and browser evidence. This does not
activate Releases 2–5 or the PR 42 backend corrections. The Git build gate and
their migration/worker/backfill prerequisites remain unchanged.

## Release boundaries

| Release | Implemented changes | Delivery and remaining gate |
| --- | --- | --- |
| 1 | Separate history ingestion, completed exchange sessions, per-security provenance, atomic snapshots, null-safe values, accepted-artifact reads, shadow isolation, blocked dependencies, isolated job processes, bounded pruning and reviewed retention tooling | PRs 36/37 merged; worker and frontend deployed. Historical bars and derived metrics verified through September 30 across a 2,523-row IEX snapshot. Primary document collection is blocked by capacity. |
| 2 | Four cited advice dimensions shared across research, validation and presentation; seven immutable calendar checkpoints; retrospective backfill; original legacy evaluators retained | Merged PR 38; not deployed. Migration 202610010006 pending. Actual recommendation backfill and live seven-task publication require the matched worker. |
| 3 | Shared unchanged/reprice/revalidate/full classifier; deterministic repricing; short condition checks; combined company/model generation; shared company/ETF lifecycle; semantic recommendation editions | Merged PR 39; not deployed. Migration 202610010007 pending. Price-only server replay performs no model invocation. Live cost/latency replay remains outstanding. |
| 4 | Git World authority, computed baselines, retired legacy writers, original prediction resolver retained, bounded analyst/critic work, four daily slots with one in five reserved across days, evidence-based shared briefing synthesis | Merged PR 40; not deployed. Migration 202610010008 pending. Six legacy beliefs passed read-only import validation; apply only after legacy writers are stopped. Benchmark/replay evidence remains unlabeled and cannot demonstrate learning. |
| 5 | Exact forecast resolution contracts, issuer-matched measured feedback in research, explicit feedback review, targeted decisive-premise revalidation, economic episode/correlation controls, primary-evidence and short-research baselines, independently rebuilt World arms, batched outcome price retrieval, named timeline UI | Merged PR 41; not deployed. Depends on migrations 006–008 and aligned frontend/worker. No efficacy or policy-promotion claim. |

## Contracts and preservation

New decision manifests declare forecast contract 2. Forecasts specify exact
period, units, resolution source, probability, threshold/operator, deadline and
confirmation/invalidation rules. Unsupported automatic metrics are rejected.
Legacy questions without a frozen resolution contract remain unresolvable rather
than being narrowed after their outcomes are known. Owner attestations require
the original period, units and resolution source; they cannot repair an ambiguous
legacy question. Economic resolution has a distinct `exact-observations-v3`
evaluator. Calendar aging and historical session diagnostics retain their own
evaluator identities. No brokerage change establishes an executed trade.

Company and ETF packets retrieve measured assessments across all issuance dates
for a matched stable security identity. Economic resolutions have priority over
price aging. Feedback coverage bounds and operational failures are explicit.
Research and targeted revalidation must cite the supplied records and explain
whether they change the conclusion. A material full-report nomination needs
changed supporting evidence; age alone cannot promote a check into full research.

Equivalent observation questions share an economic episode across portfolios,
reiterations, probabilities and thresholds. Shadow trials also purge overlapping
issuer horizons and correlated macro windows under the existing embargo. Remaining
cross-issuer dependence and small samples are limitations; policy promotion stays
disabled until the separately reviewed preregistered criteria are satisfied.

The evidence-only baseline uses an explicitly simple, smoothed frequency of exact
historical metric values with matching units. It abstains without two comparable
observations. The short-research baseline receives only the same frozen primary
packet. World comparison v2 rebuilds both arms before probability estimation and
stores their primary-packet hash, cutoff, generated research and metadata. Prior
research, business models, owner theses, dossiers and outcome prose are removed
before generation. Only the candidate receives frozen World analytical context. Registered shadow
trials separately freeze pre-issuance World projections into their own run; those
fallible hypotheses never enter the canonical capital manifest. Latest invalidations
suppress old active beliefs. A missing or over-bound projection capture is an
explicit comparison gap, not an empty successful trial.
Without eligible frozen World context the comparison records an exclusion. Old
v1 records remain readable, but its contaminated design cannot collect new runs.

Outcome price requests share security/feed/date/adjustment batches, use at most
100 symbols and approximately one year per fetch slice, persist immutable vintages
once per group in 500-row batches, and filter each task to its own endpoint.
Missing identity or feed continuity remains a gap. Price dependencies cannot
prevent independent economic tasks from being assessed. Calendars still come from
the exchange; retrospective schedules never become prospective evidence.

The merged code strips raw shadow economics and exposure claims from company-generation
and canonical packet projections. World retains question/document nominations and
immutable original lineage. A known World-influenced legacy report cannot authorize a
capital decision until it has an independently reconstructed primary-evidence
baseline. Unrelated legacy reports remain eligible. New research records the
boundary contract, and a legacy comparison is computed after generation so the old
shadow narrative does not anchor the new model. Whenever full research is warranted,
untagged prior prose is excluded from generation; an ordinary price-only update
does not force an otherwise unaffected legacy report to regenerate. This correction
is a foundation
prerequisite, not evidence that the correction is deployed. A non-persisting local
assembly against production covered 39 account/security names and 19 company
packets with no raw shadow packet/note leaks and no additional independent-research
gaps in the currently selected records; historical influence remains unproven.

Intelligence presents factual feed counts and the latest retrieval age. Populated
panels do not establish source coverage, and paper/news presence does not establish
an advancing trend. Missing retrieval time remains unknown. The shell no longer
claims an unconditional fresh update. Artifact readiness and its original timestamps
remain separate from feed retrieval.

## Reviewed operational gates

No release directories have been removed by this program. The current private
inventory proposes 142 obsolete releases, protects the active release and two
verified rollback releases, and preserves unique configuration and running-process
references. Application requires the owner's approval of that exact inventory.
Automatic future retention requires a separately approved policy.

No backup destination or runtime is assumed. The existing backup job is explicitly
blocked; destructive corpus pruning remains disabled until an approved destination,
working runtime and successful restore drill are recorded. Configuration,
credentials, corpus and World repositories are outside release-directory cleanup.

## Matched rollout

1. Apply and verify the indirect shadow-handoff foundation correction, then
   complete approved release retention; verify disk guard recovery and usable
   primary captures, including a failed-topic coverage record. Recheck the Release
   1 gate with persisted records and the production UI.
2. When deployment is authorized, activate one release at a time. Before migration 006, run
   `scripts/deploy-macserver-release.sh CHECKOUT --stage-only` on macserver. It
   installs, checks and builds the immutable origin/main release without moving
   the active worker or initializing World state. Use the deployment tooling from
   the complete program revision; the older release script lacks staging support.
3. Drain and pause the old worker before migration 006 so it cannot consume the
   newly backfilled tasks under legacy semantics. Keep dispatch durable during
   the short activation window. Dry-run and apply only the matching migration.
   Activate the verified staged
   build with `--activate-only`, then deploy the matching frontend. An absent
   marker, changed tracked source or changed build ID blocks activation.
4. Verify immutable publication, duplicate safety, seven checkpoints, policy/feed
   manifests and per-name failures using real persisted records. Complete due
   retrospective schedules with their retrospective flag intact.
5. After migration 008 and matching worker activation, preview then apply the
   legacy World import. Preserve unresolved predictions in their original resolver.
   Verify a single current projection per belief and the cap/exploration allocation.
6. Verify authenticated desktop/mobile workflows, source readiness, current
   research semantics and outcome feedback in a later persisted research version.
   Compare model invocations, worker time and latency on identical replay evidence.
   Record unresolved cases and sample sizes alongside measured baseline results.

Every later release stays blocked if its migration, runtime prerequisite or live
data path fails. Backward-compatible readers preserve historical artifacts,
forecasts, evaluations and policy versions; corrections append new records.

## Verification evidence and limits

The final local suite passes with 764 tests and one pre-existing skip; the production
build and quiet lint pass. Standalone TypeScript checking still reports historical
test-fixture errors (including incomplete ProcessEnv and older domain fixtures);
no application, library or component type errors remain in the production build.
Fixture coverage includes exchange early closes and
DST, weekends, month ends, leap years, splits, missing data, owner corrections,
duplicate publication, price-only replay, unsupported source identities, contrary
feedback, and the observed zero-position/retain contradiction.

Local desktop (1672 × 941) and mobile (390 × 844) checks exercised timeline
security/checkpoint filters, seven disclosures, frozen evidence limits and
hypothetical attribution using read-only production records. The pending migration
means these real versions honestly render `Not scheduled` in the local UI. The
production migration dry-run confirms only 006–008 remain pending. No
scheduled checkpoint, new research conclusion, backup recovery, model-quality gain,
or live later-release deployment is inferred from local verification.

The final shared Intelligence UI was also checked locally against read-only live
records at 1672 × 941 and 390 pixels wide. Its blocked overview remains visible;
feed counts and retrieval age replace unsupported coverage and directional claims.
The mobile navigation opened and closed without horizontal overflow or new console
errors. These changes are merged in PR 42 and the later stack, not deployed.
