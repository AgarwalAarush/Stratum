import { redirect } from 'next/navigation'

export default function MarketsScreenerPage() {
  redirect('/markets/explore?view=stocks')
}
