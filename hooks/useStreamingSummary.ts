import { useState, useEffect, useRef } from 'react'

const summaryCache = new Map<string, string>()

export function useStreamingSummary(url: string | null) {
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!url) {
      setText('')
      setIsLoading(false)
      setError(null)
      return
    }

    // Check client cache
    const cached = summaryCache.get(url)
    if (cached) {
      setText(cached)
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setText('')
    setError(null)
    setIsLoading(true)

    ;(async () => {
      try {
        const res = await fetch(`/api/summary?url=${encodeURIComponent(url)}`, {
          signal: controller.signal,
        })
        if (!res.body) {
          setError('No response body')
          setIsLoading(false)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'chunk') {
                accumulated += event.text
                setText(accumulated)
              } else if (event.type === 'done') {
                const summary = event.summary ?? accumulated
                setText(summary)
                summaryCache.set(url, summary)
                setIsLoading(false)
              } else if (event.type === 'error') {
                setError(event.message ?? 'Summary unavailable')
                setIsLoading(false)
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }

        setIsLoading(false)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load summary')
          setIsLoading(false)
        }
      }
    })()

    return () => {
      controller.abort()
      abortRef.current = null
    }
  }, [url])

  return { text, isLoading, error }
}
