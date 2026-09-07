'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
const row = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
export function ForecastReview({
  forecast,
}: {
  forecast: Record<string, unknown>
}) {
  const content = row(forecast.content),
    router = useRouter()
  const [value, setValue] = useState(''),
    [url, setUrl] = useState(''),
    [available, setAvailable] = useState(''),
    [rationale, setRationale] = useState(''),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState(false)
  async function save() {
    setPending(true)
    try {
      const response = await fetch('/api/markets/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjudicate-forecast',
          forecastId: forecast.id,
          observedValue: Number(value),
          rationale,
          evidence: [{ url, availableAt: new Date(available).toISOString() }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setStatus('Assessment appended; original forecast preserved.')
      router.refresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Unable to record assessment')
    } finally {
      setPending(false)
    }
  }
  return (
    <details className="mt-4 border border-[var(--border)] p-5 text-sm">
      <summary className="cursor-pointer">
        {String(content.proposition)} ·{' '}
        {Math.round(Number(forecast.probability) * 100)}% · due{' '}
        {String(forecast.deadline).slice(0, 10)}
      </summary>
      <p className="mt-3">Confirm: {String(content.confirmation)}</p>
      <p>Invalidate: {String(content.invalidation)}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label>
          Observed {String(content.metric)}
          <input
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          Primary source URL
          <input
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label>
          Source available at
          <input
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
            type="datetime-local"
            value={available}
            onChange={(e) => setAvailable(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 block">
        Assessment, including contrary evidence
        <textarea
          className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
      </label>
      <button
        disabled={
          pending || value === '' || !url || !available || rationale.length < 20
        }
        onClick={save}
        className="mt-3 border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-40"
      >
        Append assessment
      </button>
      <p role="status" className="mt-2 text-xs">
        {status}
      </p>
    </details>
  )
}
export function ManualExecutionRecord({
  recommendationId,
}: {
  recommendationId: string
}) {
  const router = useRouter(),
    [side, setSide] = useState('buy'),
    [quantity, setQuantity] = useState(''),
    [price, setPrice] = useState(''),
    [time, setTime] = useState(''),
    [notes, setNotes] = useState(''),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState(false)
  async function save() {
    setPending(true)
    try {
      const response = await fetch('/api/markets/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId,
          eventType: 'manually_executed',
          requestId: crypto.randomUUID(),
          rationale: notes,
          occurredAt: new Date(time).toISOString(),
          details: { side, quantity: Number(quantity), price: Number(price) },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setStatus('Manual fill recorded. No order was sent.')
      router.refresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Unable to save fill')
    } finally {
      setPending(false)
    }
  }
  return (
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer">
        Record a trade you already made
      </summary>
      <p className="my-3 text-[var(--text-muted)]">
        Use actual filled quantity, price and time. This records an outcome; it
        does not contact your broker.
      </p>
      <div className="flex gap-2">
        {['buy', 'sell'].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={`border border-[var(--border)] px-3 py-2 capitalize ${side === s ? 'font-semibold' : ''}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label>
          Filled shares
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          />
        </label>
        <label>
          Fill price
          <input
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          />
        </label>
        <label>
          Fill time
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          />
        </label>
      </div>
      <label className="mt-3 block">
        Reason or override
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
        />
      </label>
      <button
        disabled={
          pending ||
          !(Number(quantity) > 0) ||
          !(Number(price) > 0) ||
          !time ||
          notes.trim().length < 3
        }
        onClick={save}
        className="mt-3 border border-[var(--border)] px-3 py-2 disabled:opacity-40"
      >
        Record completed trade
      </button>
      <p role="status" className="mt-2">
        {status}
      </p>
    </details>
  )
}
export function LearningRegistrationForm() {
  const [hypothesis, setHypothesis] = useState(''),
    [candidate, setCandidate] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [status, setStatus] = useState('')
  async function register() {
    try {
      const response = await fetch('/api/markets/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register-experiment',
          hypothesis,
          baselinePolicy: 'prospective-v1',
          candidatePolicy: candidate,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          primaryMetric: 'brier',
          minimumEpisodes: 30,
          minimumImprovement: 0.02,
          maximumDrawdownWorsening: 0,
          embargoDays: 20,
          trialNumber: 1,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setStatus(
        'Shadow experiment registered. Active investment policy is unchanged.',
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Registration failed')
    }
  }
  return (
    <details className="mt-6 border border-[var(--border)] p-5 text-sm">
      <summary className="cursor-pointer">
        Register a calibration experiment
      </summary>
      <p className="mt-3 text-xs leading-6 text-[var(--text-muted)]">
        Default protocol: improve Brier score by at least 0.02, at least 30
        independent episodes, 20-day overlap embargo, and no drawdown
        deterioration. Registration does not deploy a candidate policy.
      </p>
      <label className="mt-3 block">
        Falsifiable process hypothesis
        <textarea
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
        />
      </label>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label>
          Candidate policy version
          <input
            value={candidate}
            onChange={(e) => setCandidate(e.target.value)}
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          />
        </label>
        <label>
          Prospective start
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          />
        </label>
        <label>
          Evaluation end
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block w-full border border-[var(--border)] bg-transparent p-2"
          />
        </label>
      </div>
      <button
        disabled={hypothesis.length < 20 || !candidate || !start || !end}
        onClick={register}
        className="mt-3 border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-40"
      >
        Register shadow comparison
      </button>
      <p role="status" className="mt-2 text-xs">
        {status}
      </p>
    </details>
  )
}
