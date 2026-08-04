# Stratum market-orchestration handoff

## Read this first

The user’s product direction is **market-wide autonomous research orchestration**, not a static source dashboard and not a collection of narrow data integrations.

The current system has a strong governance/evidence substrate, but the next agent should prioritize the orchestration layer that continuously turns market-wide signals and domain-specific research into useful, reviewable market models. Do **not** burn the next iteration on isolated source failures, cosmetic details, or adding verticals for their own sake. A single FERC root URL currently returns `403`; this is known, isolated, and not the current priority.

No trading authority is authorized. Never add order placement, brokerage write access, or a buy/sell execution path.

## Repository and deployment

- Repo: `/Users/aarushagarwal/Documents/Programming/Stratum`
- Branch: `main`
- Production: `https://stratum.aarushagarwal.dev`
- Vercel is production delivery; Supabase is durable state; Upstash is cache; QStash is optional scheduler redundancy; macserver is the private worker.
- The current deployed revision is `8fe41a8` (`feat: expose broad research scout controls`).
- The worker’s active checkout is reached through `~/Projects/Stratum-production-current` on `macserver`.
- `building_agents.md` is an untracked user file. Preserve it; do not stage it.

### Verification and release commands

```bash
node --test --experimental-strip-types tests/**/*.test.ts
npm run lint -- --quiet
npm run build

supabase migration list
supabase db push

git push origin main

ssh macserver 'active=$(readlink "$HOME/Projects/Stratum-production-current"); "$active/scripts/deploy-macserver-release.sh" "$active"'
npx vercel ls stratum --prod --yes
npx vercel inspect <new-production-url> --wait
```

The worker release script creates a detached immutable worktree, runs lint/focused tests/build, copies the owner-only worker environment, atomically swaps the active symlink, and restarts the launchd worker.

Do not call a local change “delivered.” Product work must be committed, pushed, migrated where relevant, worker-deployed, Vercel-deployed, and verified.

## What is already implemented and live

### 1. Governing architecture

The intended distinction is deliberate:

```text
broad research agents
  -> provisional cited leads / counter-evidence / open questions
  -> optional recurring-source promotion and bounded collection
  -> immutable raw document capture
  -> cheap quote-bound observation proposal
  -> reviewable governed observation
  -> baseline / hypothesis / analyst + critic revision
  -> thesis promotion only when separately eligible
  -> predictions and subsequent evaluation
```

The source registry is a **trust and recurring-collection layer**, not the search universe. Agents must research broadly. A recurring source should be promoted only after it has demonstrated recurring value; it should never become an exclusive corpus.

### 2. Domain packs and active verticals

`lib/markets/domain-packs.ts` declares the common economic-system model:

- mechanisms and required causal nodes
- source-class requirements
- entity kinds
- hypothesis/counter-thesis templates
- cross-domain transmission templates

All six currently declared packs are active in production:

1. `ai-power`
2. `semicap-data-center-equipment`
3. `critical-materials`
4. `macro-policy-geopolitics`
5. `industrial-automation`
6. `defense-industrial-capacity`

The domain-pack sync runs during worker startup (`ensureDeclaredMarketDomainPacks` in `lib/server/world-source-control.ts`). New packs automatically get a one-time coverage-planning job; this does **not** auto-admit sources or activate a domain.

### 3. Source control and immutable evidence

Key code:

- `lib/server/world-source-control.ts` — candidate validation, source contracts, coverage planning, activation, workspace read model
- `lib/server/world-source-health.ts` — worker-only preflight and health telemetry
- `lib/server/world-source-collector.ts` — bounded host/path/MIME collection and immutable document capture
- `lib/server/world-observation-proposals.ts` — cheap-model quote-bound proposals
- `lib/server/world-observation-review.ts` — acceptance/rejection gate
- `lib/server/world-memory.ts` — immutable evidence, baselines, hypotheses, cross-domain links, promotion

Important invariants:

