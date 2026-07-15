// app/layout.tsx
import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google'
import '@/app/globals.css'
import { ThemeScript } from '@/components/ThemeScript'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Stratum',
  description: 'Technology intelligence and market analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text)] font-sans antialiased">{children}</body>
    </html>
  )
}
