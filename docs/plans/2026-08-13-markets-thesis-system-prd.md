# Stratum Markets Thesis System — Product Requirements Document

> **Version:** 1.0
> **Date:** 2026-08-13
> **Status:** Canonical product plan; implementation is in progress
> **Owner:** Stratum Markets

## 1. Product decision

Stratum Markets is a private, evidence-governed capital-allocation system. It should continuously turn source-grounded views of economic systems into durable company theses, explicit entry decisions, and measured learning—without conflating any of those decisions and without trading authority.

The end state is not an autonomous stock picker, a stream of market commentary, or a terminal that summarizes headlines. It is a decision system that lets its owner answer:

1. What deserves investigation?
2. What do we believe about an economic system or company, and why?
3. What should we do with capital now: own, watch, avoid, wait, start small, or add on weakness?
4. What would prove us wrong, and what did we learn when reality arrived?

The operating principle is **capital allocation first, trading second**. Trading execution is out of scope.

## 2. Current product state

### What is implemented on `main`

- A governed market-model loop: source contracts, collection, quote-bound observation proposals, review/auto-accept gates, baselines, hypotheses, analyst/critic research, immutable market-thesis versions, exposures, and predictions.
- Six declared starter economic systems: AI power, semicap/data-center equipment, critical materials, macro/policy/geopolitics, industrial automation, and defense-industrial capacity.
- A coordinated private-worker thesis cycle twice daily, plus bounded six-hour research orchestration between the coordinated cycles.
- A market-thesis workspace with history, evidence, causal claims, exposures, predictions, and a direct “investigate company” handoff for verified/tickered exposures.
- Company research packets, immutable company-research revisions, a proposal/accept/reject company-thesis contract, and automatic monitor creation on accepted theses.
- Separate durable portfolio/entry-decision records: disposition, formal rating, entry action, fair value/entry zones, conviction, catalysts, kill criteria, rationale, and decision reviews.
- Thesis monitors and decision-inbox items for material events, price/technical context, and research refreshes.
- Market-prediction evaluation logic that uses post-prediction governed evidence and records confirmed, disconfirmed, or inconclusive results.

### What is only partially complete

- The market-model → company-research → company-thesis review loop is complete. It nominates research candidates, not recommendations; portfolio entry and sizing remain a separate Stage 5 decision.
- Company thesis, monitoring, and portfolio entry decision are persisted separately. An entry decision now has enforced accepted-thesis and research-version lineage, but the single review surface and decision-change timeline are still incomplete.
- Prediction evaluation is implemented and new market research must include a 1-week-to-12-month evaluable prediction, but legacy predictions remain long-dated and there is not yet enough evaluated history or a calibration surface to make learning operationally useful.
- Domain coverage is six curated starter systems. Portfolio-led company coverage expands decision relevance without pretending to be complete economic or GICS coverage.
- Intelligence/Markets source referrals are released with explicit register/dismiss review and remain a discovery-only lane pending separate contract and governed source admission.

### Current release posture

Migration history has been reconciled and recent schema-backed releases are live. Continue to verify migration parity and worker heartbeat before each release; do not bypass either gate to ship a feature.

## 3. Product principles and non-negotiables

| Principle | Requirement |
| --- | --- |
| Separate decisions | Discovery, thesis, and entry decision are different records, workflows, and review outcomes. |
| Evidence before prose | No generated view may invent facts, prices, sources, or evidence. Material claims retain source provenance and timestamps. |
| No silent rewrites | Accepted theses, company research, predictions, and entry decisions are versioned or append-only. Later work states what changed. |
| Discovery is not evidence | Scout results, feeds, referrals, and candidates can guide work but cannot automatically alter a model, thesis, or source contract. |
| Reviewable automation | Automation may collect, propose, rank bounded work, and auto-accept only explicitly eligible quote-bound evidence. It may not approve a source, accept a company thesis, allocate capital, or trade. |
| Independent company analysis | A market model can nominate a company for investigation; it never proves that company thesis. |
| Learning is a deliverable | Every material prediction and entry decision needs an eventual evidence-backed evaluation, not just a newer paragraph. |
| Private and safe | Broker data is read-only reconciliation for the owner’s private portfolio. No order placement, brokerage write, or public quote redistribution is in scope. |

## 4. Target operating model

