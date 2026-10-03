# World memory and company research

World remains shadow decision support. Company conclusions still require independently collected evidence, and owner theses, capital actions, portfolio holdings and brokerage records cannot become World authority.

## Storage and time

Git owns accepted synthesis. `world_documents` and `world_observations` retain original immutable evidence; claim revisions reference those observations through `world_claim_observation_links`. `world_claim_revisions` is append-only, with stable claim identity, supporting/contradicting/superseding claim references, qualifiers and exact quotes. The host assigns deterministic identities to legacy claims during import. Markdown preserves claim metadata alongside readable claim bullets. New accepted facts from company feedback become existing immutable observations rather than another independent facts database.

`world_memory_snapshots` records when a commit first becomes accessible to this memory service. Retrieval chooses the latest snapshot accepted before the knowledge cutoff, then loads that snapshot's claim memberships. It never substitutes today's node state into an older query. Source publication, capture, ingestion, claim validity and World acceptance are distinct. A historical import becomes known now, regardless of its source or Git date. Legacy claims without reconciled captures are explicitly marked `linked_sources_only`, not fresh independently verified facts.

## Retrieval

`retrieveWorldMemory` is the server interface used by World synthesis, company preparation and Morning Brief. The authenticated `GET /api/markets/world/search` accepts `q`, optional `symbol`, `knowledgeCutoff`, `eventFrom`, `eventTo` and `limit` (1–50). Retrieval combines lexical terms, a small declared alias vocabulary, node aliases, issuer names and relationships. Results include claim bundles, counterevidence, source references, related nodes, freshness, owner-scoped report links, and a receipt with commit/cutoff, IDs, latency, context size and digest. An empty result explains abstention.

Forecasts past their explicit validity horizon require an event-time query. Repeated captures of an underlying original contribute one evidence origin. The report index stores full prose under its owner; prose never becomes an independently supporting World source. Historical report links resolve the exact immutable version and preserve access to older versions.

Company preparation passes questions and original document URLs into independent collection. It does not make World conclusions an allowed company evidence source. Retrieval failure is retained as an explicit preparation gap and does not invalidate unrelated independent research.

## Completion and review

An equity report's transition to `complete` inserts its search index and one `company_world_memory_receipts` row in the same transaction. The primary key is the immutable report ID. Re-publishing completion, retained reports and retrying a refresh cannot create another review for that report.

The existing worker maintenance loop dispatches pending receipts. Live feedback has priority 24, normal World work retains priority 25, and historical feedback has priority 45. Report-based queue deduplication and the existing single-World-writer claim guard remain in force. Company feedback does not acquire the four-per-UTC-day investigation reservation; other investigations continue using that existing budget. It cannot produce a company lead or recursively commission research.

The reviewer loads the frozen completed version, a restricted business-model projection and original readable captures. Legacy analysis is an assessment. Every new factual claim requires an explicit type and an exact matching source quote for every citation. Management statements and forecasts retain their attribution and horizon. The independent World critic checks support, materiality, contradictions and authority boundaries; a repaired draft receives a second critique.

Accepted material changes follow the existing Git commit, durable change-set and projection path. The receipt records the commit, affected nodes and claims. A reviewed no-change result records its explanation without creating a World commit. Missing readable originals or critic rejection records `blocked`; execution errors record `failed`, independently of report completion. Receipt states are `pending`, `reviewing`, `applied`, `no_change`, `blocked`, and `failed`.

A `company-world-report:<report UUID>` Git commit marker closes the crash window between Git acceptance and Supabase receipt persistence. Retries resume an accepted commit's projection rather than generating another review. Prior no-change/rejected runs are also recovered as terminal receipt outcomes.

## Backfill and operations

Run on the private worker with its existing worker environment:

```sh
node --experimental-strip-types scripts/backfill-world-company-memory.ts
```

