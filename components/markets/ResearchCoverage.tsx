'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import type { ResearchCoverageResponse } from '@/lib/server/interest-coverage';
import styles from './ResearchCoverage.module.css';
const labels: Record<string, string> = { awaiting: 'Awaiting investigation', investigating: 'Investigating', decision_ready: 'Supports a decision', unresolved: 'Unresolved' };
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
export function ResearchCoverage({ initial }: {
    initial: ResearchCoverageResponse | null;
}) {
    const [theme, setTheme] = useState('holdings'), [showExcluded, setShowExcluded] = useState(false), [error, setError] = useState(''), [limit, setLimit] = useState(12);
    const { data, mutate } = useSWR<ResearchCoverageResponse>('/api/markets/research/coverage', async (url) => { const response = await fetch(url); if (!response.ok)
        throw new Error('Coverage unavailable'); return response.json(); }, { fallbackData: initial ?? undefined, refreshInterval: 60000 });
    if (!data)
        return <p className={styles.empty}>Research coverage is temporarily unavailable.</p>;
    const rows = theme === 'holdings' ? data.holdings : data.members.filter(m => m.theme === theme && m.active && (showExcluded || !m.excluded));
    const changeTheme = (value: string) => { setTheme(value); setLimit(12); };
    const exclude = async (symbol: string, excluded: boolean) => { setError(''); try {
        const response = await fetch('/api/markets/research/coverage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, theme, excluded }) });
        if (!response.ok)
            throw new Error('Coverage preference could not be saved.');
        await mutate();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to save preference');
    } };
    return <section className={styles.coverage} aria-labelledby="research-coverage-title">
  <header><div><p className={styles.eyebrow}>Research coverage</p><h2 id="research-coverage-title">{data.metrics.holdingContractCurrent} / {data.metrics.holdingTotal} holdings upgraded</h2></div><p>{data.metrics.todayStarted} started · {data.metrics.todayReserved} / {data.dailyLimit} daily slots reserved</p></header>
  <p className={styles.note}>Decision support is reviewed research. Current price, portfolio constraints and recommendation review still determine the action. {data.metrics.failedPrerequisites > 0 ? `${data.metrics.failedPrerequisites} holdings have a failed prerequisite.` : ''}</p>
  <div className={styles.tableWrap}><table><caption className="sr-only">Interest research inventory</caption><thead><tr><th>Coverage</th><th>Inventory</th><th>Researched</th><th>Awaiting</th><th>Investigating</th><th>Decision support</th><th>Unresolved</th></tr></thead><tbody>{data.themes.map(t => <tr key={t.id}><th><button onClick={() => changeTheme(t.id)} aria-pressed={theme === t.id}>{t.label}</button></th><td>{t.total}</td><td>{t.researched}</td><td>{t.awaiting}</td><td>{t.investigating}</td><td>{t.decisionReady}</td><td>{t.unresolved}</td></tr>)}</tbody></table></div>
  <div className={styles.controls}><button aria-pressed={theme === 'holdings'} onClick={() => changeTheme('holdings')}>Owned holdings</button><span>{theme === 'holdings' ? 'Ownership upgrades' : data.themes.find(t => t.id === theme)?.label} · {rows.length} names</span>{theme !== 'holdings' && <label><input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)}/> Include exclusions</label>}</div>
  {error && <p role="alert">{error}</p>}
  <div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Status</th><th>Last investigation</th><th>Next check / scheduled work</th>{theme !== 'holdings' && <th>Coverage</th>}</tr></thead><tbody>{rows.slice(0, limit).map(r => <tr key={r.symbol}><th><Link href={`/markets/stocks/${r.symbol}`}>{r.symbol}</Link></th><td>{r.job?.status === 'failed' || r.job?.status === 'blocked' ? <details><summary>Failed prerequisite</summary><p>{r.job.error ?? 'Investigation could not complete.'}</p></details> : labels[r.status]}</td><td>{date(r.lastInvestigation)}{r.researched && !r.contractCurrent ? ' · legacy' : ''}</td><td>{r.job?.status === 'queued' ? `Scheduled ${date(r.job.scheduledFor)}` : r.nextCheck.trigger ? `${String(r.nextCheck.trigger)}${r.nextCheck.nextCheckAt ? ` · ${date(r.nextCheck.nextCheckAt)}` : ''}` : 'Awaiting scheduling'}</td>{theme !== 'holdings' && <td><button onClick={() => exclude(r.symbol, !('excluded' in r && r.excluded))}>{'excluded' in r && r.excluded ? 'Restore' : 'Exclude'}</button></td>}</tr>)}</tbody></table></div>
  {rows.length > limit && <button className={styles.more} onClick={() => setLimit(limit + 30)}>Show more ({rows.length - limit})</button>}
  <footer>Inventory checked {date((data.inventory as {
        asOf?: string;
    } | null)?.asOf)} · {(data.inventory as {
        classificationGaps?: number;
    } | null)?.classificationGaps ?? '—'} listings awaiting classification · {data.metrics.researchFailures} latest research failures</footer>
 </section>;
}
