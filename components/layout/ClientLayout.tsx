// components/layout/ClientLayout.tsx
'use client'

import { useState } from 'react'
import { NavPanel } from './NavPanel'

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const [isNavOpen, setIsNavOpen] = useState(true)

    return (
        <div className="flex bg-[var(--surface-2)] min-h-screen items-center justify-center p-4 sm:p-8">
            <div className="flex flex-row w-full max-w-[1440px] h-[90vh] max-h-[1000px] border border-[var(--border)] rounded-[24px] shadow-2xl overflow-hidden bg-[var(--bg)]">
                <NavPanel isOpen={isNavOpen} setIsOpen={setIsNavOpen} />
                <main className="flex-1 min-w-0 flex flex-col overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
