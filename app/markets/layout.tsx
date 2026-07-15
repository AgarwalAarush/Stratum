import type { Metadata } from 'next'
import { MarketsShell } from '@/components/markets/MarketsShell'

export const metadata: Metadata = {
  title: 'Markets — Stratum',
  description: 'Private market intelligence, screening, and research workspace',
}

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return <MarketsShell>{children}</MarketsShell>
}
