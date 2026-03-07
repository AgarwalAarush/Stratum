import { useState, useEffect, useRef } from 'react'

const summaryCache = new Map<string, { text: string; title: string }>()

export function useStreamingSummary(url: string | null) {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!url) {
      setText('')
      setTitle('')
      setIsLoading(false)
      setError(null)
      return
    }

    // Check client cache
    const cached = summaryCache.get(url)
    if (cached) {
      setText(cached.text)
      setTitle(cached.title)
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setText('')
    setTitle('')
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
        let articleTitle = ''

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
              if (event.type === 'meta') {
                articleTitle = event.title ?? ''
                setTitle(articleTitle)
              } else if (event.type === 'chunk') {
                accumulated += event.text
              } else if (event.type === 'done') {
                const summary = event.summary ?? accumulated
                if (event.title) articleTitle = event.title
                setText(summary)
                setTitle(articleTitle)
                summaryCache.set(url, { text: summary, title: articleTitle })
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

  return { text, title, isLoading, error }
}
