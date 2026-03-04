// store/theme.ts
'use client'
import { create } from 'zustand'
import type { Theme } from '@/lib/types'

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'dark',
  setTheme: (theme) => {
    set({ theme })
    document.documentElement.dataset.theme = theme
    localStorage.setItem('stratum-theme', theme)
    document.body.classList.add('theme-ready')
  },
  toggle: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
