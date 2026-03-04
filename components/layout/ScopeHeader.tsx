// components/layout/ScopeHeader.tsx
interface ScopeHeaderProps {
  label: string
  lastUpdated?: string
}

export function ScopeHeader({ label, lastUpdated }: ScopeHeaderProps) {
  return (
    <div className="py-8 px-6 border-b border-[var(--border-subtle)]">
      <h1 className="text-[22px] font-bold uppercase tracking-[0.04em] text-[var(--text)] mb-1">
        {label}
      </h1>
      {lastUpdated && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Last updated {lastUpdated}
        </p>
      )}
    </div>
  )
}
