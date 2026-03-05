// components/sections/SectionHeader.tsx
interface SectionHeaderProps {
  label: string
  sources: string[]
}

export function SectionHeader({ label, sources }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
      <span className="text-[14px] font-bold text-[var(--text)]">
        {label}
      </span>
    </div>
  )
}
