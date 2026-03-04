// components/sections/SectionHeader.tsx
interface SectionHeaderProps {
  label: string
  sources: string[]
}

export function SectionHeader({ label, sources }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text)]">
        {label}
      </span>
      <div className="flex gap-1.5 flex-wrap justify-end">
        {sources.map((source) => (
          <span
            key={source}
            className="text-[10px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]"
          >
            {source}
          </span>
        ))}
      </div>
    </div>
  )
}
