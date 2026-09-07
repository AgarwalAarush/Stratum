# Investment pipeline: release and operations

This extends the existing Next.js / Supabase / private macserver worker. Recommendations are for the owner to review and act on manually. No order-placement integration exists in this change.

## Implemented path

Existing source ingestion and CompanyPacket research → authoritative brokerage/ledger holdings and World dossier lineage → frozen `recommendation_input_manifests` → generator and independent critic → deterministic evidence/portfolio gates → atomic `recommendation_batches`, `recommendation_versions`, forecasts and due evaluation tasks → `/markets/recommendations` → immutable owner responses, prospective outcomes and cohort reviews → frozen newsletter outbox and delivery receipt.

The daily decision scope is all current holdings and owner watchlists, by portfolio, plus up to six fresh Candidate Scout admissions selected across discovery lanes. The manifest also retains the eligible screener denominator and unselected discovery names. Candidate Scout and World research discovery feed investigation; a screen does not automatically become a buy. Validated company or ETF research may support a system recommendation for owner review without rewriting an accepted owner thesis. An incomplete or stale context produces explicit no-trade decisions. It does not affirm that existing holdings are safe.

Key implementation paths:

- `lib/server/recommendations.ts`: complete owner research history, frozen context, daily generation, atomic publication, owner events and reads.
- `lib/markets/recommendations.ts`: eight actions; separate thesis, valuation, timing and portfolio fit; counter-thesis, invalidation, expiry, forecasts and cash/concentration/liquidity gates.
- `lib/server/company-research.ts`: originating World opportunity dossier, packet missingness, validated citations and source persistence before report completion.
- `lib/server/recommendation-outcomes.ts`: 5/10/20 exchange-session and thesis-horizon evaluations; economic metric assessments; owner fill comparisons; immutable revised evaluations and descriptive cohorts.
- `lib/markets/recommendation-evaluation.ts`: pure markout, entry expiry, selection/timing/sizing/risk attribution and confidence calibration calculations.
- `lib/server/investment-learning.ts` and `investment-shadow.ts`: immutable prospective registrations, executable probability-calibration alternatives, dated economic assessments and owner review. Shadow probabilities do not alter published capital actions or deploy a different capital policy.
- `lib/server/decision-inputs.ts`: private temporary files preserve every frozen input while supplying a bounded evidence index to generator and critic. Both still validate against the complete database manifest.
- `lib/server/portfolio-confirmation.ts`: immutable, explicitly owner-confirmed manual account snapshots. A later ledger change invalidates current verification.
- `lib/markets/company-market-basis.ts`: choose the newest valid dated price; never relabel old leadership technicals as current.
- `lib/server/world-replay.ts`: isolated, captured-evidence reconstruction. It cannot run live World Thinker, edit current hypotheses or enqueue research leads. This is deliberately labeled reconstruction, not an investment backtest.
- `lib/server/investment-newsletter.ts`: fixed recipient `aarushaga@gmail.com`, frozen HTML/text, delivery lease and stable retry key.
- `app/api/webhooks/investment-newsletter/route.ts`: signed delivery/bounce/complaint receipts. Provider acceptance is distinct from delivery.
- `lib/server/agent-schedule.ts`: 06:30 Pacific daily preparation, 07:00 Pacific daily newsletter, 17:00 Pacific outcome/cohort work. The existing durable worker queue provides catch-up and retries. These are due times; a busy or unavailable worker/provider can delay arrival.

## Database release order

Apply the eleven `2026090700*.sql` migrations in order, after reconciling the existing remote migration history:

1. Append-only decision reviews.
2. Recommendation, forecast, owner-event, evaluation, learning, price-vintage and newsletter ledger with atomic publication and delivery leases.
3. Stable asset IDs, append-only universe membership and complete-universe screener publication gate.
4. First-captured FRED vintages and isolated reconstruction artifacts.
5. Atomic agent job/run completion, guarded against stale attempts.
6. Atomic complete Alpaca asset-universe replacement and retirement of absent securities, with minimum-coverage guards.
7. Immutable newsletter provider selection and Gmail delivery-attempt safeguards.
8. Immutable manual portfolio confirmations.
9. Multiple immutable recommendation editions per day without rewriting prior inputs.
10. ETF ownership references the established private Markets owner registry.
11. Immutable prospective shadow captures and economic-outcome evaluations.

Do not merge/deploy dependent application code around a failed migration. The new database functions are service-role only. Published evidence has mutation-rejecting triggers and RLS denies anonymous/authenticated direct access; owner access is enforced by authenticated server routes.

