'use client'
import { create } from 'zustand'

interface SettingsStore {
  devMode: boolean
  setDevMode: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  devMode:
    typeof window !== 'undefined'
      ? localStorage.getItem('stratum-dev-mode') === 'true'
      : false,
  setDevMode: (enabled) => {
    set({ devMode: enabled })
    localStorage.setItem('stratum-dev-mode', String(enabled))
  },
}))
