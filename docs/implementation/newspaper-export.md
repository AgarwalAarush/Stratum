# Private newspaper export

`GET /api/markets/newspaper` exports the authenticated Stratum owner's persisted
portfolio evidence and latest published recommendation edition. It is for a
private local PDF. This feature is local-only under the existing deployment hold;
it has not been merged, pushed, deployed, or enabled in production.

## Authorization and consumption

The route uses `getAuthenticatedMarketUser`: the existing signed,
HTTP-only `stratum-markets-session` cookie and fixed Markets owner. Authentication
configuration and a valid, unexpired signature are required. Development auth
bypass does not authorize this endpoint. No API key, bearer token, alternate
owner, CORS grant, credential creation, or new persistent access is introduced.
The proxy also protects `/api/markets/*`.

Once this change is separately authorized for release, the user can sign in to
Stratum normally and open `/api/markets/newspaper` in that same browser. The
response downloads as `stratum-newspaper.json`. The user can supply that file
directly to the local newspaper process. This is the preferred consumption path:
no newspaper credential or account access is needed. Keep the JSON and resulting
PDF local/private and outside Git; do not upload them to an external service.

For local verification, use the isolated checkout and existing authorized local
auth/persistence configuration, then sign in normally on that local origin. Do
not copy a session to another origin or expose service-role database credentials
to the newspaper. A dev bypass alone produces 401 at this route.

If the newspaper already has explicitly authorized access to a valid existing
owner session for the endpoint's origin, it can perform one HTTP GET using that
cookie from its private in-memory request context. This implementation does not
read/export browser cookies, create credentials, or save a cookie jar. Arranging
automated access, obtaining/transferring a session for a separate process,
renewing authentication, or adding persistent credentials requires separate user
approval. The user-provided JSON path avoids those actions. Production consumption
is blocked by the intentional deployment hold, not by a missing new auth grant.

## JSON contract (schemaVersion 1)

The checked-in TypeScript contract is `NewspaperExport` in
`lib/markets/newspaper-export.ts`. `tests/fixtures/newspaper-export.json` is an
illustrative, fictional specimen for adapter development, never a live fallback.
All amounts are USD, quantities may be fractional, and missing facts are `null`.
No realized or daily P&L is inferred; `unrealizedPnl` is supported current
valuation minus recorded remaining cost. `exportedAt` is the read time and must
never replace the evidence timestamps.

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `exportedAt`, `privacy` | `1`, ISO read time, `private-owner-only` |
| `portfolios[]` | Only the authenticated owner's accounts; no all-owner scan |
| `portfolios[].id/name/kind` | Local portfolio identity, display name, brokerage/manual |
| `dataSource` | `robinhood`, `manual_snapshot`, or `ledger` |
| `dataAsOf/confirmedAt/capitalAsOf` | Capture, confirmation, and capital observation times, separately retained |
| `capitalBasis` | `broker_cash`, `owner_reported_cash`, `ledger_cash`, or `owner_budget` |
| `cashBalance` | Supported cash; null for an allocation-budget account |
| `availableAllocation/allocationBudget` | Owner capacity and budget context; not settled cash |
| `investedCost/marketValue/totalValue/unrealizedPnl` | Persisted-authority totals; unavailable valuations remain null |
| `holdings[]` | Symbol, quantity, cost per share, remaining total cost, price/value/unrealized P&L, quote time/source |
| `holdings[].quoteSource` | `robinhood` or null; no UI/illustrative/visitor quote lookup |
| `freshness/capitalFreshness` | `{status: fresh\|stale\|unknown, asOf, maxAgeSeconds: 86400}` |
| `readiness` | `{ready, flags[]}` at holding, portfolio, analysis, and export levels |
| `analysis.status` | `published` or `unavailable`; missing editions do not trigger generation |
| `analysis.edition` | ID, decisionDate, publishedAt, summary, dataAsOf (frozen cutoff), policy, gaps |
| `analysis.recommendations[]` | Published ID, portfolioId, symbol, action, rationale/thesis/counter-thesis/mechanism/expectations, horizon/expiry/confidence, risks/invalidation, entry/exit/reassessment, sourceIds, dimensions, alternative, gateReasons, expired |
| `analysis.sources[]` | Only ID, public URL, asOf, availableAt, retrievedAt, feed; no raw evidence values |
| `errors[]` | `[{scope: analysis, code: read_failed}]` for analysis failure; no raw exception details |

