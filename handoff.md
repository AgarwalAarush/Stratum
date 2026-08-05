# Stratum market-orchestration handoff

## Read this first

The user’s product direction is **market-wide autonomous research orchestration**, not a static source dashboard and not a collection of narrow data integrations.

No trading authority is authorized. Never add order placement, brokerage write access, or a buy/sell execution path.

## Current deployed milestone (orchestration brain v2)

Shipped on branch work culminating in the finish-orchestration-brain pass:

- Sole 6h control plane: `orchestrate-market-research` only (children enqueued by the planner)
- Policy auto-accept for quote-bound proposals from approved/probation sources (verbatim quote + live contract)
- Deterministic-v2 actions: investigate_broad, investigate_counter_evidence, verify_recurring_source, critic_revision, collect_known_source, evaluate_prediction, awaiting_review, no_action
- Standard-tier model arbitrator only when expensive jobs exceed `STRATUM_MARKET_RESEARCH_RUN_LIMIT`
- Worker concurrency via `STRATUM_WORKER_CONCURRENCY` (default 2, max 4)
- System board shows cost shape, dissent, auto vs human review, budget skips

Migration: `202608040025_orchestration_brain_v2.sql`

`building_agents.md` is an untracked user file. Preserve it; do not stage it.

## Architecture reminder

```text
discovery (autonomous search)
  -> evidence gate (auto or human; verbatim quote + contract)
  -> hypothesis / critic
  -> orchestration (eligibility + optional model rank under budget)
  -> thesis / entry (later, separately gated)
```

## Deferred

- FERC 403 / source-specific collection repairs
- More verticals beyond the six active systems
- Public screener licensing
- Exact provider $ token billing telemetry (hard job caps ship first)
