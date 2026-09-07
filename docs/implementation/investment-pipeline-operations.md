# Investment pipeline: release and operations

This extends the existing Next.js / Supabase / private macserver worker. Recommendations are for the owner to review and act on manually. No order-placement integration exists in this change.

## Implemented path

Existing source ingestion and CompanyPacket research → authoritative brokerage/ledger holdings and World dossier lineage → frozen `recommendation_input_manifests` → generator and independent critic → deterministic evidence/portfolio gates → atomic `recommendation_batches`, `recommendation_versions`, forecasts and due evaluation tasks → `/markets/recommendations` → immutable owner responses, prospective outcomes and cohort reviews → frozen newsletter outbox and delivery receipt.

The initial daily capital-decision scope is all current holdings and owner watchlists, by portfolio. The manifest also retains the eligible screener denominator and unselected discovery names. Candidate Scout and World research discovery remain separate research inputs; a candidate does not automatically become a buy. An incomplete or stale context produces explicit no-trade decisions. It does not affirm that existing holdings are safe.

Key implementation paths:

- `lib/server/recommendations.ts`: complete owner research history, frozen context, daily generation, atomic publication, owner events and reads.
- `lib/markets/recommendations.ts`: eight actions; separate thesis, valuation, timing and portfolio fit; counter-thesis, invalidation, expiry, forecasts and cash/concentration/liquidity gates.
- `lib/server/company-research.ts`: originating World opportunity dossier, packet missingness, validated citations and source persistence before report completion.
- `lib/server/recommendation-outcomes.ts`: 5/10/20 exchange-session and thesis-horizon evaluations; economic metric assessments; owner fill comparisons; immutable revised evaluations and descriptive cohorts.
- `lib/markets/recommendation-evaluation.ts`: pure markout, entry expiry, selection/timing/sizing/risk attribution and confidence calibration calculations.
- `lib/server/investment-learning.ts`: immutable prospective experiment registrations and owner review. Registration does not deploy or automatically run an alternative capital policy.
- `lib/server/world-replay.ts`: isolated, captured-evidence reconstruction. It cannot run live World Thinker, edit current hypotheses or enqueue research leads. This is deliberately labeled reconstruction, not an investment backtest.
- `lib/server/investment-newsletter.ts`: fixed recipient `aarushaga@gmail.com`, frozen HTML/text, delivery lease and stable retry key.
- `app/api/webhooks/investment-newsletter/route.ts`: signed delivery/bounce/complaint receipts. Provider acceptance is distinct from delivery.
- `lib/server/agent-schedule.ts`: 06:30 Pacific daily preparation, 07:00 Pacific daily newsletter, 17:00 Pacific outcome/cohort work. The existing durable worker queue provides catch-up and retries. These are due times; a busy or unavailable worker/provider can delay arrival.

## Database release order

Apply the six `20260907000*.sql` migrations in order, after reconciling the existing remote migration history:

1. Append-only decision reviews.
2. Recommendation, forecast, owner-event, evaluation, learning, price-vintage and newsletter ledger with atomic publication and delivery leases.
3. Stable asset IDs, append-only universe membership and complete-universe screener publication gate.
4. First-captured FRED vintages and isolated reconstruction artifacts.
5. Atomic agent job/run completion, guarded against stale attempts.
6. Atomic complete Alpaca asset-universe replacement and retirement of absent securities, with minimum-coverage guards.

Do not merge/deploy dependent application code around a failed migration. The new database functions are service-role only. Published evidence has mutation-rejecting triggers and RLS denies anonymous/authenticated direct access; owner access is enforced by authenticated server routes.

After migrations: deploy the verified web release and private worker, sync the full asset universe, publish a full screener snapshot, reconcile Robinhood, and refresh company research where the evidence-quality manifest is missing. Generate the first decision batch and verify required/published coverage, genuine source dates, abstentions and exact immutable source references. A successful route alone is not acceptance.

## Newsletter setup and acceptance

Worker-only secrets/configuration:

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
- A policy comparison needs a future registered window, at least 30 independent episodes, overlap purge/embargo, predeclared effect and risk limits, multiple-testing control and owner review. Executing a candidate policy and promoting its code still requires a separately verified release; this is not autonomous self-modification.

## Verification and current release status