Every holding also has freshness and readiness. An observed price is exported
only with its actual broker quote time and provenance; capture time never stands
in for a missing quote time. Missing manual/ledger prices are null. No Alpaca,
FMP, Robinhood MCP, or model request occurs during an export. Successful empty
broker captures remain empty; malformed successful captures fail closed rather
than silently dropping positions. Broker account totals remain authoritative
even when a holding quote is unavailable. Account capture totals and per-holding
quote values can reflect different observation times; do not recompute an
account total from mixed-time holdings or combine portfolios into an implied
synchronized balance.

The 24-hour freshness policy is explicit and calendar-based; a weekend/holiday
observation may be stale. Freshness is not a guarantee of a current market quote.
Consumers should display timestamps and stale/unknown/gap/error flags alongside
supported numbers. `ready: false` does not invalidate every supported value;
it indicates incomplete or stale evidence and must not be silently suppressed.
Expired published advice is retained as dated analysis, never relabeled current.
Published action labels do not authorize trading.

## Errors and read-only boundary

All handler responses carry `Cache-Control: private, no-store, max-age=0`,
`Vary: Cookie`, and `X-Content-Type-Options: nosniff`. Next's route is dynamic with
`revalidate = 0` (Next's route validator rejects custom exports such as
`CACHE_TTL_SECONDS`). No credentials or full brokerage account identifiers are
in the output. Source URLs with embedded credentials or secret-like query keys
are suppressed and flagged.

| HTTP | Result |
| --- | --- |
| 200 | Supported portfolio export; analysis may be unavailable with explicit flags |
| 400 | Query parameters rejected; no alternate owner/account/all-users/refresh mode |
| 401 | Missing/invalid/expired/unconfigured signed owner authentication |
| 503 | Authoritative holdings read/projection failure; no partial holdings returned |
| 405 | No mutation method is registered |

The existing proxy may return 503 before the route if authentication is not
configured. No portfolio POST, confirmation write, sync, job enqueue, outbox,
email preparation/delivery, or generation is reachable through the read path.
Published analysis uses only owner-scoped batches with non-null `published_at`,
their versions, and their frozen input manifest. There are no database migrations
or backfills for this feature.

An edition reaching the 1,000-row export bound is unavailable with `read_failed`
rather than silently truncated. The endpoint never returns a partial edition as
complete analysis.

## Validation

Focused tests exercise the real persisted reader through a fake Supabase HTTP
transport, verify every query's owner filter and GET method, and reject any
provider/job/outbox read. Request tests cover authentication, scope/method
rejection, secret-safe projections, missing/stale/invalidated evidence, budget
semantics, empty broker captures, and independent analysis failure. All fixture
holdings and credentials are synthetic.

```sh
node --test --experimental-strip-types tests/newspaper-export*.test.ts tests/portfolio-authority.test.ts tests/markets-auth.test.ts tests/recommendation-reads.test.ts tests/portfolio-confirmation.test.ts tests/multi-portfolios.test.ts
```

Local verification on October 1, 2026:

- Focused suite: 38 passed.
- Complete `npm test`: 776 passed, one existing skip, zero failures.
- ESLint: all changed TypeScript files passed.
- Application TypeScript check, including this route's generated dev validator:
  passed with tests and generated production validators excluded. The latter
  expose pre-existing custom route exports in other endpoints.
- Before build-generated validators, full `tsc` produced the identical 51 test
  diagnostics on the feature checkout and an archive of base `423acc9`.
- Real Next dev HTTP smoke with synthetic auth/database fixtures: unauthorized
  401 even with dev bypass, signed owner 200, query scope 400, mutation 405;
  five persistence GETs, all owner-scoped; private/no-store headers confirmed.
- `npm run build` could not complete in this environment. After replacing an
  external dependency symlink with a local copy, default Turbopack stalled during
  compilation and was stopped. Bounded `npm run build -- --webpack` failed on
  `fonts.googleapis.com` DNS lookup / IBM Plex and Instrument Serif downloads.
  No production build success or live data verification is claimed.

This work contains no real holdings export, migrated data, credentials, push,
merge, or deployment. The separate newspaper repository was not modified.
