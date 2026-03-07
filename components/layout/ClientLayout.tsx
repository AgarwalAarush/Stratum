// components/layout/ClientLayout.tsx
'use client'

import { useState } from 'react'
import { NavPanel } from './NavPanel'
import { SettingsModal } from './SettingsModal'
import { MorningBriefModal } from '@/components/MorningBriefModal'

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const [isNavOpen, setIsNavOpen] = useState(true)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
            <NavPanel
                isOpen={isNavOpen}
                setIsOpen={setIsNavOpen}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />
            <main className="flex-1 min-w-0 flex flex-col w-full">
                {children}
            </main>
            <SettingsModal
                open={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
            <MorningBriefModal />
        </div>
    )
}
