import { Suspense } from 'react'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import {
  TodayMarket,
  TodayPortfolio,
  TodaySkeleton,
} from '@/components/markets/today/Today'
import styles from '@/components/markets/today/Today.module.css'
export const dynamic = 'force-dynamic'
export default async function TodayPage() {
  const user = await requireAllowedMarketUser()
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Today</h1>
        <p>Your daily investment brief.</p>
      </header>
      <Suspense fallback={<TodaySkeleton label="Your next move" />}>
        <TodayPortfolio ownerId={user.id} />
      </Suspense>
      <Suspense fallback={<TodaySkeleton label="Market pulse" />}>
        <TodayMarket />
      </Suspense>
    </div>
  )
}
