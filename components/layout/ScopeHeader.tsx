// components/layout/ScopeHeader.tsx
interface ScopeHeaderProps {
  label: string
  lastUpdated?: string
}

export function ScopeHeader({ label, lastUpdated }: ScopeHeaderProps) {
  return (
    <div className="py-12 px-12 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
      <h1 className="text-[28px] font-bold text-[var(--text)] mb-1">
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
