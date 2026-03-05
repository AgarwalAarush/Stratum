// components/sections/SectionContainer.tsx
import { SectionHeader } from './SectionHeader'

interface SectionContainerProps {
  label: string
  sources: string[]
  children: React.ReactNode
  itemCount?: number
  featured?: boolean
  className?: string
}

export function SectionContainer({
  label,
  sources,
  children,
  itemCount,
  featured,
  className = '',
}: SectionContainerProps) {
  return (
    <section className={`flex flex-col bg-[var(--bg)] overflow-hidden ${className}`}>
      <SectionHeader label={label} sources={sources} />
      <div className="flex-1 overflow-y-auto">
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