The command reconciles the current shadow projection, imports claim identities at the present time, selects the latest completed equity report per owner/symbol, indexes it and creates its receipt idempotently. Older versions remain linked history and are not regenerated. The scheduler dispatches remaining batches, always behind live completions. Inspect receipt status/explanation and evidence gaps to distinguish queued work from accepted memory. A completed report is never invalidated by a failed World review.

Apply `202610030003_world_memory_company_feedback.sql` before activating the compatible worker. The missing production prerequisite `202610010008_world_investigation_budget.sql` must also be applied when absent. Preserve any unrelated pending migrations. The release does not enable canonical cutover or change ETF feedback, vector indexing, graph databases, or learned memory policies.

## Verification

`tests/fixtures/world-memory-benchmark.json` freezes nine lexical-recall cases covering paraphrase, relationships, contradictions, duplicate origins, knowledge time, expired/historical forecasts, corrections and abstention. The fixture reports required-evidence recall, counterevidence recall, latency and context size against the previous literal keyword/relationship baseline. It is a small deterministic regression benchmark, not an estimate of general retrieval quality or investment performance.

Tests exercise transactional completion/rollback, idempotency, retained versions, owner isolation, immutable revision history, matching and unavailable captures, forbidden capital/research fanout, and interruption recovery for accepted, no-change, rejected and failed outcomes. Live acceptance also requires inspecting actual receipt/critic/commit output and subsequent recall; HTTP 200, a running worker or successful build alone is insufficient.

## Production rollout, 2026-10-03

Both migrations were applied. The compatible worker release is `7b4072447d3279cb190ae5c95f3b1e8b6e577945`; application release `23f0840` adds only historical status wording, delivered from a frozen Git archive in Vercel deployment `dpl_3iStSh8Bg6n2dPFgKsyGHiDhGcrH`. The scoped releases preserve the existing hold on unrelated main-branch work and existing production reader fixes. Main contains the feature and repair commits through PRs #66–#70.

Backfill selected and indexed 142 latest completed equity reports, creating 142 distinct report receipts without regenerating reports. Older versions remain accessible through exact-version history. Historical imports use their actual import time: a query before the import returned no accepted snapshot or claims. The unauthenticated search endpoint returns 401. Temporary schema-repair queue holds were removed, and failed receipt jobs were resumed using the same report and job identities.

The main-line checks passed 825 tests with one skipped, full lint and production build. The compatible worker release passed 818 tests with one skipped, full lint and build. The nine-case frozen benchmark measured required-evidence recall 1.0 versus baseline 0.3 and counterevidence recall 1.0 versus baseline 0.5. Its in-memory ranking took 9 ms versus 0.2 ms, with mean context size 3,742 versus 942 characters. These fixture results do not establish general retrieval quality or improved investment performance.

The initial provider rejection required model-facing claim arrays to use `[]` rather than null. Canonical legacy readers retain null compatibility. Event-free model drafts omit classifications entirely; the host restores an empty list and continues rejecting invented keys or omitted real events. Execution errors now fail the queue attempt so its normal retry policy can recover them, independently of report completion. Historical report charts and estimates use the selected report's frozen packet.

The idempotent reconciliation linked all 142 receipts to World context, with no context lookup gaps or duplicate review jobs. At 21:13 UTC there were 49 blocked receipts (missing readable originals), three critic-passed no-change outcomes (AMD, ARM, COST), 88 pending receipts, and two failed receipts queued for recovery. Reviews continue in the worker. Company feedback consumed zero World investigation slots; all temporary deployment holds were removed. Unavailable source captures remain documented gaps rather than facts published from old report prose.

Live recall returned AMD's exact v15 report after review. A pre-import knowledge query returned no report links or claims; current recall returned accepted claim bundles and owner-scoped reports. No company-driven Git change had yet been admitted at this checkpoint: publication and accepted-commit recovery paths passed tests, but the positive live company-change-to-recall path remains unverified until a qualifying finding passes the critic. No result was forced to satisfy that check.

Dia opened the deployed World page. Concurrent navigation prevented reliable final interaction and laptop-viewport verification of the context links and historical status wording; that visual acceptance remains outstanding.
