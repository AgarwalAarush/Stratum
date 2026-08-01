import type { Metadata } from 'next'
import { MarketsShell } from '@/components/markets/MarketsShell'

export const metadata: Metadata = {
  title: 'Markets — Stratum',
  description: 'Private market intelligence, screening, and research workspace',
  robots: { index: false, follow: false },
}

export default function MarketsLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  // proxy.ts authenticates the whole Markets route tree before it reaches this
  // layout. Keeping the shell free of request-bound reads lets loading.tsx
  // stream immediately, while personalized pages still verify the user before
  // fetching owner-specific data.
  return <MarketsShell>{children}{modal}</MarketsShell>
}
