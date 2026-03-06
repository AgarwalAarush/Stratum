// components/sections/SectionHeader.tsx
interface SectionHeaderProps {
  label: string
  sources: string[]
}

export function SectionHeader({ label, sources: _sources }: SectionHeaderProps) {
  void _sources

  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border-subtle)]">
      <span className="text-[15px] font-bold text-[var(--text)]">
        {label}
      </span>
    </div>
  )
}
