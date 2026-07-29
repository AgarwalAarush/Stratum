'use client'

import { X } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function StockViewerModal({ children, symbol }: { children: React.ReactNode; symbol: string }) {
  const router = useRouter()

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') router.back()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [router])

  return (
    <div className="stock-viewer-modal-backdrop" role="presentation" onMouseDown={() => router.back()}>
      <section
        className="stock-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${symbol} stock viewer`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="stock-viewer-modal-close" onClick={() => router.back()} aria-label={`Close ${symbol} viewer`}>
          <X size={18} />
        </button>
        {children}
      </section>
    </div>
  )
}