- `world_documents`, `world_observations`, capture/proposal/review rows are append-only/immutable (see `202608040015_immutable_world_evidence.sql`).
- A source contract constrains allowed host, path, MIME, cadence, and assertion types.
- Candidate preflight checks only reachability/shape; it cannot grant admission.
- Approved event sources get one initial immutable capture, then do not get polled. Recurring sources follow their declared cadence.
- A cheap triage model cannot create evidence directly: its output must contain an exact quote and receives a separate review decision.
- Approval does not create a thesis or investment action.

### 4. Broad market-research scout (the latest correction)

This was added because the user correctly objected to a system over-focused on fixed sources.

Files:

- `lib/server/market-research-scout.ts`
- `schemas/market-research-scout.schema.json`
- `supabase/migrations/202608040023_broad_research_scout.sql`
- `components/markets/WorldSourceControlPanel.tsx`
- `app/api/markets/world-sources/route.ts`

Behavior:

- `scout-market-research` runs on the standard model tier, not the cheap source-scout tier.
- It searches a bounded market question across the public web, requires direct HTTPS URLs and short attributable quotes, and asks for supporting, contradictory, and contextual material.
- Its output is stored in `market_research_scout_runs` as a durable lead dossier.
- Leads are explicitly **provisional**: they cannot enter observations, baselines, hypotheses, predictions, recurring collection, or trading.
- A lead may be marked `recurringSourceCandidate`, but that is only a signal for later promotion—not automatic admission.
- The broader research lane runs automatically from a research frontier and can now also be launched manually from `/markets/system` via **Queue broad research scout**.
- The separate **Queue recurring-source scout** remains low cost and is reserved for stable scheduled-source discovery.

Production proof:

- One Industrial Automation pilot completed successfully in about 73 seconds on `gpt-5.6-terra`.
- It returned 9 cited leads, including a FANUC counter-signal, and 4 explicit unresolved questions.
- This is the correct proof standard: real durable output, not merely a queued job.

### 5. Model policy and cost controls

`lib/server/market-model-policy.ts` centralizes models:

- `source_scout` and observation triage: cheap tier (`STRATUM_SOURCE_SCOUT_MODEL`, currently intended for low-cost routing/extraction)
- broad research planning and prediction evaluation: standard tier
- analyst and adversarial critic: strong tier

`lib/server/agent-jobs.ts` persists model routing in each `agent_run`, uses idempotent dedupe keys, priorities, stale recovery, and bounded unattended research limits. The worker must never invoke Codex from a visitor page request.

### 6. Research, revision, cross-domain links, prediction evaluation

Already present:

- bounded market hypothesis analyst + adversarial critic: `lib/server/market-thesis-research.ts`
- durable research revisions and critic-originated frontier questions
- `route-market-research-frontiers` now sends unresolved questions to **broad research**, not just source discovery
- cross-domain mechanism links: `lib/server/world-memory.ts` plus migration `202608040005_market_hypothesis_cross_domain_links.sql`
- market-thesis predictions and evaluation: `lib/server/market-prediction-evaluation.ts`, migration `202608040002_market_prediction_evaluations.sql`
- unevidenced predictions expire without needless model calls

The important policy remains: market facts come from normalized/evidenced records; models organize, challenge, and explain them. The model does not invent prices or use broad-lead claims as factual evidence.

## Current production snapshot

Last direct production query showed:

- 6 active domain packs
- 17 successful immutable governed captures
- 37 quote-bound observation proposals
- 1 completed broad-research scout run
- 3 failed captures, all the same FERC root URL with `HTTP 403`

The FERC failure is isolated. `www.ferc.gov` is Cloudflare-protected from the worker; `data.ferc.gov` is reachable but requires an API key for actual dataset calls. Treat this as later source-specific work (a narrow proxy or an authenticated Data.FERC adapter), not the immediate orchestration priority.

## The actual next work: market-wide orchestration

The substrate is in place; the highest-leverage remaining work is to make the system behave as one coherent market-research operation.

### Recommended next milestone: an explicit market-research orchestrator

Build a durable orchestration/planning layer that, per active domain and global market state:

