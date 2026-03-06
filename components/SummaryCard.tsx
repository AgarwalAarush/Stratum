'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStreamingSummary } from '@/hooks/useStreamingSummary'

interface SummaryCardProps {
  url: string
  cursorPos: { x: number; y: number }
  cardRef: React.RefObject<HTMLDivElement | null>
  onCardEnter: () => void
  onCardLeave: () => void
}

const MARGIN = 12
const OFFSET_X = 16
const OFFSET_Y = 16
const MAX_W = 360
const MAX_H = 240

export function SummaryCard({ url, cursorPos, cardRef, onCardEnter, onCardLeave }: SummaryCardProps) {
  const { text, isLoading, error } = useStreamingSummary(url)
  const [dims, setDims] = useState({ w: MAX_W, h: MAX_H })
  const measured = useRef(false)

  useEffect(() => {
    measured.current = false
  }, [url])

  useEffect(() => {
    if (!cardRef.current || measured.current) return
    const rect = cardRef.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setDims({ w: rect.width, h: rect.height })
      measured.current = true
    }
  }, [text, isLoading, error, cardRef])

  // Position: 16px right and 16px above cursor, clamped to viewport
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  let left = cursorPos.x + OFFSET_X
  let top = cursorPos.y - OFFSET_Y - dims.h

  // Clamp right edge
  if (left + dims.w > vw - MARGIN) {
    left = cursorPos.x - OFFSET_X - dims.w
  }
  // Clamp left edge
  if (left < MARGIN) {
    left = MARGIN
  }
  // Clamp top edge — if goes above viewport, show below cursor
  if (top < MARGIN) {
    top = cursorPos.y + OFFSET_Y
  }
  // Clamp bottom edge
  if (top + dims.h > vh - MARGIN) {
    top = vh - MARGIN - dims.h
  }

  return createPortal(
    <div
      ref={cardRef}
      onMouseEnter={onCardEnter}
      onMouseLeave={onCardLeave}
      className="fixed rounded-[3px] border border-[var(--border)] shadow-lg overflow-hidden"
      style={{
        left,
        top,
        maxWidth: MAX_W,
        maxHeight: MAX_H,
        zIndex: 50,
        backgroundColor: 'var(--surface)',
      }}
    >
      <div className="p-3 overflow-y-auto" style={{ maxHeight: MAX_H }}>
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
          <p className="text-[12px] text-[var(--text)] leading-[1.5] whitespace-pre-wrap">
            {text}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
