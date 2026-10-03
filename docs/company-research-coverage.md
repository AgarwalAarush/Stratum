# Material company-research coverage

Individual-company equity reports run an independent background-research preflight after refresh classification promotes the job to full research. The existing worker uses native web search with the centrally selected standard planning model. Initial reports receive the same check. ETF constituent underwriting is outside this change.

The preflight identifies three to five material investment debates without allowing the prior report to define the topic list. Emerging businesses matter when they influence valuation, even before material revenue. The collection budget is one six-minute pass, at most ten additional unique documents, and one three-minute retry for unresolved decisive topics. The retry receives captured text so its quotations can be verified rather than inferred from headlines. Exhaustion, failed extraction, and unresolved economics remain explicit partial states.

The company packet retains the newest 8-K and searches recent 8-K bodies for Item 2.02/results of operations. It captures the latest identified earnings filing and relevant Exhibit 99 attachments. The shared HTML/PDF extractor produces durable text with URL, publication date when known, capture time, content hash, extraction status, and error. Discovery URLs, headlines, and failed captures are not readable evidence. Collector navigation links are not stored as research evidence.

Optional `researchCoverage.version = 1` contains topics, verified quotations, source IDs, unresolved questions, collection status, generation metadata, attempts, and duration. Full captured documents are persisted in the existing `company_packets` JSON before synthesis. Synthesis gets bounded passages plus every verified topic quotation. The immutable report's `coverageReview` maps every topic to substantive sections, readable source IDs, its investment implication, and limitations. The existing source ledger records the supporting sources.

Validation rejects omitted topics, unrelated or unreadable citations, and quotations that do not match normalized captured text. Decisive gaps prohibit sufficient-evidence or eligible-entry advice. Independently supported Hold/Trim/Sell advice requires an explicit explanation of why those gaps do not undermine that particular conclusion; frozen recommendation gates and the independent critic check the same distinction. Commercial deployment, reception, paid adoption, safe scaling, profitability, and valuation are separate claims. Missing evidence is not evidence of nonexistence.

Price-only refreshes retain coverage. Changed captured evidence, launches, deployment changes, and approvals enter the existing materiality/revalidation path; supported material changes promote a full report. Historical reports are not rewritten. Reports lacking coverage remain readable and are labeled legacy in the existing Evidence view. Recommendation generation and page requests do not browse the web.

Job diagnostics expose collection status, readable/failed capture counts, unresolved topic IDs, attempts, and stage duration. A completed research job can contain partial coverage; completion means validated, useful analysis was persisted, not that the company is exhaustively understood.

## Verification

`tests/research-coverage.test.ts` covers newer financing versus earnings 8-K selection, Exhibit 99 capture, HTML/SGML and PDF extraction, unreadable discovery, quotation mismatch, omitted topics, decisive action gates, independent existing-position advice, bounded retry exhaustion and recovery, captured-text retry grounding, refresh reuse/materiality, root schema references, and a bounded single-packet synthesis prompt. The full research validator and recommendation gates provide the production contract checks.

## Scoped release compatibility

The October 2026 release was backported onto the deployed application baseline because unrelated main-branch releases and their migrations were held by the owner. The Vercel ignored-build hold remains enabled. This feature needs no new database tables or migrations. Where the separately held `research_refresh_checks` table is unavailable, the check is frozen on the newly materialized packet; other database failures still fail the job. The production branch is `codex/company-research-production`; do not substitute a blanket main deployment for this scoped release while that hold remains active.

The subsequent ownership contract-2 release adds the interest inventory and activates the append-only refresh-check prerequisite through a separate scoped branch. Its scheduling contract, exact migrations and acceptance checkpoint are recorded in [Ownership research contract 2](implementation/ownership-research-v2.md).