```text
Governed source registry / approved recurring sources
        + bounded broad research / Intelligence referrals
                         |
                         v
           source contract + document capture
                         |
                         v
       quote-bound observation proposal + review gate
                         |
                         v
      baseline -> hypothesis -> analyst / critic research
                         |
                         v
              versioned market model / thesis
                         |
               value-chain exposures and falsifiable predictions
                         |
                         v
             company-research task and CompanyPacket
                         |
                         v
           proposed company thesis -> human review outcome
                         |
                         +---------------------+
                         |                     |
                         v                     v
              durable thesis monitor    separate entry decision
                         |                     |
                         +----------+----------+
                                    v
                  evidence-backed refresh / prediction and decision review
```

Every arrow is a distinct contract. A downstream record can retain upstream context, but upstream confidence never substitutes for downstream evidence or review.

## 5. Users and primary jobs

### Primary user: the owner / investment decision-maker

- Understand the current market models and their confidence, supporting evidence, contradictions, open questions, and exposed value-chain names.
- Decide which market-model exposures merit company research.
- Review a proposed company thesis, accept/reject it, or explicitly choose no trade.
- Maintain a separate capital decision for an accepted thesis.
- Receive a compact, explainable review queue when a thesis changes, a kill signal appears, a catalyst occurs, or entry conditions change.
- Review outcomes and calibration across prior decisions.

### System / worker

- Keep approved source collection, evidence extraction, research cycles, and bounded follow-up work current.
- Preserve lineage, failures, and uncertainty rather than filling gaps with inference.
- Prioritize scarce research capacity using explicit signals and budgets.
- Never perform actions reserved for the owner.

## 6. Functional requirements by layer

### 6.1 Discovery and coverage

**Goal:** Find what merits work without calling it an investment opinion.

Required behavior:

- Candidate Scout covers the durable US equity universe, active watchlists, owned symbols, and thesis-covered symbols.
- Every candidate explains why it surfaced, what changed, decisive numbers, risks, and source links.
- Market models expose value-chain beneficiaries, losers, substitutes, materiality, confidence, and verification state.
- Broad research produces attributable provisional leads, including counter-evidence, and never becomes governed evidence automatically.
- Intelligence and Markets feeds may create *source referrals* only after a deterministic, bounded classification. A referral remains a reviewable discovery record, not a source candidate or evidence.
- Coverage control shows each domain’s approved sources, candidate sources, evidence volume/freshness, open frontiers, and referral backlog.

### 6.2 Evidence and market models

**Goal:** Maintain inspectable economic-system views rather than opaque narratives.

Required behavior:

- Every recurring source has a reviewed contract restricting host, path, MIME type, cadence, and allowed assertion kinds.
- Collected documents are retained with immutable source identity and contract version.
- A proposed observation requires a verbatim quote and source linkage; acceptance creates one governed observation.
- Baselines, hypotheses, research versions, market-thesis versions, and revision diffs are durable.
- Analyst/critic research records supporting and contradictory evidence, unresolved nodes, and the critic’s requested frontier work.
- Market models publish falsifiable predictions and value-chain exposures, while retaining confidence and data-as-of time.

### 6.3 Market-model to company-research bridge

**Goal:** Convert a credible exposure into an explicit investigation, not an implied trade.

Required behavior:

- Only a published market-thesis version and a verified or `needs_company_research` tickered exposure can begin a company investigation.
- The investigation carries the exact originating market-thesis version as context.
- A CompanyPacket is built from normalized market/fundamental/filing/transcript sources and persists independently of UI state.
- Full company research produces a fixed, validated, versioned research note with its source ledger and a structured opinion comparison against the preceding note.
- A company thesis proposal links back to the market model only after independent company research exists.

### 6.4 Company thesis contract

**Goal:** Make an affirmative company belief durable, inspectable, and reviewable.

Each company-thesis proposal must contain:

- core belief and causal chain;
- mispricing/expectations gap and key debate;
- evidence ledger and data-as-of;
- catalysts;
- falsifiers, fastest kill signal, and unresolved evidence;
- what changed from the prior version;
- confidence and research lineage;
- relationship to any originating market model.

Allowed human review outcomes:

| Outcome | Meaning |
| --- | --- |
| Accept | The thesis becomes the current active belief for that entity and starts/updates a monitor. |
| Reject | The proposal remains a durable rejected record with its evidence trail. |
| Revise | New research is required; the proposed version is not silently edited. |
| No trade | The thesis may be credible, but no capital decision is warranted now. This must be recorded separately from rejection. |

