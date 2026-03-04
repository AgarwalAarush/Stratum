// components/layout/ThemeToggle.tsx
'use client'
import { useEffect } from 'react'
import { useThemeStore } from '@/store/theme'

export function ThemeToggle() {
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
      className="flex items-center gap-2 w-full px-3 py-2 rounded-[4px]
                 text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]
                 text-[11px] font-medium transition-colors cursor-pointer"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="text-base leading-none">{theme === 'dark' ? '☀' : '🌙'}</span>
      <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}
