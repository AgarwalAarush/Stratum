'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parsePositionCsv } from '@/lib/markets/portfolio-confirmation'

export function ManualPortfolioConfirmation({
  account,
}: {
  account: { id: string; name: string }
}) {
  const router = useRouter()
  const requestId = useRef<string | null>(null)
  function changed() {
    setConfirmed(false)
    requestId.current = null
  }
  const [csv, setCsv] = useState('symbol,quantity,cost_basis_per_share\n')
  const [cash, setCash] = useState(''),
    [asOf, setAsOf] = useState('')
  const [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState('')
  let preview = '',
    valid = false
  try {
    const positions = parsePositionCsv(csv)
    preview = `${positions.length} positions${positions.length === 0 ? ' — confirm explicitly if this account is empty' : ''}`
    valid = true
  } catch (error) {
    preview = error instanceof Error ? error.message : 'Invalid CSV'
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setStatus('')
    try {
      if (!cash.trim() || !asOf)
        throw new Error('Provide cash and capture time explicitly')
      const response = await fetch('/api/markets/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm-portfolio',
          portfolioId: account.id,
          csv,
          cash: Number(cash),
          asOf: new Date(asOf).toISOString(),
          confirmed,
          requestId:
            requestId.current ?? (requestId.current = crypto.randomUUID()),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setStatus(
        'Snapshot confirmed. Future evaluations will use this account evidence.',
      )
      router.refresh()
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Unable to confirm account',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <details className="my-6 border border-[var(--border)] p-5 text-sm">
      <summary className="cursor-pointer font-medium">
        Confirm {account.name} holdings and cash
      </summary>
      <p className="mt-3 max-w-3xl leading-6 text-[var(--text-muted)]">
        Record the complete account as of a known time. This creates a dated
        owner-confirmed snapshot; it does not place trades or add
        transactions. Confirm again after changing holdings or cash.
      </p>
      <form onSubmit={save} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          Cash balance (USD)
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={cash}
            onChange={(e) => {
              setCash(e.target.value)
              changed()
            }}
            className="border border-[var(--border)] bg-transparent p-2"
          />
        </label>
        <label className="grid gap-2">
          Account capture time
          <input
            required
            type="datetime-local"
            value={asOf}
            onChange={(e) => {
              setAsOf(e.target.value)
              changed()
            }}
            className="border border-[var(--border)] bg-transparent p-2"
          />
        </label>
        <label className="grid gap-2 md:col-span-2">
          Import holdings CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > 100000) {
                setStatus('CSV exceeds 100 KB')
                return
              }
              setCsv(await file.text())
              changed()
            }}
          />
        </label>
        <label className="grid gap-2 md:col-span-2">
          Review holdings
          <textarea
            rows={5}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value)
              changed()
            }}
            className="border border-[var(--border)] bg-transparent p-3 font-mono text-xs"
          />
        </label>
        <p className="md:col-span-2">{preview}</p>
        <label className="flex items-start gap-2 md:col-span-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm these are all holdings and the full cash balance at the
          stated time.
        </label>
        <button
          disabled={pending || !confirmed || !valid}
          className="w-fit border border-[var(--border)] px-4 py-2 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Confirm account snapshot'}
        </button>
        <p role="status" className="md:col-span-2">
          {status}
        </p>
      </form>
    </details>
  )
}
