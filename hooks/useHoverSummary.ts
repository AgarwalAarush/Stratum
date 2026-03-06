import { useState, useRef, useCallback, useEffect } from 'react'

interface HoverState {
  activeUrl: string | null
  cursorPos: { x: number; y: number }
  containerProps: {
    onMouseOver: (e: React.MouseEvent) => void
    onMouseOut: (e: React.MouseEvent) => void
    onMouseMove: (e: React.MouseEvent) => void
  }
  cardRef: React.RefObject<HTMLDivElement | null>
  onCardEnter: () => void
  onCardLeave: () => void
}

export function useHoverSummary(): HoverState {
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const graceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const inCard = useRef(false)
  const rafRef = useRef<number | null>(null)
  const isTouchDevice = useRef(false)

  useEffect(() => {
    isTouchDevice.current = window.matchMedia('(hover: none)').matches
  }, [])

  const clearTimers = useCallback(() => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current)
      hoverTimeout.current = null
    }
    if (graceTimeout.current) {
      clearTimeout(graceTimeout.current)
      graceTimeout.current = null
    }
  }, [])

  const onMouseOver = useCallback(
    (e: React.MouseEvent) => {
      if (isTouchDevice.current) return
      // Clear any grace period
      if (graceTimeout.current) {
        clearTimeout(graceTimeout.current)
        graceTimeout.current = null
      }

      const anchor = (e.target as HTMLElement).closest('a[data-summary-url]')
      if (!anchor) return

      const url = anchor.getAttribute('data-summary-url')
      if (!url) return

      // Clear existing hover timeout
      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current)
      }

      setCursorPos({ x: e.clientX, y: e.clientY })

      hoverTimeout.current = setTimeout(() => {
        setActiveUrl(url)
        hoverTimeout.current = null
      }, 2000)
    },
    [],
  )

  const onMouseOut = useCallback(
    (e: React.MouseEvent) => {
      if (isTouchDevice.current) return

      const anchor = (e.target as HTMLElement).closest('a[data-summary-url]')
      if (!anchor) {
        // Not leaving an anchor — ignore
        return
      }

      // Clear pending hover
      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current)
        hoverTimeout.current = null
      }

      // Grace period before closing card
      if (activeUrl) {
        graceTimeout.current = setTimeout(() => {
          if (!inCard.current) {
            setActiveUrl(null)
          }
          graceTimeout.current = null
        }, 500)
      }
    },
    [activeUrl],
  )

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isTouchDevice.current) return
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      setCursorPos({ x: e.clientX, y: e.clientY })
      rafRef.current = null
    })
  }, [])

  const onCardEnter = useCallback(() => {
    inCard.current = true
    if (graceTimeout.current) {
      clearTimeout(graceTimeout.current)
      graceTimeout.current = null
    }
  }, [])

  const onCardLeave = useCallback(() => {
    inCard.current = false
    setActiveUrl(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [clearTimers])

  return {
    activeUrl,
    cursorPos,
    containerProps: { onMouseOver, onMouseOut, onMouseMove },
    cardRef,
    onCardEnter,
    onCardLeave,
  }
}
