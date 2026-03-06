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
  featured: _featured,
  className = '',
}: SectionContainerProps) {
  void _featured

  return (
    <section className={`flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-[20px] shadow-sm hover:shadow-md transition-shadow overflow-hidden ${className}`}>
      <SectionHeader label={label} sources={sources} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {children}
      </div>
      {itemCount !== undefined && itemCount > 5 && (
        <div className="px-8 py-5 border-t border-[var(--border-subtle)]">
          <button className="text-[12px] font-medium text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer">
            View all {itemCount} items →
          </button>
        </div>
      )}
    </section>
  )
}
