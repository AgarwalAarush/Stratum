// components/sections/SectionContainer.tsx
import { SectionHeader } from './SectionHeader'

interface SectionContainerProps {
  label: string
  sources: string[]
  children: React.ReactNode
  itemCount?: number
  featured?: boolean
}

export function SectionContainer({
  label,
  sources,
  children,
  itemCount,
  featured,
}: SectionContainerProps) {
  return (
    <section className="border border-[var(--border)] rounded-[12px] overflow-hidden bg-[var(--surface)] shadow-sm">
      <SectionHeader label={label} sources={sources} />
      <div className="overflow-y-auto" style={{ maxHeight: featured ? '480px' : '320px' }}>
        {children}
      </div>
      {itemCount !== undefined && itemCount > 5 && (
        <div className="px-4 py-2 border-t border-[var(--border-subtle)]">
          <button className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer">
            {itemCount - 5} more →
          </button>
        </div>
      )}
    </section>
  )
}
