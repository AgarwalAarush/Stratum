import { redirect } from 'next/navigation'

export default function MarketsWatchlistsPage() {
  redirect('/markets/explore?view=watchlists')
}
