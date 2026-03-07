// components/layout/ThemeToggle.tsx
'use client'
import { useEffect } from 'react'
import { useThemeStore } from '@/store/theme'
import { Sun, Moon } from 'lucide-react'

interface ThemeToggleProps {
  isOpen?: boolean
}

export function ThemeToggle({ isOpen = true }: ThemeToggleProps) {
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
      className="flex items-center w-full h-8 rounded-[3px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={!isOpen ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
    >
      <span
        className="shrink-0 flex items-center justify-center"
        style={{ width: 'var(--sidebar-collapsed-width)' }}
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </span>
      <span
        className="text-[10px] font-medium font-mono uppercase tracking-[0.08em] whitespace-nowrap"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateX(0)' : 'translateX(-6px)',
          pointerEvents: isOpen ? 'auto' : 'none',
          transitionProperty: 'opacity, transform',
          transitionDuration: 'var(--sidebar-motion-duration)',
          transitionTimingFunction: 'var(--sidebar-motion-easing)',
        }}
        aria-hidden={!isOpen}
      >
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  )
}
