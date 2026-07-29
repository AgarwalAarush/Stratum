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
  ...props
}: MarketsIntentLinkProps) {
  const router = useRouter()
  const prefetched = useRef(false)
  const prefetch = () => {
    if (prefetched.current) return
    prefetched.current = true
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
    />
  )
}