All four outcomes are implemented. `Revise` generates a new proposal/version rather than editing the reviewed record; `No trade` preserves an active, monitored belief without creating a capital decision.

### 6.5 Monitoring, predictions, and learning

**Goal:** Keep accepted beliefs current and show whether the system learns.

Required behavior:

- Accepted company theses attach an active/paused monitor with clearly listed coverage lanes.
- Monitors create attributable findings and decision-inbox items, never silent thesis mutations.
- A finding can queue a research refresh; the new research must compare its opinion with the previous research version.
- Market-thesis predictions evaluate only against post-prediction governed evidence or an explicit deadline; evaluations may be confirmed, disconfirmed, or inconclusive.
- Disconfirmed predictions should trigger bounded research revision, not automatic invalidation or capital action.
- The product exposes calibration: count and rate of confirmed/disconfirmed/inconclusive predictions, by domain, horizon, confidence band, and time period.
- Entry decisions receive a separate outcome/postmortem review with lessons and expectation assessment.

### 6.6 Capital-allocation / entry-decision contract

**Goal:** Decide what to do with capital without turning a thesis into an instruction by default.

An entry decision is a separate, versioned, owner-reviewed record linked to research/thesis context. It contains:

- disposition: own, watch, or avoid;
- formal rating, practical entry action, and conviction;
- fair value and/or entry zone when supported by the evidence;
- current price context and better-entry trigger;
- next catalyst and kill criteria;
- rationale, price at decision, and later outcome review.

The system may propose or surface this information, but final capital allocation is the owner’s action. It never places a trade.

## 7. Staged delivery plan

Status legend: **Done** means implemented on `main` and intended for production use; **Partial** means the data model or individual flow exists but the closed-loop product behavior does not; **Not started** means no reliable product contract exists yet.

### Stage 0 — Safe platform and decision boundaries (**Done**)

- Intelligence | Markets product shell and private Markets authentication.
- Private worker / Supabase / Vercel architecture.
- Durable job queue, idempotent work, immutable research artifacts, and read-only brokerage reconciliation.
- Explicit no-trading boundary and separation of discovery, thesis, and entry decision.

**Exit criteria:** all new Markets work preserves these boundaries. This remains a continuing constraint, not a one-time milestone.

### Stage 1 — Governed market-model engine (**Done, operational hardening continues**)

- Domain packs, approved source registry/contracts, collection, quote-bound observation proposals, and evidence review.
- Baseline → hypothesis → analyst/critic → versioned market thesis.
- Bounded research orchestration, health checks, source/frontier telemetry, and market prediction records.
- Coordinated twice-daily thesis cycle.

**Still to harden:** repair source-specific collector failures, reconcile migration history, confirm worker health after releases, and show evidence ledger inspection as a first-class product surface rather than only counts.

### Stage 2 — Research coverage control (**Done**)

- Source-control board, source coverage requirements, research frontiers, broad research leads, and bounded source scout.
- Intelligence/Markets feed referrals have explicit register/dismiss review outcomes with reviewer rationale and immutable provenance. Registration creates only a discovery-tier candidate and queues a target preflight; it never admits or collects the source.
- Every declared domain reports source-class attainment, governed-observation freshness, oldest open-frontier age, combined review backlog, and a deterministic `healthy` / `thin` / `stale` / `blocked` state with plain-language explanations.

**Operational follow-through:** use the board to clear candidate, referral, and quote-review backlogs; tune the explicit freshness thresholds only from observed operating history.

**Exit criteria:** every active domain has a visible, explainable coverage state and a safe route from trusted internal signals to source review.

### Stage 3 — Closed market-model → company-thesis loop (**Done**)

- Exposure investigation, CompanyPacket, company research, proposed investment thesis, linkage table, dedicated review packet, and accept/revise/reject/no-trade outcomes are durable and owner-scoped. The portfolio-led queue still prioritizes owned companies, then watchlists, then bounded FMP ticker peers in the market universe.
- Market research may nominate named public-company candidates only when the bounded source ledger explicitly identifies the company or ticker. The symbol is re-verified against active tradable market assets; generic value-chain beneficiaries remain visibly unresolved.
- A capped automatic lane queues independent company research only for source-attributed candidates meeting the high-materiality and confidence policy. It cannot accept a company thesis, create a capital decision, or place a trade.
- Market models show the exposure mechanism and all linked company-thesis versions. Company review packets show all originating market-model versions, research revisions, company-thesis history, review outcomes, capital-decision linkage, and the deduplicated source ledger.

