# Stratum World Thinker handoff

## Read this first

The user’s product direction is one **persistent, autonomous World Thinker** that reads broadly, maintains a readable model of the world, invents falsifiable cross-domain hypotheses, and queues independent company research. It is not a static source dashboard, a collection of narrow integrations, or a fixed domain-template generator.

No trading authority is authorized. Never add order placement, brokerage write access, or a buy/sell execution path.

The canonical end-state, staged delivery plan, product invariants, and definition of done are in [the Markets Thesis System PRD](docs/plans/2026-08-13-markets-thesis-system-prd.md). This handoff is operational context, not the roadmap source of truth.

## Active migration

The implementation lives on `codex/world-thinker`. The release order is contracts/storage, event awareness, Thinker/critic, opportunity bridge, UI, then the 48-hour shadow cutover.

- Raw evidence stays in `/Users/Shared/StratumData`; synthesized state lives in private Git at `/Users/Shared/StratumData/world-model`.
- Supabase projects a validated commit for authenticated Vercel reads. Projection is rebuildable and idempotent by commit SHA.
- `refresh-world-events` runs every 15 minutes. `run-world-thinker` runs at 06:00 and 18:00 ET plus coalesced urgent deltas.
- Strong-call budget is one Thinker, one critic, and at most one revision. Live search is opt-in per approved run.
- Research leads require explicit transmission/capture mechanisms, active/tradable assets, thresholds, caps, and 14-day duplicate protection.
- Company research feeds back into the World Thinker. It cannot auto-accept the company thesis or create a capital decision.

Migration: `202608170001_world_thinker.sql`

`building_agents.md` is an untracked user file. Preserve it; do not stage it.

## Architecture reminder

```text
all feeds and documents
  -> event cluster and claim state
  -> progressive retrieval
  -> World Thinker proposal
  -> critic and host validation
  -> atomic Git commit and projection
  -> company research lead
  -> independent company thesis review
  -> owner-only capital decision
```

## Cutover rule

Do not enable `STRATUM_WORLD_CUTOVER_ENABLED=true` until 48 live shadow hours pass and repository, projection, Morning Brief, and `/markets/world` agree on one commit. Before cutover, old baselines/templates remain read-only-compatible. After cutover, `run-market-thesis-cycle` collects governed sources and enqueues the Thinker; it no longer creates fixed-template hypotheses. `orchestrate-market-research` only observes bounded company-research execution.

## Still deferred

- FERC 403 / source-specific collection repairs
- Public screener licensing
- Exact provider $ token billing telemetry (hard job caps ship first)
