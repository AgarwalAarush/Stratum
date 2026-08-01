import type { ScreenerRow } from './types.ts'

interface BaseScreenerRow {
  symbol: string
  company: string
  price: number
  dailyChange: number
  gap: number
  volume: number
  relativeVolume: number
  fiftyDayAverage: number
  fiftyTwoWeekPosition: number
  exchange: string
}

const BASE_ROWS: BaseScreenerRow[] = [
  { symbol: 'NVDA', company: 'NVIDIA Corporation', price: 1124.35, dailyChange: 4.62, gap: 3.21, volume: 68.4, relativeVolume: 2.68, fiftyDayAverage: 987.41, fiftyTwoWeekPosition: 88, exchange: 'NASDAQ' },
  { symbol: 'PLTR', company: 'Palantir Technologies Inc.', price: 28.71, dailyChange: 6.83, gap: 4.12, volume: 155.2, relativeVolume: 3.42, fiftyDayAverage: 24.13, fiftyTwoWeekPosition: 76, exchange: 'NYSE' },
  { symbol: 'AVGO', company: 'Broadcom Inc.', price: 1643.12, dailyChange: 3.26, gap: 2.08, volume: 18.6, relativeVolume: 2.11, fiftyDayAverage: 1498.77, fiftyTwoWeekPosition: 81, exchange: 'NASDAQ' },
  { symbol: 'AMD', company: 'Advanced Micro Devices Inc.', price: 178.34, dailyChange: 4.91, gap: 3.15, volume: 63.1, relativeVolume: 2.34, fiftyDayAverage: 156.08, fiftyTwoWeekPosition: 69, exchange: 'NASDAQ' },
  { symbol: 'COIN', company: 'Coinbase Global Inc.', price: 215.87, dailyChange: 5.72, gap: 2.93, volume: 29.8, relativeVolume: 2.07, fiftyDayAverage: 188.92, fiftyTwoWeekPosition: 74, exchange: 'NASDAQ' },
  { symbol: 'HOOD', company: 'Robinhood Markets Inc.', price: 22.48, dailyChange: 4.37, gap: 2.61, volume: 76.9, relativeVolume: 2.19, fiftyDayAverage: 19.41, fiftyTwoWeekPosition: 66, exchange: 'NASDAQ' },
  { symbol: 'CRWD', company: 'CrowdStrike Holdings Inc.', price: 337.91, dailyChange: 3.58, gap: 2.12, volume: 9.7, relativeVolume: 1.89, fiftyDayAverage: 312.44, fiftyTwoWeekPosition: 71, exchange: 'NASDAQ' },
  { symbol: 'UBER', company: 'Uber Technologies Inc.', price: 76.23, dailyChange: 3.11, gap: 2.05, volume: 26.3, relativeVolume: 1.76, fiftyDayAverage: 69.58, fiftyTwoWeekPosition: 63, exchange: 'NYSE' },
  { symbol: 'DKNG', company: 'DraftKings Inc.', price: 49.62, dailyChange: 4.28, gap: 2.78, volume: 15.4, relativeVolume: 1.71, fiftyDayAverage: 44.17, fiftyTwoWeekPosition: 59, exchange: 'NASDAQ' },
  { symbol: 'RDDT', company: 'Reddit, Inc.', price: 54.13, dailyChange: 3.77, gap: 2.31, volume: 14.2, relativeVolume: 1.63, fiftyDayAverage: 48.31, fiftyTwoWeekPosition: 68, exchange: 'NYSE' },
  { symbol: 'META', company: 'Meta Platforms, Inc.', price: 512.67, dailyChange: 2.84, gap: 1.77, volume: 22.7, relativeVolume: 1.58, fiftyDayAverage: 476.19, fiftyTwoWeekPosition: 86, exchange: 'NASDAQ' },
  { symbol: 'AMZN', company: 'Amazon.com, Inc.', price: 189.44, dailyChange: 2.63, gap: 1.91, volume: 51.8, relativeVolume: 1.69, fiftyDayAverage: 177.26, fiftyTwoWeekPosition: 83, exchange: 'NASDAQ' },
  { symbol: 'GOOGL', company: 'Alphabet Inc.', price: 176.28, dailyChange: 2.41, gap: 1.62, volume: 31.6, relativeVolume: 1.55, fiftyDayAverage: 165.42, fiftyTwoWeekPosition: 79, exchange: 'NASDAQ' },
  { symbol: 'MSFT', company: 'Microsoft Corporation', price: 429.12, dailyChange: 2.18, gap: 1.39, volume: 24.9, relativeVolume: 1.52, fiftyDayAverage: 411.73, fiftyTwoWeekPosition: 84, exchange: 'NASDAQ' },
  { symbol: 'AAPL', company: 'Apple Inc.', price: 192.86, dailyChange: 1.82, gap: 1.04, volume: 58.5, relativeVolume: 1.48, fiftyDayAverage: 181.55, fiftyTwoWeekPosition: 73, exchange: 'NASDAQ' },
  { symbol: 'TSLA', company: 'Tesla, Inc.', price: 188.74, dailyChange: 5.36, gap: 3.84, volume: 112.6, relativeVolume: 2.77, fiftyDayAverage: 174.38, fiftyTwoWeekPosition: 52, exchange: 'NASDAQ' },
  { symbol: 'MU', company: 'Micron Technology, Inc.', price: 128.32, dailyChange: 4.14, gap: 2.67, volume: 34.8, relativeVolume: 2.31, fiftyDayAverage: 113.97, fiftyTwoWeekPosition: 91, exchange: 'NASDAQ' },
  { symbol: 'ARM', company: 'Arm Holdings plc', price: 121.67, dailyChange: 5.08, gap: 3.42, volume: 18.9, relativeVolume: 2.56, fiftyDayAverage: 106.21, fiftyTwoWeekPosition: 82, exchange: 'NASDAQ' },
  { symbol: 'SMCI', company: 'Super Micro Computer, Inc.', price: 894.22, dailyChange: 6.21, gap: 4.73, volume: 27.5, relativeVolume: 3.08, fiftyDayAverage: 792.18, fiftyTwoWeekPosition: 77, exchange: 'NASDAQ' },
  { symbol: 'TSM', company: 'Taiwan Semiconductor Manufacturing Co.', price: 151.38, dailyChange: 3.49, gap: 2.19, volume: 25.1, relativeVolume: 1.94, fiftyDayAverage: 139.74, fiftyTwoWeekPosition: 89, exchange: 'NYSE' },
  { symbol: 'NFLX', company: 'Netflix, Inc.', price: 647.83, dailyChange: 2.94, gap: 1.86, volume: 7.8, relativeVolume: 1.61, fiftyDayAverage: 612.09, fiftyTwoWeekPosition: 87, exchange: 'NASDAQ' },
  { symbol: 'SHOP', company: 'Shopify Inc.', price: 68.42, dailyChange: 4.45, gap: 2.88, volume: 16.5, relativeVolume: 2.03, fiftyDayAverage: 63.11, fiftyTwoWeekPosition: 61, exchange: 'NYSE' },
  { symbol: 'CAVA', company: 'CAVA Group, Inc.', price: 84.16, dailyChange: 7.12, gap: 5.03, volume: 8.9, relativeVolume: 3.64, fiftyDayAverage: 72.47, fiftyTwoWeekPosition: 94, exchange: 'NYSE' },
  { symbol: 'APP', company: 'AppLovin Corporation', price: 83.55, dailyChange: 5.81, gap: 3.97, volume: 11.3, relativeVolume: 2.92, fiftyDayAverage: 71.92, fiftyTwoWeekPosition: 92, exchange: 'NASDAQ' },
  { symbol: 'SOFI', company: 'SoFi Technologies, Inc.', price: 8.14, dailyChange: 3.87, gap: 2.29, volume: 48.2, relativeVolume: 1.87, fiftyDayAverage: 7.66, fiftyTwoWeekPosition: 44, exchange: 'NASDAQ' },
  { symbol: 'RBLX', company: 'Roblox Corporation', price: 41.26, dailyChange: 4.03, gap: 2.54, volume: 13.7, relativeVolume: 1.98, fiftyDayAverage: 37.84, fiftyTwoWeekPosition: 58, exchange: 'NYSE' },
  { symbol: 'SNOW', company: 'Snowflake Inc.', price: 168.92, dailyChange: 3.35, gap: 2.11, volume: 9.4, relativeVolume: 1.82, fiftyDayAverage: 158.27, fiftyTwoWeekPosition: 56, exchange: 'NYSE' },
  { symbol: 'NET', company: 'Cloudflare, Inc.', price: 92.48, dailyChange: 3.91, gap: 2.46, volume: 6.8, relativeVolume: 1.93, fiftyDayAverage: 84.16, fiftyTwoWeekPosition: 72, exchange: 'NYSE' },
  { symbol: 'DDOG', company: 'Datadog, Inc.', price: 126.73, dailyChange: 3.18, gap: 1.98, volume: 5.6, relativeVolume: 1.74, fiftyDayAverage: 117.09, fiftyTwoWeekPosition: 67, exchange: 'NASDAQ' },
  { symbol: 'MDB', company: 'MongoDB, Inc.', price: 384.17, dailyChange: 4.56, gap: 2.91, volume: 3.2, relativeVolume: 2.14, fiftyDayAverage: 352.64, fiftyTwoWeekPosition: 64, exchange: 'NASDAQ' },
  { symbol: 'ANET', company: 'Arista Networks, Inc.', price: 318.65, dailyChange: 3.72, gap: 2.22, volume: 4.9, relativeVolume: 1.88, fiftyDayAverage: 291.38, fiftyTwoWeekPosition: 93, exchange: 'NYSE' },
  { symbol: 'PANW', company: 'Palo Alto Networks, Inc.', price: 307.82, dailyChange: 2.76, gap: 1.71, volume: 6.1, relativeVolume: 1.59, fiftyDayAverage: 289.11, fiftyTwoWeekPosition: 75, exchange: 'NASDAQ' },
]

