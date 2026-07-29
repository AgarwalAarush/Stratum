import type { Metadata } from 'next'
import { MarketsShell } from '@/components/markets/MarketsShell'
import { requireAllowedMarketUser } from '@/lib/auth/supabase-server'
import { fetchLatestSnapshotMeta } from '@/lib/server/markets-repository'

export const metadata: Metadata = {
  title: 'Markets — Stratum',
  description: 'Private market intelligence, screening, and research workspace',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function MarketsLayout({ children }: { children: React.ReactNode }) {
  await requireAllowedMarketUser()
  const snapshot = await fetchLatestSnapshotMeta()
  return <MarketsShell dataAsOf={snapshot?.data_as_of}>{children}</MarketsShell>
}