1. Reads new evidence, fresh proposal reviews, broad-research dossiers, market regime, and current hypothesis/frontier state.
2. Decides the **next best bounded action** for each domain: collect known source, request a broad investigation, promote a recurring candidate for verification, run a critic revision, evaluate a prediction, or do nothing.
3. Prioritizes actions across domains by materiality, novelty, unresolved core causal nodes, counter-evidence, and cost budget.
4. Persists the decision and its inputs/rationale as an auditable orchestration artifact/job—not just an unstructured prompt.
5. Enqueues only idempotent worker jobs. No web request should run market synthesis synchronously.
6. Produces an operator-visible market-wide queue/board that explains: what changed, why a domain is receiving work, what evidence is missing, what the strongest disconfirming signal is, and what is awaiting review.

Do not turn the orchestrator into one opaque score. Preserve the separation:

```text
discovery -> evidence -> hypothesis -> research/critic -> thesis -> entry decision
```

The first three layers are now especially important. Discovery is broad; evidence is governed/immutable; hypothesis is a causal model. They must not collapse into a stock recommendation.

### Design suggestions for that milestone

- Add a durable `market_orchestration_runs` / `market_orchestration_actions` model rather than relying only on `agent_jobs` as the record of intent.
- Use deterministic eligibility and a standard-tier planner for only the ambiguous prioritization portion. Store both deterministic signals and planner output.
- Include a per-domain budget/cooldown, so a prolific topic cannot consume all research spend.
- Treat lead dossiers as input to the planner only: they can generate an investigation or candidate-promotion action, but never count as evidence.
- Add explicit `counter_evidence` / `disconfirming` work selection. The pilot already proves the lead schema can represent this.
- Make recurring-source promotion reliability-based (repeated value, source class, preflight, corroboration), not a manual bottleneck or automatic trust grant.
- Build a deterministic test harness that feeds a small multi-domain event set and proves the orchestrator routes it to the appropriate next actions without producing a thesis/trade.

### Defer until after orchestration works

- Source-specific collection repairs such as the FERC `403`
- More verticals beyond the six active systems
- Extra UI polish on the source-control screen
- A public screener launch until market-data licensing/display constraints are settled

## Existing user interface and authorization boundaries

- `/markets/system` is authenticated; anonymous requests correctly redirect to `/markets-sign-in`.
- A browser check of the live route confirmed nonblank expected sign-in rendering and no framework overlay. Do not attempt to bypass the user’s session to inspect private UI.
- `/markets/system` now exposes both broad and recurring-source scouts, source contract controls, health telemetry, proposal review, domain activation state, and provisional lead dossiers.
- The user explicitly said they trust the agent to make source decisions; still keep source promotion narrow and auditable, and do not treat that as authority for trading.

## Working tree / commits

Latest commits:

```text
8fe41a8 feat: expose broad research scout controls
352e982 feat: add broad market research scout
33b0611 feat: capture newly approved governed sources
8eecea1 feat: bootstrap coverage for declared domains
4da6ee3 fix: require approved source coverage for domain activation
8dfe2a4 feat: add defense industrial capacity domain pack
fc839e2 feat: synchronize declarative market domain packs
```

At handoff, the only known untracked worktree file is `building_agents.md`, belonging to the user.

## Coding and delivery constraints

- Read and follow `AGENTS.md` at repo root.
- Use `apply_patch` for edits.
- Keep finished work in coherent commits; stage exact files only.
- Preserve unrelated/untracked work.
- Source-specific retries/failures are telemetry, not automatic source blocks or evidence.
- Do not silently mix Alpaca IEX/SIP feeds; retain `asOf` and provenance.
- Do not claim an Anthropic-to-OpenAI migration is complete unless current imports/jobs/tests/deployment prove it.
- Keep credentials server-only. `CODEX_API_KEY` belongs to the one worker child process; do not expose it to Vercel/browser code.
- User preference: execution-first, concise evidence-backed status; clearly distinguish planned vs implemented, local vs deployed, and queued vs actually completed.

## What to tell the user next

Lead with the product-level outcome, not the plumbing. For example:

> “The research substrate is live across six market systems. I am now building the orchestration brain that decides which domain gets researched, challenged, collected, or left alone—and records why—rather than adding more sources or verticals.”

