# World learning recovery

The September 29 audit found two World ingestion attempts running since September 23 while scheduling and heartbeats continued. Recovery restores processing; it does not establish improved investment performance.

## Runtime and evidence

- The worker pool yields to its control loop without freeing occupied slots. Each attempt has a process watchdog that terminates the worker before its stale-recovery deadline. Startup recovery retries persistent attempts only after the old worker has stopped. Supabase requests have a 30-second abort deadline. Routine World ingestion coalesces; explicit historical windows remain separate.
- World generation, criticism and revision read exact private evidence files, including prior source metadata and contrary evidence. Files are removed after the run. Web-enabled investigations also allow the critic to verify discovered sources. Existing source admission, independent review and shadow publication boundaries remain enforced.
- Scheduled/manual World runs explicitly revisit up to two overdue hypotheses and ask for bounded issuer investigations or explained evidence gaps. Existing lead validation, independent company research, feedback and daily research caps still apply. No lead or affirmative recommendation is guaranteed.

## Forecasts and comparison

New forecast output includes an exact observation period and unit. Supported quarterly FMP metrics resolve from dated company packets; supported FRED metrics resolve from captured vintages. The first captured eligible observation for the declared period is retained. Missing evidence, different units and unsupported metrics do not become wins or losses. Missing financial observations enqueue a bounded, daily-deduplicated packet refresh. Legacy forecast contracts remain readable.

`world-context-ablation-v1` is an optional prospectively registered probability comparison using existing immutable shadow tables. Each sampled edition uses at most six alphabetically selected eligible symbols, one economic question per symbol, with structured periods/units and deadlines within 95 days. One capture per UTC day is selected. Two separate model calls see identical company evidence and questions, one with explicit World context and one without it; neither sees original probabilities or the other arm's estimates. Null estimates remain recorded exclusions. Questions retain original forecast ordinals for resolution.

The comparison measures incremental explicit World context given already-produced company research. Embedded World influence in that research is not removed. It is not a comparison of capital policies or proof of causal alpha. Original recommendations are unchanged. Brier scores, a neutral 50% reference, overlap exclusions, unresolved episodes and the existing embargo are retained; promotion remains disabled.

## Product and release

The World page exposes last successful intake, accepted World publication, recommendation publication and outcome review. It also shows recent run results, recurring decision blockers, resolved economic claims and overdue hypotheses. Coverage freshness is recomputed at read time. Overview reads omit the historical journal archive and duplicate content columns.

Apply `202609290001_learning_health_indexes.sql` before deployment. It adds lookup indexes only; all 83 preceding local/remote migration entries were reconciled before application. No evidence or recommendation rows are rewritten. Deploy the web and private worker from the same verified main revision.

Local acceptance: 702 tests passing, one existing skip; production build passes; lint has no errors and 16 existing unrelated warnings. World rendering verified at 1672×941 and 390×844, including mobile dark mode. Forecast outcomes and statistically credible improvement require future observations; never infer them from a successful release.
