'use client'

import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { X } from 'lucide-react'
import { useStreamingSummary } from '@/hooks/useStreamingSummary'

interface SummaryCardProps {
  url: string
  onClose: () => void
}

export function SummaryCard({ url, onClose }: SummaryCardProps) {
  const { text, title, isLoading, error } = useStreamingSummary(url)

  return createPortal(
    <div
      className="fixed border border-[var(--border)] shadow-[0_8px_32px_rgba(0,0,0,0.18)] overflow-hidden"
      style={{
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90vw',
        maxWidth: 480,
        maxHeight: 320,
        zIndex: 50,
        backgroundColor: 'var(--summary-card-bg, #ffffff)',
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 text-[var(--text-muted)] hover:text-red-500 transition-colors cursor-pointer"
        aria-label="Close summary"
      >
        <X size={14} />
      </button>
      <div className="p-3 pr-8 overflow-y-auto" style={{ maxHeight: 320 }}>
        {isLoading && !text ? (
          <div className="flex flex-col gap-2">
            <div className="h-3 rounded bg-black/8 dark:bg-white/10 animate-pulse" style={{ width: '90%' }} />
            <div className="h-3 rounded bg-black/8 dark:bg-white/10 animate-pulse" style={{ width: '75%' }} />
            <div className="h-3 rounded bg-black/8 dark:bg-white/10 animate-pulse" style={{ width: '50%' }} />
          </div>
        ) : error ? (
          <p className="font-mono text-[11px] text-[var(--text-muted)]">
            Summary unavailable for this source.
          </p>
        ) : (
          <>
            {title && (
              <h3 className="text-[13px] font-semibold text-[var(--text)] leading-[1.4] mb-2">
                {title}
              </h3>
            )}
            <div className="text-[14px] text-[var(--text)] leading-[1.5] summary-markdown">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
