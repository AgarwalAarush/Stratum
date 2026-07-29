import { redirect } from 'next/navigation'

export default function MarketsWatchlistsPage() {
  redirect('/markets/portfolio?view=watchlists')
}
