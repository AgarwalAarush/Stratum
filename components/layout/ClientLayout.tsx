// components/layout/ClientLayout.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowClockwise, Gear, List, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useSWRConfig } from 'swr'
import { SettingsModal } from './SettingsModal'
import { MorningBriefModal, MORNING_BRIEF_SEEN_KEY } from '@/components/MorningBriefModal'
import { IntelligenceBriefingsModal } from '@/components/IntelligenceBriefingsModal'

// Brief is generated daily at 12:00 UTC. Returns that timestamp for today.
function getTodayGenerationTime() {
    const t = new Date()
    t.setUTCHours(12, 0, 0, 0)
    return t
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { mutate } = useSWRConfig()
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isBriefOpen, setIsBriefOpen] = useState(false)
    const [isIntelligenceBriefingsOpen, setIsIntelligenceBriefingsOpen] = useState(false)
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)

    useEffect(() => {
        const seen = localStorage.getItem(MORNING_BRIEF_SEEN_KEY)
        const generationTime = getTodayGenerationTime()
        const now = new Date()
        // Only auto-show if the brief has been generated (past 12 UTC) and not yet seen since then
        const seenAfterGeneration = seen && new Date(seen) >= generationTime
        if (now >= generationTime && !seenAfterGeneration) {
            queueMicrotask(() => setIsBriefOpen(true))
        }
    }, [])

    const refresh = async () => {
        setIsRefreshing(true)
        await mutate(
            (key) => typeof key === 'string' && (key.startsWith('scope:') || key.startsWith('overview:')),
            undefined,
            { revalidate: true },
        )
        router.refresh()
        window.setTimeout(() => setIsRefreshing(false), 650)
    }

    const aiResearchActive = pathname === '/ai-research'
    const globalNewsActive = pathname === '/global-news'

    return (
        <div className="intelligence-shell min-h-[100dvh]">
            <header className="intelligence-header">
                <Link href="/ai-research" className="intelligence-wordmark" aria-label="Stratum Intelligence home">
                    STRATUM
                </Link>

                <nav className="intelligence-mode-switch" aria-label="Product mode">
                    <Link href="/ai-research" className="intelligence-mode-link intelligence-mode-link-active" aria-current="page">
                        Intelligence
                    </Link>
                    <span aria-hidden="true" className="intelligence-mode-divider" />
                    <Link href="/markets" className="intelligence-mode-link">
                        Markets
                    </Link>
                </nav>

                <div className="intelligence-status">
                    <button type="button" className="intelligence-icon-button" onClick={() => setIsSettingsOpen(true)} aria-label="Open settings">
                        <Gear size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className="intelligence-icon-button" onClick={refresh} aria-label="Refresh intelligence sources">
                        <ArrowClockwise size={17} className={isRefreshing ? 'intelligence-refreshing' : ''} aria-hidden="true" />
                    </button>
                    <span className="intelligence-status-dot" aria-hidden="true" />
                    <span className="intelligence-status-copy">Updated just now</span>
                    <button
                        type="button"
                        className="intelligence-mobile-menu-button"
                        onClick={() => setIsMobileNavOpen((value) => !value)}
                        aria-expanded={isMobileNavOpen}
                        aria-controls="intelligence-navigation"
                        aria-label={isMobileNavOpen ? 'Close Intelligence navigation' : 'Open Intelligence navigation'}
                    >
                        {isMobileNavOpen ? <X size={18} /> : <List size={19} />}
                    </button>
                </div>
            </header>

            <nav
                id="intelligence-navigation"
                aria-label="Intelligence"
                className={`intelligence-subnav ${isMobileNavOpen ? 'intelligence-subnav-open' : ''}`}
            >
                <button type="button" className="intelligence-subnav-link" onClick={() => { setIsBriefOpen(true); setIsMobileNavOpen(false) }}>
                    Morning Brief
                </button>
                <Link
                    href="/ai-research"
                    aria-current={aiResearchActive ? 'page' : undefined}
                    className={`intelligence-subnav-link ${aiResearchActive ? 'intelligence-subnav-link-active' : ''}`}
                    onClick={() => setIsMobileNavOpen(false)}
                >
                    AI Research
                </Link>
                <Link
                    href="/global-news"
                    aria-current={globalNewsActive ? 'page' : undefined}
                    className={`intelligence-subnav-link ${globalNewsActive ? 'intelligence-subnav-link-active' : ''}`}
                    onClick={() => setIsMobileNavOpen(false)}
                >
                    Global News
                </Link>
                <button type="button" className="intelligence-subnav-link" onClick={() => { setIsIntelligenceBriefingsOpen(true); setIsMobileNavOpen(false) }}>
                    Weekly Briefs
                </button>
            </nav>

            <main className="intelligence-main">{children}</main>
            <SettingsModal
                open={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
            <MorningBriefModal
                open={isBriefOpen}
                onClose={() => setIsBriefOpen(false)}
            />
            <IntelligenceBriefingsModal
                open={isIntelligenceBriefingsOpen}
                onClose={() => setIsIntelligenceBriefingsOpen(false)}
            />
        </div>
    )
}