**Operational follow-through:** refresh legacy market-model research under the structured company-candidate contract so older generic exposure rows can either resolve with provenance or remain explicitly unresolved.

**Exit criteria:** a market exposure can reliably become a reviewed company belief, or an explicit no-trade/rejection, without losing lineage.

### Stage 4 — Living thesis and calibration loop (**Partial**)

- Existing: monitors, monitor findings, research refresh queues, market prediction evaluator, decision reviews schema, and a research-contract guard requiring a near-term (1 week to 12 months) evaluable market prediction.

**Build next:**

1. Show monitor findings and the action taken directly on the thesis page.
2. Add company-level predictions and evaluate them against defined evidence conditions.
3. Publish a calibration dashboard for market and company predictions.
4. Add a thesis-change timeline that distinguishes evidence, research revision, review outcome, and capital decision.
5. Add a review cadence/SLA for stale accepted theses and unresolved monitor alerts.
6. Retire or annotate legacy long-dated predictions without rewriting their historical record; subsequent research versions must replace them with a near-term test.

**Exit criteria:** the owner can see, for each active thesis, what changed, why it matters, whether an action is required, and whether similar past beliefs were well calibrated.

### Stage 5 — Capital-allocation operating system (**Complete**)

- Existing: separate thesis-decision schema, entry actions, fair-value/entry-zone fields, decision review records, portfolio and private broker reconciliation. New capital decisions are server-enforced to link to the owner’s accepted company thesis and inherit its linked research version.

**Implemented:**

1. Build a single decision-review surface with own/watch/avoid, entry action, sizing policy, valuation support, catalyst, kill criteria, and “what changed since decision.”
2. Add portfolio-level constraint checks: concentration, correlated exposure, liquidity, account separation, and cash impact.
3. Add decision-review prompts for entry-zone arrival, thesis break, and outcome/postmortem—not automatic actions.
4. Position sizing remains owner-authored: target weight, position ceiling, correlated-exposure ceiling, liquidity limit, and correlation group are required inputs for an `own` decision. Stratum evaluates those inputs without recommending a size or gaining execution authority.

Capital decisions are now atomically persisted with their constraint ledger and account scope. Entry-zone and thesis-break prompts remain deterministic alerts, while a 90-day stale-decision prompt requests an explicit outcome/postmortem review.

**Exit criteria:** a user can move from accepted thesis to a reviewable capital decision and later evaluate that decision without any execution authority entering the system.

### Stage 6 — Breadth and economics of the real world (**Complete as a governed expansion program**)

**Implemented:**

1. Use portfolio-led company coverage first: owned companies, watchlists, and bounded adjacent-company leads make existing models useful to the actual book without calling peer relationships recommendations.
2. Establish a domain-admission rubric before adding packs: economic mechanism, source requirements, cross-domain links, expected decision relevance, and maintenance owner.
3. Expand domain packs progressively, prioritizing areas connected to active portfolio exposure and unresolved high-materiality frontiers.
4. Add explicit economic-capture analysis: who earns the rent, what is commoditized, how durable is the capture, and what breaks it.
5. Avoid a superficial “whole GICS map”; coverage is complete only when it has credible mechanisms, governed evidence, and a maintained decision use.

The source-control workspace now ranks domain maintenance from owned companies, watchlists, accepted company theses, and high-priority research frontiers. Activation requires a durable human admission review and named maintenance owner. The first breadth increment adds healthcare demand/reimbursement and consumer/commerce platforms as candidates under the same gates; neither is activated by declaration alone.

**Exit criteria:** breadth improves decision coverage without lowering source governance or turning the system into generalized market commentary.

### Stage 7 — Production integrity and operating discipline (**In progress, release-gating**)

1. Reconcile and document the Supabase migration ledger before any pending migration release.
2. Verify the macserver worker runs the intended immutable `main` release, with fresh heartbeats and end-to-end job success.
3. Maintain source-specific failure remediation rather than broad egress workarounds.
4. Track actual model/provider cost, queue latency, failure rate, retry rate, and stale-data windows.
5. For every product feature, verify browser → authenticated API → persisted data → worker behavior → production UI before declaring it delivered.

## 8. Prioritized remaining backlog

