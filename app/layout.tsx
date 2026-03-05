// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/app/globals.css'
import { ThemeScript } from '@/components/ThemeScript'
import { ClientLayout } from '@/components/layout/ClientLayout'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Stratum',
  description: 'Minimalist tech intelligence dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="light" className={inter.variable}>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-[var(--surface-2)] text-[var(--text)] font-sans antialiased">
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}