After migrations: deploy the verified web release and private worker, sync the full asset universe, publish a full screener snapshot, reconcile Robinhood, and refresh company research where the evidence-quality manifest is missing. Generate the first decision batch and verify required/published coverage, genuine source dates, abstentions and exact immutable source references. A successful route alone is not acceptance.

## Newsletter setup and acceptance

Gmail is the configured provider; see the self-sender section below. The following configuration applies only if switching to Resend.

Worker-only Resend secrets/configuration:

- `RESEND_API_KEY`: server-owned email sending key.
- `STRATUM_NEWSLETTER_FROM`: verified sender, supplied by the owner.
- `STRATUM_NEWSLETTER_ENABLED=true`: enable only after sender setup and a reviewed preview.
- `STRATUM_RELEASE_SHA`: actual worker release identity.

Vercel-only webhook secret: `RESEND_WEBHOOK_SECRET`. Configure Resend delivery, bounce and complaint events for `https://stratum.aarushagarwal.dev/api/webhooks/investment-newsletter`.

Render an illustrative preview with `node --experimental-strip-types scripts/preview-investment-newsletter.ts`. Acceptance requires an actual outbox ID, provider ID and signed delivered event for the authorized recipient, followed by one scheduled 07:00 Pacific cycle. Retrying a response of unknown status reuses the same immutable body and key for less than 23 hours; after that, reconcile manually instead of risking a duplicate send. Bounces and complaints suppress future sends.

