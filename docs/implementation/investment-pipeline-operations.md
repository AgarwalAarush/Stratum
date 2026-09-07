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

Local verification: 636 tests total, 635 passing and one existing skip; full lint passes; production build passes. PGlite executes all six migrations and tests atomic publication rollback, immutability, access restrictions, newsletter duplicate/uncertainty handling, atomic job completion and full asset-universe preservation. Desktop/mobile sample Decisions and newsletter rendering, mobile dark mode and manual-record/learning controls were inspected in the browser. The temporary sample route was removed.

Production remains blocked. The Supabase dashboard reported “Database not usable” and a TCP connection timeout; read-only REST checks also failed. No new migrations, deployment or production recommendation batch has been applied. The macserver environment has no configured email sender or restic repository. Consequently no newsletter delivery, live end-to-end investment cycle, offsite restore or matured prospective efficacy is claimed.

Highest-leverage next milestone: restore a usable database, apply migrations, reconcile the real portfolio, publish a complete first daily batch, and deliver its frozen morning edition with an actual receipt. Follow with the first matured outcome cohort, not a retrospective claim of success.
