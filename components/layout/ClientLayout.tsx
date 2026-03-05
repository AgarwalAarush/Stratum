// components/layout/ClientLayout.tsx
'use client'

import { useState } from 'react'
import { NavPanel } from './NavPanel'

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const [isNavOpen, setIsNavOpen] = useState(true)

    return (
        <div className="flex bg-[var(--bg)] min-h-screen">
            <NavPanel isOpen={isNavOpen} setIsOpen={setIsNavOpen} />
            <main className="flex-1 min-w-0 flex flex-col w-full">
                {children}
            </main>
        </div>
    )
}
