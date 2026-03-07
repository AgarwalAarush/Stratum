'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Database, Moon, Palette, Settings2, Shield, Sun, X } from 'lucide-react'
import { useThemeStore } from '@/store/theme'
import { useSettingsStore } from '@/store/settings'
import type { Theme } from '@/lib/types'

type SettingsTab = 'general' | 'appearance' | 'data'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [openExternalLinks, setOpenExternalLinks] = useState(true)
  const [confirmNavigation, setConfirmNavigation] = useState(false)
  const [compactDensity, setCompactDensity] = useState(false)
  const [safeMode, setSafeMode] = useState(true)
  const { theme, setTheme } = useThemeStore()
  const { devMode, setDevMode } = useSettingsStore()
  const [devPasswordInput, setDevPasswordInput] = useState('')
  const [showDevPassword, setShowDevPassword] = useState(false)
  const [devPasswordError, setDevPasswordError] = useState(false)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const tabButtonClass = (key: SettingsTab) => [
    'w-full flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer',
    key === tab
      ? 'bg-[var(--surface-2)] text-[var(--text)]'
      : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
  ].join(' ')

  const themeButtonClass = (value: Theme) => [
    'px-4 py-2.5 rounded-[10px] border text-[13px] font-medium transition-colors cursor-pointer',
    theme === value
      ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]'
      : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
  ].join(' ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <button
        onClick={onClose}
        className="absolute inset-0 bg-black/35 cursor-default"
        aria-label="Close settings"
      />

      <div className="relative w-full max-w-[900px] h-[min(700px,90vh)] bg-[var(--surface)] border border-[var(--border)] rounded-[20px] shadow-xl overflow-hidden flex">
        <aside className="w-[240px] bg-[var(--bg)] border-r border-[var(--border)] p-4 flex flex-col gap-2">
          <button className={tabButtonClass('general')} onClick={() => setTab('general')}>
            <Settings2 size={16} />
            General
          </button>
          <button className={tabButtonClass('appearance')} onClick={() => setTab('appearance')}>
            <Palette size={16} />
            Appearance
          </button>
          <button className={tabButtonClass('data')} onClick={() => setTab('data')}>
            <Database size={16} />
            Data controls
          </button>
        </aside>

        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border)]">
            <div>
              <h2 className="text-[20px] font-bold text-[var(--text)]">Settings</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">Barebones preferences for now</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              aria-label="Close settings modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
            {tab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text)] mb-2">Navigation</h3>
                  <p className="text-[12px] text-[var(--text-muted)]">Core behavior for links and context switching.</p>
                </div>
                <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text)]">Open links in new tab</p>
                    <p className="text-[12px] text-[var(--text-muted)]">Keep Stratum state while reading sources.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={openExternalLinks}
                    onChange={() => setOpenExternalLinks((value) => !value)}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </label>
                <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text)]">Confirm before navigation</p>
                    <p className="text-[12px] text-[var(--text-muted)]">Show a confirmation prompt for external jumps.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={confirmNavigation}
                    onChange={() => setConfirmNavigation((value) => !value)}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </label>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text)] mb-2">Theme</h3>
                  <p className="text-[12px] text-[var(--text-muted)]">Visual mode and density for better scanning.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className={themeButtonClass('light')} onClick={() => setTheme('light')}>
                    <Sun size={14} className="inline mr-2" />
                    Light
                  </button>
                  <button className={themeButtonClass('dark')} onClick={() => setTheme('dark')}>
                    <Moon size={14} className="inline mr-2" />
                    Dark
                  </button>
                </div>
                <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text)]">Compact density</p>
                    <p className="text-[12px] text-[var(--text-muted)]">Reduce card row height to fit more items.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={compactDensity}
                    onChange={() => setCompactDensity((value) => !value)}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </label>
              </div>
            )}

            {tab === 'data' && (
              <div className="space-y-6">
                {devMode && (
                  <div className="flex items-center gap-2 rounded-[10px] bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400">Developer mode active — overviews will regenerate on every page load</p>
                  </div>
                )}
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text)] mb-2">Data controls</h3>
                  <p className="text-[12px] text-[var(--text-muted)]">Baseline controls before full settings are added.</p>
                </div>
                <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text)]">Safe mode</p>
                    <p className="text-[12px] text-[var(--text-muted)]">Prefer conservative source filtering.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={safeMode}
                    onChange={() => setSafeMode((value) => !value)}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </label>
                <div className="rounded-[12px] border border-[var(--border)] px-4 py-3">
                  <p className="text-[13px] font-medium text-[var(--text)] flex items-center gap-2">
                    <Shield size={14} />
                    Storage
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">
                    Local preferences only. No cloud sync yet.
                  </p>
                </div>

                <div className="pt-4 border-t border-[var(--border)]">
                  <div className="mb-4">
                    <h3 className="text-[14px] font-semibold text-[var(--text)] mb-2">Developer</h3>
                    <p className="text-[12px] text-[var(--text-muted)]">Testing and debugging tools.</p>
                  </div>
                  <div className="rounded-[12px] border border-[var(--border)] px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-medium text-[var(--text)]">Developer Mode</p>
                        <p className="text-[12px] text-[var(--text-muted)]">Bypass cache and force-regenerate all overviews on page load.</p>
                      </div>
                      <button
                        onClick={() => {
                          if (devMode) {
                            setDevMode(false)
                            setShowDevPassword(false)
                          } else {
                            setShowDevPassword(true)
                            setDevPasswordInput('')
                            setDevPasswordError(false)
                          }
                        }}
                        className={[
                          'relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0',
                          devMode ? 'bg-[var(--accent)]' : 'bg-surface-2',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                            devMode ? 'left-5.5' : 'left-0.5',
                          ].join(' ')}
                        />
                      </button>
                    </div>
                    {showDevPassword && !devMode && (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={devPasswordInput}
                          onChange={(e) => {
                            setDevPasswordInput(e.target.value)
                            setDevPasswordError(false)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (devPasswordInput === 'abc') {
                                setDevMode(true)
                                setShowDevPassword(false)
                                setDevPasswordInput('')
                              } else {
                                setDevPasswordError(true)
                              }
                            }
                          }}
                          placeholder="Enter password"
                          className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                          autoFocus
                        />
                        {devPasswordError && (
                          <span className="text-[11px] text-red-500">Wrong password</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
