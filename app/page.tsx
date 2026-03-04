// app/page.tsx
import { redirect } from 'next/navigation'
import { DEFAULT_SCOPE_ID } from '@/lib/scopes'

export default function RootPage() {
  redirect(`/${DEFAULT_SCOPE_ID}`)
}