Local verification: 638 tests total, 637 passing and one existing skip; full lint passes; production build passes. PGlite executes all six migrations and tests atomic publication rollback, immutability, access restrictions, newsletter duplicate/uncertainty handling, atomic job completion and full asset-universe preservation. Desktop/mobile sample Decisions and newsletter rendering, mobile dark mode and manual-record/learning controls were inspected in the browser. The temporary sample route was removed.

Release update, 2026-09-07 UTC: the owner approved phased deployment with email disabled. All seven new migrations applied successfully. PRs #2 and #3 merged; production Vercel deployment `dpl_EdSKEYdJRy8MKUYiRvR9uAyGDdGd` and the healthy private worker run code release `a6767f206078f65929e9b928aaabd439f9e08896`.

Live verification found an older user LaunchAgent still running alongside the system daemon. The legacy `gui/501/com.aarush.stratum-markets-worker` was disabled and unloaded; its files were preserved. Only the system daemon remains. Full asset ingestion then persisted all 13,404 eligible stable security IDs. Read-only Robinhood reconciliation `38b307fe-6c11-4f40-a902-532ce4d671ae` captured 18 holdings at `2026-09-07T02:27:03.093Z`.

The first edition exposed a production-schema mismatch: investment theses have `generated_at`, `data_as_of`, and `reviewed_at`, not `created_at` or `updated_at`. The query and provenance were corrected. Policy `prospective-v1.1` preserves the original abstention edition while publishing a new frozen manifest. Corrected batch `746147dc-0461-410c-aa2f-b8d631d1a244` contains 35/35 required portfolio-symbol entries across 26 distinct symbols, 177 evidence records, no global read errors, and 35 explicit abstentions. Its authenticated production Decisions page was verified. It is not ready for affirmative capital recommendations: all included research predates the new evidence-quality checks; 16 company refreshes were queued. PIKA is an unresolved watchlist name; the empty Dad & Aarush portfolio lacks a current verified capture. ETF research is a separate existing pipeline and is not yet admitted into this company-based recommendation context, so the company refresh queue does not resolve ETF abstentions.

No matured outcome, Gmail send, inbox delivery, scheduled newsletter cycle, offsite backup, or database restore is claimed. The new Gmail provider is deployed but unconfigured. Restic and an offsite repository also remain unconfigured. A prior automatic approval rejection was resolved by the owner's explicit approval of the phased rollout; it is not a current blocker for the core release.

Highest-leverage next milestone: complete the company evidence backfills and admit validated ETF research into the decision context, then produce the first reviewed affirmative recommendation. Connect the sender and verify a real frozen newsletter before enabling the daily delivery flag. Matured prospective outcomes must follow real time, not retrospective reconstruction.

## Gmail self-sender setup

The owner requested sender and recipient `aarushaga@gmail.com`. `STRATUM_NEWSLETTER_PROVIDER=gmail` selects Gmail SMTP over TLS on port 465. The sender, recipient, and SMTP envelope are fixed to that address. The connected desktop mailbox is a different CMU account and is not used or copied into the worker.

Create a Google app password named Stratum newsletter in the owner's personal account, then run this from an interactive terminal:

```sh
ssh -t macserver 'zsh ~/Projects/Stratum-production-current/scripts/connect-newsletter-gmail.sh'
```

The helper accepts the password with echo disabled, stores it in a worker-owned mode-0600 file, and verifies SMTP authentication without sending mail. It refuses to overwrite an existing credential. Never paste the password into chat, command arguments, or environment files. Google requires 2-Step Verification for app passwords; if unavailable, configure a dedicated worker-owned Google OAuth client instead of weakening account security. See [Google's app-password instructions](https://support.google.com/mail/answer/185833?hl=en).

After connection, prepare and inspect the first real edition, send it to the authorized owner, reconcile inbox delivery, and enable `STRATUM_NEWSLETTER_ENABLED=true` in the worker configuration. The schedule remains 07:00 America/Los_Angeles daily, with a shorter weekend edition. The provider is frozen in each immutable outbox row. Gmail permits one send attempt per edition: expired leases, crashes, and ambiguous responses require mailbox reconciliation; a stable Message-ID is not a deduplication guarantee. SMTP acceptance is recorded as accepted, never delivered. Resend remains available with its distinct idempotency-window and signed-webhook semantics.