Provider contracts checked against [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Svix verification](https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-nodejs/) and [Alpaca historical bars](https://docs.alpaca.markets/us/reference/stockbarsingle-1). No desktop OAuth session is copied into the worker.

## Operational recovery

The worker writes `STRATUM_DATA_ROOT/health/worker.json` independently of Supabase. `scripts/check-worker-health.ts` exits nonzero for unhealthy, unavailable or older-than-three-minute evidence. A separate host monitor should run it; this release does not claim an externally provisioned alert service. Database failures are bounded and HTML gateway pages are not copied wholesale into logs.

Existing corpus backup jobs now fail visibly when restic is not configured. Before a backup, immutable investment tables are exported into private, checksummed JSONL archives under `artifacts/investment-ledger`. Credentials/OAuth stores are excluded. Verification restores the ledger archive from restic into a fresh scratch directory and checks every file hash and row count before deleting only that scratch directory.

Required external setup: install restic on macserver and supply `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` for an encrypted offsite destination. Keep managed Supabase backups: the artifact export is not a transactional PostgreSQL backup. A real database restore drill remains required. On disaster recovery, keep newsletter delivery disabled until accepted provider IDs/delivery history are reconciled; never infer unsent status from a missing operational lease table. Recreate evaluation tasks from immutable recommendations and forecast deadlines with idempotent keys.

## Evaluation limits and promotion discipline

- Performance evidence starts prospectively. No matured returns or confidence calibration are fabricated for pre-ledger recommendations.
- Markouts use a conservative next session strictly after publication. Current-day bars are excluded until a later evaluation, so results can lag one trading session. Exact exchange opening time and recommendation expiry constrain modeled entries; untestable conditions remain unverifiable.
- SPY and CompanyPacket peers are fixed at issuance; missing peers are retained and do not silently disappear from the comparison. Peers are company comparables, not a factor-matched portfolio. Security identities are fixed for recommendations, benchmarks and peers; mismatched or retired identities remain explicit outcome data gaps. Ticker reuse never substitutes a different company. Delisting proceeds still require separately verified evidence.
- Adjusted return vintages are frozen. Owner fills use matching raw/adjusted series and are labeled owner reported, not broker-reconciled realized P&L. Taxes, individual fees and interest are not modeled.
- Economic forecasts require the declared numeric metric, threshold, deadline and dated evidence. FRED values are first-captured current revisions, not ALFRED release-time history. Unsupported metrics remain unresolved or require an evidenced owner assessment; price changes do not resolve a company thesis.
- Original probabilities and recommendations are immutable. Repeated versions count as one episode for confidence calibration; unresolved episodes stay in the denominator. Cohort reviews diagnose missing-evidence gates before suggesting threshold changes.
- A policy comparison needs a future registered window, at least 30 independent episodes, overlap purge/embargo, predeclared effect and risk limits, multiple-testing control and owner review. The implemented shadow policies shrink economic forecast probabilities 20% or 40% toward 0.5, capture only future eligible editions, and score the same dated economic outcomes. Overlapping horizons are purged with the registered embargo; unresolved forecasts remain visible. Scores remain descriptive and promotion is always disabled pending uncertainty/dependence/multiplicity review and a separately tested code release.

## Historical rollout evidence

Local verification: 638 tests total, 637 passing and one existing skip; full lint passes; production build passes. PGlite executes all six migrations and tests atomic publication rollback, immutability, access restrictions, newsletter duplicate/uncertainty handling, atomic job completion and full asset-universe preservation. Desktop/mobile sample Decisions and newsletter rendering, mobile dark mode and manual-record/learning controls were inspected in the browser. The temporary sample route was removed.

Release update, 2026-09-07 UTC: the owner approved phased deployment with email disabled. All seven new migrations applied successfully. PRs #2 and #3 merged; production Vercel deployment `dpl_EdSKEYdJRy8MKUYiRvR9uAyGDdGd` and the healthy private worker run code release `a6767f206078f65929e9b928aaabd439f9e08896`.

Live verification found an older user LaunchAgent still running alongside the system daemon. The legacy `gui/501/com.aarush.stratum-markets-worker` was disabled and unloaded; its files were preserved. Only the system daemon remains. Full asset ingestion then persisted all 13,404 eligible stable security IDs. Read-only Robinhood reconciliation `38b307fe-6c11-4f40-a902-532ce4d671ae` captured 18 holdings at `2026-09-07T02:27:03.093Z`.

The first edition exposed a production-schema mismatch: investment theses have `generated_at`, `data_as_of`, and `reviewed_at`, not `created_at` or `updated_at`. The query and provenance were corrected. Policy `prospective-v1.1` preserves the original abstention edition while publishing a new frozen manifest. Corrected batch `746147dc-0461-410c-aa2f-b8d631d1a244` contains 35/35 required portfolio-symbol entries across 26 distinct symbols, 177 evidence records, no global read errors, and 35 explicit abstentions. Its authenticated production Decisions page was verified. It is not ready for affirmative capital recommendations: all included research predates the new evidence-quality checks; 16 company refreshes were queued. PIKA is an unresolved watchlist name; the empty Dad & Aarush portfolio lacks a current verified capture. ETF research is a separate existing pipeline and is not yet admitted into this company-based recommendation context, so the company refresh queue does not resolve ETF abstentions.

Gmail setup and the first delivery were verified on September 7 UTC. Outbox `a45093d3-f0ad-4fbe-a1d9-9b2e71d2d73f` was accepted by Gmail, then independently found in INBOX by its exact Message-ID at `2026-09-07T02:40:55.269093Z` through a read-only mailbox connection. The immutable delivery event records that observation. The sender and recipient are both the authorized owner address. Daily delivery is enabled; the first actual 07:00 Pacific scheduled arrival still requires observation. No matured investment outcome, offsite backup, or database restore is claimed. Restic and an offsite repository remain unconfigured. A prior automatic approval rejection was resolved by the owner's explicit approval of the phased rollout; it is not a current blocker for the core release.

At that earlier release, the next milestone was completing company backfills and admitting ETF research. The current rollout below supersedes that status. Observe the first 07:00 Pacific scheduled newsletter cycle; the sender and first manual delivery are verified. Matured prospective outcomes must follow real time, not retrospective reconstruction.

## Gmail self-sender setup

The owner requested sender and recipient `aarushaga@gmail.com`. `STRATUM_NEWSLETTER_PROVIDER=gmail` selects Gmail SMTP over TLS on port 465. The sender, recipient, and SMTP envelope are fixed to that address. The connected desktop mailbox is a different CMU account and is not used or copied into the worker.

Create a Google app password named Stratum newsletter in the owner's personal account, then run this from an interactive terminal:

```sh
ssh -t macserver 'zsh ~/Projects/Stratum-production-current/scripts/connect-newsletter-gmail.sh'
```

The helper accepts the password with echo disabled, stores it in a worker-owned mode-0600 file, and verifies SMTP authentication without sending mail. It refuses to overwrite an existing credential. Never paste the password into chat, command arguments, or environment files. Google requires 2-Step Verification for app passwords; if unavailable, configure a dedicated worker-owned Google OAuth client instead of weakening account security. See [Google's app-password instructions](https://support.google.com/mail/answer/185833?hl=en).

Initial connection, real-edition delivery, read-only inbox verification, and `STRATUM_NEWSLETTER_ENABLED=true` activation are complete. For future credential changes, verify the new connection and reconcile delivery before enabling it. The schedule remains 07:00 America/Los_Angeles daily, with a shorter weekend edition. The provider is frozen in each immutable outbox row. Gmail permits one send attempt per edition: expired leases, crashes, and ambiguous responses require mailbox reconciliation; a stable Message-ID is not a deduplication guarantee. SMTP acceptance is recorded as accepted, never delivered. Resend remains available with its distinct idempotency-window and signed-webhook semantics.


## Current implementation and verification (September 7 UTC)

PRs #6–#13 add owner-confirmed manual holdings, supported ETF evidence, fresh discovery admissions, immutable owner-requested editions, prospective shadow execution, bounded model inputs, bounded leadership history reads, and fresh company price selection. Product code release: `c2e4ffced068d0344df46218b0c324cbc6d0f3a7`. All eleven migrations applied before the dependent release. The full suite passed 665 tests with one existing skip; production build and focused lint passed.

Live source-path verification:

- Full market refresh `6ebde02b-13e0-4a2f-9861-021df24d887a` succeeded.
- All six supported ETF research backfills completed: GRID, URA, PAVE, MLPX, XLK and XLU. Holdings retain their September 3/4 issuer dates and full holdings coverage checks. NLR and RACK adapters were subsequently verified against complete official September 3 holdings: 28 and 52 rows, reconciling to 99.98% and 99.95% weight. UTES remains unsupported. Worker jobs `6a0fe396-19d0-4d04-b580-fddf6f66ed41` (NLR) and `2e63f9b3-0a15-4ff0-af10-d70bc1a154ff` (RACK) subsequently completed research publication.
- The prior whole-universe leadership query timed out. The corrected read retrieved 147,771 bars across 503 symbols in 27.6 seconds. Worker job `27420442-a4d1-425f-a19b-06eb5666240e` then succeeded and atomically published leadership snapshot `0b96cabf-3bf4-4da5-9d84-6c32577155cd` for September 4. Downstream Candidate Scout job `05941908-2ee4-4400-9b16-9bb72a2e2bed` succeeded and produced new September 7 candidate briefs.
- Company research previously preferred August 18 leadership prices despite fresh quotes. A live read of AMD confirms the new selector chooses September 4 and withholds older technical metrics. Reports generated before this repair remain immutable; corrected backfills must be verified by `evidenceQuality.priceAsOf`, not their generation time.
- The verified frozen context was 5,797,914 bytes. The new model-facing index is 170,440 bytes, while exact complete inputs remain in private temporary files and the durable manifest. Cleanup is tested for success and failure.
- Prospective experiment `5d9acdf4-5a58-4035-a8fb-0b033238550a` registers the 20% probability shrinkage trial before its September 7 05:45:06 UTC start, for 60 days plus a 20-day embargo and at least 30 independent episodes. It cannot retroactively capture the older abstention editions or alter active capital actions.

The first 45-name generation attempt rejected a missing/short exit contract before publication. The repair converts only malformed name-level contracts to explicit abstentions and retains rejected output in immutable metadata. Missing, duplicate, or unknown coverage still fails the entire batch; the critic and joint portfolio constraints remain mandatory. Input assembly and actual generation releases are tracked separately for retries after a deployment.

Remaining acceptance limits: Dad & Aarush requires real owner-confirmed cash and holdings; PIKA has no resolved stable security identity; unsupported funds and ETF look-through overlap remain explicit gaps. A functioning prospective ledger does not demonstrate investment efficacy before outcomes mature. The first scheduled 07:00 Pacific inbox arrival, independent worker-failure alerting, encrypted offsite backup destination and an actual restore drill remain unverified or unconfigured. Current weekday/world schedules still need a full dependency/deadline acceptance run under backlog; scheduled due times alone do not prove a fresh morning edition.


### First usable prospective edition

Batch `3cf7b146-6ded-4d0a-a38d-2d6ce261a715` published at `2026-09-07T06:38:09.539977Z` from frozen manifest `48884e00-2681-4b52-b5a0-6903a6da4abe`. All 45 required portfolio/name records were published: 17 hold, 14 research, 5 watch and 9 no-trade, with 21 dated economic forecasts. No buy/add/trim/sell exposure change was recommended in this edition. One proposal was blocked by evidence/portfolio checks; the successful generation had no contract failures. The original v1.1 abstention batches remain unchanged. Authenticated production Decisions and its economic forecasts/shadow section were inspected.

The first failed attempt was never published. The successful retry used its original frozen inputs, with input assembly release `7cbde576d366fee10e85c40ad35d1e68ad57e383` and generation release `758bbc8751c823352d2d38dc62f894317d8729fd` separately recorded. NLR/RACK reports completed after this cutoff; they belong to a subsequent edition, not a rewrite of this one.

Shadow capture `edc6c6aa-bf47-4ca4-a967-a6a2102e4dbf` belongs to that exact batch and preregistration. Outcome job `1c184141-3a37-4ccb-98b3-56ad0c648a53` and cohort job `dfa8ee69-1ccd-46b8-a114-77a48c535c48` succeeded. Shadow evaluation `dcf9dca0-9827-4c9e-855b-be83c28c2a26` retains 21 captured forecasts, one repeated question, 20 independent unresolved questions, zero resolved episodes and null Brier scores. Promotion remains ineligible. Current forecasts use one-year deadlines, and several company/qualitative metrics require evidenced owner adjudication; this is an important limit on near-term automatic economic calibration. Price markouts remain separate.

The worker previously waited for the slowest job in a batch, leaving completed sibling slots idle. The deployed bounded pool now reuses those slots while preserving atomic claims, errors and the existing concurrency cap. The recommendation repair was verified through a single existing-queue handler process, not an additional daemon. The system worker reports healthy on `c2e4ffc`; Vercel delivery is checked separately.

The core owner-review loop is now implemented and verified through publication and prospective outcome bookkeeping. Investment efficacy remains unproven. The next substantive learning milestone is typed, source-resolvable company metrics with useful quarterly resolution windows and ETF look-through exposure, followed by real prospective outcomes. Manual account confirmation, unresolved PIKA, unsupported UTES and offsite recovery configuration remain explicit limits rather than invented data or completed capabilities.


## Clear insights and owner allocation budgets (September 7)

PR #15 makes `/markets` the daily investment brief, with four primary destinations (Today, Portfolio, Research, World). `/markets/recommendations` remains compatible; the prior market overview is available at `/markets/overview`, including the legacy macro redirect. Capital actions, existing holdings, and background research are grouped without removing recommendation coverage. Detailed evidence and process controls remain available through progressive disclosure. The four links remain visible at mobile widths.

An immutable manual confirmation can now contain `allocationBudget: {total, holdingsValue}`. Its remaining allocation equals total budget less captured holdings value; the Portfolio UI labels this available budget, and frozen recommendation names record `capitalBasis: owner_budget`. This is owner-authorized allocation capacity, never a claim about broker buying power. Existing cash-based confirmations remain compatible, and repricing preserves the budget metadata. No transactions or order execution are created.

PR #16 fixes two observed input failures. Market-universe coverage now includes current authoritative manual and broker holdings even without watchlist/transaction rows. Decision assembly reads the exact packet IDs referenced by the latest selected research notes in batches of five, retaining owner and cutoff filters, instead of scanning all historical packets. An authenticated production read loaded 87 referenced packets in approximately five seconds. The original incomplete morning edition remains immutable.

Browser responses project source references, timestamps, account context, and World summaries without serializing raw research and evidence payloads. Dashboard reads share a 15-second deadline. The durable manifest remains complete and unchanged.

Validation: 669 passing tests and one existing skip; production build and focused ESLint passed. Desktop (1672 by 941), mobile (390 pixels), dark mode, portfolio filtering, and expandable thesis/counter-thesis were inspected. The temporary illustrative preview was removed before deployment. Product release is `f9db19fa5030e1947cf7995521e7872fb126d4f3` on Vercel and the private worker.


PR #17 keeps an explicitly authorized total investment budget as the allocation sizing denominator even if a held instrument has no usable quote. Portfolio labels this Investment budget. Individual missing/stale-price gates remain in force; account cash and market value are not fabricated.

The updated input manifest was checked against production after the packet-read repair: all confirmed positions and the owner budget were retained, and no global data-read gaps remained. Individual unsupported fund evidence remains restricted. A spot measurement of the browser workspace was approximately 482 KB and 1.45 seconds, including recommendations and learning records; this is a measurement, not a latency guarantee.

Observed limits during this release: one newly tracked fund required a 318-bar history backfill, and a subsequent complete-market refresh failed its required-coverage gate because a thinly traded watchlist fund had only an older IEX trade. The last complete market snapshot was retained. Universe admission does not by itself prove that a provider has delivered enough current history or a usable quote. Do not relabel these missing/stale sources or remove publication gates to make an endpoint look healthy.


PR #19 repairs another observed generation failure: ETF reports had substantial narrative fields outside `sections`, so the model-facing index could exceed its 300 KB input limit even though raw packets were already in private files. Research and accepted-thesis bodies now remain complete in the frozen name files, with explicit references in the index. No evidence is truncated and the immutable manifest hash is unchanged. The actual 49-name edition projects to 150,907 bytes. A regression exercises 50 large reports plus accepted theses and confirms every full body remains readable. Validation: 670 tests passed, one skipped; focused ESLint and production build passed. Vercel and the healthy private worker run release `b8081f0e434bcf7ebed6988135a7516e27870886`.