| Priority | Work | Why now | Dependency |
| --- | --- | --- | --- |
| P0 | Reconcile Supabase migration history | Blocks release of schema-backed features, including source referrals | Database provenance investigation |
| P0 | Dedicated company-thesis review packet and explicit no-trade/revise outcomes | Closes the central market-model-to-company decision gap | Existing CompanyPacket/research/thesis links |
| P0 | Evidence ledger and change timeline on thesis pages | Makes the system inspectable instead of prose/count driven | Existing immutable artifacts |
| P1 | Monitor findings and company-level prediction evaluation | Turns theses into living beliefs and learning records | Accepted thesis lifecycle |
| P1 | Link entry decisions to accepted thesis/research versions | Preserves decision lineage and separates action from belief | Company thesis contract |
| P1 | Release governed Intelligence/Markets referral lane | Widens discovery safely using existing internal signals | P0 migration reconciliation |
| P2 | Calibration and decision-outcome dashboard | Makes learning visible once enough evaluations exist | P1 evaluation data |
| Done | Portfolio constraint and sizing-review layer | Delivered without execution authority or system-recommended sizing | Linked entry decisions, owner-supplied sizing limits |
| Done | Additional domain packs and capture analysis | Delivered as a governed portfolio-led expansion program | Stable coverage-control process and admission ledger |

## 9. Definition of done for the eventual system

The system is ready to be called a private capital-allocation operating system when all of the following are true:

1. Every active market model has inspectable governed evidence, contradictions, open questions, version history, predictions, and exposed value-chain entities.
2. Every exposure that becomes company research has a durable originating-context link and independent company evidence.
3. Every company thesis has an explicit review outcome, evidence ledger, falsifiers, history, and monitor state.
4. Every active thesis has a visible current status: unchanged, strengthening, weakening, invalidated, or awaiting review—with source-backed reasons.
5. Every entry decision is separate from the thesis, linked to its supporting version, and reviewable later against expectations and outcomes.
6. Calibration is visible across predictions and capital decisions; the system learns from errors rather than hiding them in revised prose.
7. Source, model, worker, and database lineage are sufficiently reliable that the owner can distinguish missing data, failed collection, and genuine no-change states.
8. The system remains private, evidence governed, and incapable of placing trades.

## 10. Success metrics

These measures are product-health indicators, not return promises.

| Area | Metric |
| --- | --- |
| Evidence | Share of material thesis claims with direct source/quote linkage; source-health pass rate; median evidence freshness by domain |
| Coverage | Required evidence classes satisfied per active domain; open-frontier age; pending source/referral review backlog |
| Research | Time from exposure investigation to company-research proposal; percentage of proposals with a structured prior-version comparison |
| Thesis discipline | Percentage of accepted theses with explicit falsifier, fastest kill signal, monitor, and source ledger |
| Learning | Prediction evaluation completion rate; confirmed/disconfirmed/inconclusive mix by confidence band; decision review completion rate |
| Decision quality | Percentage of entry decisions linked to accepted thesis/research version; percentage with fair-value or explicit “not estimable” explanation |
| Operations | Worker heartbeat freshness, job success rate, queue age, migration parity, and release verification completeness |

## 11. Explicit non-goals

- Brokerage order placement, automated trading, portfolio rebalancing, or any other execution authority.
- Treating raw headlines, feeds, user notes, or broad-web scout results as market evidence without the relevant governance gate.
- A universal opaque score that merges discovery, belief, and entry timing.
- Claiming full-economy coverage based solely on a taxonomy or ticker list.
- Public redistribution of market data before licensing has been resolved.
- Replacing the owner’s capital judgment with a model output.

## 12. Related implementation documents

- [Markets orchestration handoff](../../handoff.md) — current worker/orchestration handoff and near-term operational context.
- [Markets deployment guide](../markets-deployment.md) — runtime topology, worker operation, credential boundary, and deployment controls.
- [Repository operating rules](../../AGENTS.md) — non-negotiable architectural and delivery constraints.
- [Original Stratum v0.1 PRD](2026-03-04-stratum-design.md) — historical Intelligence product design; not the Markets thesis-system plan.

## 13. Change control

This document is the planning source of truth for Markets thesis-system work. Update it when a stage exits, a product invariant changes, or a material dependency/blocker changes. Do not mark a stage complete based only on local code: require the relevant migration, worker/backfill, production deployment, and live data-path verification.
