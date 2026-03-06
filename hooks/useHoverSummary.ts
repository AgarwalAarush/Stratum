import { useState, useRef, useCallback, useEffect } from 'react'

interface HoverState {
  activeUrl: string | null
  close: () => void
  containerProps: {
    onMouseOver: (e: React.MouseEvent) => void
    onMouseOut: (e: React.MouseEvent) => void
  }
}

export function useHoverSummary(): HoverState {
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const graceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const close = useCallback(() => setActiveUrl(null), [])

  const onMouseOver = useCallback(
    (e: React.MouseEvent) => {
      if (isTouchDevice.current) return
      if (graceTimeout.current) {
        clearTimeout(graceTimeout.current)
        graceTimeout.current = null
      }

      const anchor = (e.target as HTMLElement).closest('a[data-summary-url]')
      if (!anchor) return

      const url = anchor.getAttribute('data-summary-url')
      if (!url) return

      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current)
      }

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
      if (!anchor) return

      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current)
        hoverTimeout.current = null
      }

      if (activeUrl) {
        graceTimeout.current = setTimeout(() => {
          setActiveUrl(null)
          graceTimeout.current = null
        }, 300)
      }
    },
    [activeUrl],
  )

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  return {
    activeUrl,
    close,
    containerProps: { onMouseOver, onMouseOut },
  }
}
