import type { MarketOverviewResponse } from './types.ts'

export const ILLUSTRATIVE_MARKET_OVERVIEW: MarketOverviewResponse = {
  state: {
    regime: 'Risk-On, narrowing breadth',
    confidence: 72,
    dataAsOf: '2026-07-15T20:00:00.000Z',
  },
  memo: {
    changes: [
      {
        id: 'leadership',
        body: 'Mega-cap leadership resumed as NVDA +3.1% and MSFT +1.4% lifted the Nasdaq 100, while the equal-weight S&P 500 lagged the cap-weighted index by 0.9pp.',
        source: 'FactSet',
        sourceTime: '4:00 PM ET',
      },
      {
        id: 'rates',
        body: 'Treasury yields tracked lower in a bull-flattening move: the 2s10s spread compressed to -31bps as the front end fell on softer data, signaling a more cautious growth read.',
        source: 'Tradeweb',
        sourceTime: '3:58 PM ET',
      },
      {
        id: 'breadth',
        body: 'Breadth narrowed: 38% of S&P 500 stocks finished above their 50-day average, down from 46% yesterday, with gains concentrated in Technology and Communication Services.',
        source: 'FactSet',
        sourceTime: '3:55 PM ET',
      },
    ],
    sectorImplications: [
      { direction: 'up', text: 'Technology, Comm Services: leadership intact' },
      { direction: 'up', text: 'Industrials: selective strength' },
      { direction: 'down', text: 'Real Estate, Utilities: rate sensitivity' },
    ],
    catalysts: [
      'Next week: CPI (Wed), PPI (Thu), Retail Sales (Fri)',
      'Earnings: NVDA (5/22), CRM (5/22), LOW (5/21)',
      'FOMC minutes (5/22)',
    ],
    risks: ['Sticky inflation re-acceleration', 'Geopolitical escalation', 'Liquidity conditions tightening'],
    watchItems: ['10Y yield at 4.30% resistance', 'VIX term structure (backwardation)', 'USD strength and commodities'],
    generatedAt: '2026-07-15T20:00:00.000Z',
  },
  instruments: [
    { id: 'spx', label: 'S&P 500', value: '5,278.44', change: '+0.62%', direction: 'up' },
    { id: 'ndx', label: 'Nasdaq 100', value: '18,524.11', change: '+0.81%', direction: 'up' },
    { id: 'rut', label: 'Russell 2000', value: '2,067.38', change: '-0.27%', direction: 'down' },
    { id: 'vix', label: 'VIX', value: '13.82', change: '-0.36', direction: 'up' },
    { id: 'us10y', label: 'US 10Y', value: '4.27%', change: '-0.03', direction: 'down' },
    { id: 'dxy', label: 'DXY', value: '104.32', change: '+0.11%', direction: 'up' },
    { id: 'wti', label: 'WTI', value: '78.24', change: '+0.54%', direction: 'up' },
  ],
  evidence: [
    { id: 'factset', source: 'FactSet Research Systems', publishedAt: '4:00 PM ET', url: 'https://www.factset.com/' },
    { id: 'tradeweb', source: 'Tradeweb Markets', publishedAt: '3:58 PM ET', url: 'https://www.tradeweb.com/' },
    { id: 'cme', source: 'CME Group', publishedAt: '3:57 PM ET', url: 'https://www.cmegroup.com/' },
    { id: 'bloomberg', source: 'Bloomberg News', publishedAt: '3:51 PM ET', url: 'https://www.bloomberg.com/' },
    { id: 'morgan-stanley', source: 'Morgan Stanley Research', publishedAt: '3:45 PM ET', url: 'https://www.morganstanley.com/what-we-do/research' },
    { id: 'gs', source: 'GS Economics', publishedAt: '3:32 PM ET', url: 'https://www.goldmansachs.com/insights/' },
    { id: 'lseg', source: 'LSEG Workspace', publishedAt: '3:28 PM ET', url: 'https://www.lseg.com/' },
  ],
  feed: 'illustrative',
  dataAsOf: '2026-07-15T20:00:00.000Z',
  generatedAt: '2026-07-15T20:00:00.000Z',
  stale: false,
}
