// components/layout/ThemeToggle.tsx
'use client'
import { useEffect } from 'react'
import { useThemeStore } from '@/store/theme'

interface ThemeToggleProps {
  compact?: boolean
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, toggle, setTheme } = useThemeStore()

  // Sync with localStorage on mount (handles SSR/hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem('stratum-theme') as 'dark' | 'light' | null
    if (saved && saved !== theme) {
      setTheme(saved)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      onClick={toggle}
      className={[
        'transition-colors cursor-pointer',
        compact
          ? 'w-10 h-10 rounded-[8px] flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
          : 'flex items-center gap-2 w-full px-2 py-2 rounded-[3px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[10px] font-medium font-mono uppercase tracking-[0.08em]',
      ].join(' ')}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={compact ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
    >
      <span className={compact ? 'text-[15px] leading-none' : 'text-[13px] leading-none'}>
        {theme === 'dark' ? '☀' : '🌙'}
      </span>
      {!compact && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}
