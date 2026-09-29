'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, type ComponentProps } from 'react'

type MarketsIntentLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
  href: string
}

export function MarketsIntentLink({
  href,
  onFocus,
  onMouseEnter,
  onTouchStart,
  ...props
}: MarketsIntentLinkProps) {
  const router = useRouter()
  const prefetched = useRef({ href: '', at: 0 })
  const prefetch = () => {
    if (prefetched.current.href === href && Date.now() - prefetched.current.at < 30_000) return
    prefetched.current = { href, at: Date.now() }
    router.prefetch(href)
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onFocus={(event) => {
        onFocus?.(event)
        prefetch()
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        prefetch()
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        prefetch()
      }}
    />
  )
}
