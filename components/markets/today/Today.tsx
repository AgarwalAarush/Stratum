import Link from 'next/link'
import { recommendationStatus } from '@/lib/markets/recommendation-status'
import type { Recommendation } from '@/lib/markets/recommendations'
import {
  fetchTodayMarket,
  fetchTodayPortfolio,
  summarizeTodayDecisions,
} from '@/lib/server/today'
import { allocationPercent, signedPercent } from '@/lib/markets/today'
import { readableDecisionText } from '@/lib/markets/recommendation-display'
import styles from './Today.module.css'

function time(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  }).format(new Date(value))
}
function money(value: number | null) {
  return value == null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value)
}
export function TodaySkeleton({ label }: { label: string }) {
  return (
    <section
      className={styles.loading}
      aria-busy="true"
      aria-label={`Loading ${label}`}
    >
      <p className={styles.eyebrow}>{label}</p>
      <div />
      <div />
    </section>
  )
}
function Unavailable({ title, href }: { title: string; href: string }) {
  return (
    <section className={styles.unavailable}>
      <h2>{title} is unavailable</h2>
      <p>Saved data could not be loaded. Refresh to try again.</p>
      <Link href={href}>Open details →</Link>
    </section>
  )
}
export async function TodayPortfolio({ ownerId }: { ownerId: string }) {
  const data = await fetchTodayPortfolio(ownerId).catch(() => null)
  if (!data)
    return (
      <Unavailable title="Your assessment" href="/markets/recommendations" />
    )
  const summary = summarizeTodayDecisions(data.decisions)
  const status = recommendationStatus(
    data.decisions.map(
      (d) =>
        ({
          action: d.action,
          reason: d.reason,
          gateReasons: d.gate_reasons,
          expiresAt: d.expires_at,
        }) as Recommendation,
    ),
  )
  return (
    <section className={styles.decision}>
      <div className={styles.call}>
        <p className={styles.eyebrow}>Your next move</p>
        <h2>{status.title}</h2>
        <p className={styles.deck}>{status.description}</p>
        {summary.cleared.length > 0 && (
          <ul className={styles.actions}>
            {summary.cleared.map((d) => (
              <li key={`${d.portfolio_id}:${d.symbol}`}>
                <strong>
                  {d.action.toUpperCase()} · {d.symbol}
                </strong>
                <span>{readableDecisionText(d.reason)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link
          className={styles.primary}
          href="/markets/recommendations"
          prefetch={false}
        >
          {summary.actionCount ? 'Review changes' : 'View assessment'}{' '}
          <span>↗</span>
        </Link>
        <p className={styles.meta}>Assessment · {time(data.publishedAt)}</p>
      </div>
      <div className={styles.allocation}>
        <div className={styles.sectionHead}>
          <h3>Capital at a glance</h3>
          <Link href="/markets/portfolio">Portfolio ↗</Link>
        </div>
        {data.accounts.map((p) => {
          const percent = allocationPercent(p.invested, p.total)
          return (
            <div className={styles.account} key={p.id}>
              <div className={styles.accountHead}>
                <span>{p.name}</span>
                <strong>{money(p.total)}</strong>
              </div>
              <p className={styles.meta}>
                {p.budget ? 'Total investment budget' : 'Account value'}
              </p>
              {percent !== null && (
                <div
                  className={styles.bar}
                  role="img"
                  aria-label={`${percent.toFixed(1)} percent in holdings`}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
              )}
              <div className={styles.legend}>
                <span>
                  <i />
                  {money(p.invested)} in holdings
                </span>
                <span>
                  {money(p.available)} {p.budget ? 'to allocate' : 'cash'}
                </span>
              </div>
              <p className={styles.meta}>
                {p.source === 'manual_snapshot'
                  ? 'Owner snapshot'
                  : p.source === 'robinhood'
                    ? 'Robinhood snapshot'
                    : 'Saved snapshot'}{' '}
                · {time(p.asOf)}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
export async function TodayMarket() {
  const data = await fetchTodayMarket().catch(() => null)
  if (!data)
    return <Unavailable title="Market snapshot" href="/markets/overview" />
  return (
    <section className={styles.market}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>Market pulse</p>
          <h2>{data.regime || 'Latest market snapshot'}</h2>
        </div>
        <Link href="/markets/overview">Full market view ↗</Link>
      </div>
      <p className={styles.meta}>
        Latest saved session · {time(data.data_as_of)} · Sector feed:{' '}
        {(data.feed || 'unknown feed').replaceAll('_', ' ').toUpperCase()}
      </p>
      <div className={styles.tape}>
        {data.instruments.map((i) => (
          <a key={i.id} href={i.sourceUrl} target="_blank" rel="noreferrer">
            <span>{i.label}</span>
            <strong>{i.value}</strong>
            <b data-direction={i.direction}>{i.change}</b>
            <small>
              {i.sourceLabel} · {i.dataStatus.replaceAll('_', ' ')}
              <br />
              {time(i.feedTimestamp)}
            </small>
          </a>
        ))}
      </div>
      <div className={styles.mapHeader}>
        <h3>Sector map</h3>
        <span>Latest session · average constituent return</span>
      </div>
      <div className={styles.sectors}>
        {data.sectors.map((s) => (
          <div
            key={s.label}
            data-direction={
              s.dayReturn == null
                ? 'flat'
                : s.dayReturn > 0
                  ? 'up'
                  : s.dayReturn < 0
                    ? 'down'
                    : 'flat'
            }
          >
            <span>{s.label}</span>
            <strong>{signedPercent(s.dayReturn)}</strong>
          </div>
        ))}
      </div>
      {(data.risks.length > 0 || data.catalysts.length > 0) && (
        <div className={styles.watch}>
          {data.catalysts[0] && (
            <div>
              <p className={styles.eyebrow}>What to watch</p>
              <p>{data.catalysts[0]}</p>
            </div>
          )}
          {data.risks[0] && (
            <div>
              <p className={styles.eyebrow}>Main risk</p>
              <p>{data.risks[0]}</p>
            </div>
          )}
        </div>
      )}
      <Link className={styles.worldLink} href="/markets/world">
        Explore the world signals behind the market →
      </Link>
    </section>
  )
}
