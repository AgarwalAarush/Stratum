// components/layout/ClientLayout.tsx
'use client'

import { useEffect, useState } from 'react'
import { NavPanel } from './NavPanel'
import { SettingsModal } from './SettingsModal'
import { MorningBriefModal } from '@/components/MorningBriefModal'

const BRIEF_SEEN_KEY = 'stratum:morning-brief-seen'

function getTodayDate() {
    return new Date().toISOString().slice(0, 10)
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
        const seen = localStorage.getItem(BRIEF_SEEN_KEY)
        if (seen !== getTodayDate()) {
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
