# Recommendation review and portfolio reporting

The recommendation detail is an investment memo alongside an owner decision workspace. Accept, Wait and Reject append review events. Acceptance records intent; the owner separately reports a completed trade and confirms its extracted shares, fill price, fees, time and portfolio effect.

The memo reads the immutable recommendation's frozen research, including its base and opposing scenarios. Canonical World evidence is displayed only when it was frozen with that decision. Missing links and missing measurable forecasts are explicit. Source IDs stay internal; the disclosure presents readable source names and dates. The generator's prospective-v1.6 policy requires concrete research facts, future cash-flow reasoning, contrary scenarios and observable reassessment conditions for exits as well as entries. Existing editions remain immutable.

## Trade review contract

Clear trade reports use deterministic parsing. Ambiguous reports use structured OpenAI extraction when a server-only API key is configured, or a durable `review-recommendation-trade` job on the private Codex worker. The worker has read-only analysis scope and cannot update a portfolio. Missing or hypothetical trade details require clarification. Review progress is polled through an authenticated, owner-scoped, private endpoint.

The server validates the report against the recommendation, actual fill time and current owner holdings. It signs an expiring confirmation preview. Confirmation invokes `record_reviewed_recommendation_trade`, which locks the portfolio and atomically appends an idempotent transaction and recommendation outcome. Manual snapshots also append a new shares/cash confirmation. Private brokerage snapshots remain authoritative; the ledger report waits for broker reconciliation to change broker holdings. No order-placement integration is involved.

Migration: `202610020001_reviewed_recommendation_trades.sql`. Optional fast extraction model: `OPENAI_PORTFOLIO_TRADE_REVIEW_MODEL`, centrally configured in `lib/ai/config.ts`; no Vercel OpenAI credential is required for the private-worker path.

## October 1 delivery

Product code was merged in PR #46. The release was backported onto the actual live web baseline `039e87b`, producing isolated release `369817b265369ca91ad408a576756877c9727549`. This preserves the existing hold on unrelated October 1 backend work and migrations 006–008. Only the reviewed-trade migration was applied. The previous worker release is retained for rollback.

Validation: main-line production build and 781 passing tests, one existing skip; isolated release build and 755 passing tests, one existing skip; focused worker tests; actual read-only Codex extraction of an illustrative report. Desktop 1672×941, mobile 390 and mobile dark-mode layouts were checked. The local Accept → report → preview → confirm interaction used mocked responses. No actual owner decision, portfolio transaction or broker order was created during verification.
