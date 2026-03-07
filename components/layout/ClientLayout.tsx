// components/layout/ClientLayout.tsx
'use client'

import { useEffect, useState } from 'react'
import { NavPanel } from './NavPanel'
import { SettingsModal } from './SettingsModal'
import { MorningBriefModal, MORNING_BRIEF_SEEN_KEY } from '@/components/MorningBriefModal'

// Brief is generated daily at 12:00 UTC. Returns that timestamp for today.
function getTodayGenerationTime() {
    const t = new Date()
    t.setUTCHours(12, 0, 0, 0)
    return t
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const [isNavOpen, setIsNavOpen] = useState(true)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isBriefOpen, setIsBriefOpen] = useState(false)

    useEffect(() => {
        if (window.innerWidth < 768) {
            setIsNavOpen(false)
        }
    }, [])

    useEffect(() => {
        const seen = localStorage.getItem(MORNING_BRIEF_SEEN_KEY)
        const generationTime = getTodayGenerationTime()
        const now = new Date()
        // Only auto-show if the brief has been generated (past 12 UTC) and not yet seen since then
        const seenAfterGeneration = seen && new Date(seen) >= generationTime
        if (now >= generationTime && !seenAfterGeneration) {
            setIsBriefOpen(true)
        }
    }, [])

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
            <NavPanel
                isOpen={isNavOpen}
                setIsOpen={setIsNavOpen}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenBrief={() => setIsBriefOpen(true)}
            />
            <main className="flex-1 min-w-0 flex flex-col w-full">
                {children}
            </main>
            <SettingsModal
                open={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
            <MorningBriefModal
                open={isBriefOpen}
                onClose={() => setIsBriefOpen(false)}
            />
        </div>
    )
}
