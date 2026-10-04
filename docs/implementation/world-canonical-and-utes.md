# Canonical World and UTES research

The owner requested canonical World authority on October 3, 2026. Set
`STRATUM_WORLD_CUTOVER_ENABLED=true` on both the private worker and production
frontend only after their matching release is verified. This makes accepted,
current World beliefs eligible for frozen decision context. It does not accept
an owner thesis, execute a trade, or promote an investment-policy experiment.

## Publication integrity

- An already projected shadow commit can be promoted idempotently. Projection
  recovery honors the actual publication result, including superseded commits.
- Checked promotion compares the expected current commit inside the database
  publication lock. Losing writers cannot restore older authority or publish
  memory before promotion succeeds. A new winner records when canonical
  authority began; a retry preserves that time.
- Decisions and live recall bind to the accepted canonical commit. Partial
  publication produces an explicit gap rather than falling back to older
  authority. Historical memory queries retain their first-known cutoff.
- Latest lifecycle state and review expiry determine eligibility within the
  accepted snapshot. Archived, superseded, dormant, overdue, and malformed
  beliefs cannot revive an older active version.
- The host restores cited source entries only when their exact IDs already
  exist in its input ledger. Invented citations still fail validation. The
  independent critic remains mandatory.
- Company research uses World for questions and document leads; independent
  company evidence remains the source of its investment opinion.

## Historical reconstruction

Resuming a legacy replay starts a separate `reconstruction/*` run over the same
interval. It preserves the original failed run and its historical counters.
Reconstruction reads only observations and documents ingested before each
weekly cutoff. It never consults current portfolios or World state, performs
web search, invokes the model, or publishes causal beliefs. Progress is derived
from saved weekly artifacts, making retries idempotent. Windows without original
evidence remain uncovered. Completion is not an investment backtest.

## UTES official issuer adapter

UTES uses the [Virtus product page](https://www.virtus.com/products/reaves-utilities-etf)
and its linked complete daily XLS workbook. The adapter validates fund identity,
issuer dates, literal workbook values, all holdings including cash, and total
weight. It preserves the ordinary ETF evidence checks and source ledger.

Virtus rejects Node Fetch on both the development Mac and worker. This adapter
uses a bounded native HTTPS request restricted to the official issuer origin,
with no redirects or credentials. SheetJS CE 0.20.3 is pinned from the official
distribution because the npm registry package is older.

## Delivery acceptance

Apply the backward-compatible checked-promotion migrations and regenerate the
database contracts. Run focused regression checks and the complete `npm run
verify` workflow. Follow the coordinated release drain, stage, activate, promote,
and resume procedure. Verify canonical database publication, live recall and
decision binding, the World routes in Dia, reconstruction artifacts, and a
persisted UTES research note before reporting completion.

Prospective investment outcomes and missing historical originals remain separate
evidence limitations. They must not be relabeled as verified performance.