function makeRange(seed: number): number[] {
  const values: number[] = []
  let value = 42 + (seed % 7)

  for (let index = 0; index < 18; index += 1) {
    value += ((seed * 11 + index * 7) % 9) - 3
    values.push(value + index * 1.35)
  }

  return values
}

const TAXONOMY_BY_SYMBOL: Record<string, { sector: string; subIndustry: string }> = {
  NVDA: { sector: 'Information Technology', subIndustry: 'Semiconductors' },
  AVGO: { sector: 'Information Technology', subIndustry: 'Semiconductors' },
  AMD: { sector: 'Information Technology', subIndustry: 'Semiconductors' },
  MU: { sector: 'Information Technology', subIndustry: 'Semiconductors' },
  ARM: { sector: 'Information Technology', subIndustry: 'Semiconductors' },
  ANET: { sector: 'Information Technology', subIndustry: 'Communications Equipment' },
  PANW: { sector: 'Information Technology', subIndustry: 'Systems Software' },
  CRWD: { sector: 'Information Technology', subIndustry: 'Systems Software' },
  MSFT: { sector: 'Information Technology', subIndustry: 'Systems Software' },
  AAPL: { sector: 'Information Technology', subIndustry: 'Technology Hardware, Storage & Peripherals' },
  META: { sector: 'Communication Services', subIndustry: 'Interactive Media & Services' },
  GOOGL: { sector: 'Communication Services', subIndustry: 'Interactive Media & Services' },
  NFLX: { sector: 'Communication Services', subIndustry: 'Movies & Entertainment' },
  AMZN: { sector: 'Consumer Discretionary', subIndustry: 'Broadline Retail' },
  TSLA: { sector: 'Consumer Discretionary', subIndustry: 'Automobile Manufacturers' },
  CAVA: { sector: 'Consumer Discretionary', subIndustry: 'Restaurants' },
  DKNG: { sector: 'Consumer Discretionary', subIndustry: 'Casinos & Gaming' },
  COIN: { sector: 'Financials', subIndustry: 'Financial Exchanges & Data' },
  HOOD: { sector: 'Financials', subIndustry: 'Investment Banking & Brokerage' },
}

export const ILLUSTRATIVE_SCREENER_ROWS: ScreenerRow[] = BASE_ROWS.map((row, index) => ({
  ...row,
  return5d: row.dailyChange * 1.8,
  return30d: row.dailyChange * 4.2,
  return90d: row.dailyChange * 7.4,
  return180d: row.dailyChange * 10.8,
  returnYtd: row.dailyChange * 8.6,
  return1y: row.dailyChange * 17.2,
  volume: row.volume * 1_000_000,
  range: makeRange(index + 3),
  sector: TAXONOMY_BY_SYMBOL[row.symbol]?.sector ?? 'Unclassified',
  subIndustry: TAXONOMY_BY_SYMBOL[row.symbol]?.subIndustry ?? 'Unclassified',
  tradable: true,
  asOf: '2026-07-15T20:00:00.000Z',
}))
