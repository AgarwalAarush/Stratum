import { contentHash, investmentDb } from './recommendations.ts'
const SERIES = [
  ['CPIAUCSL', 'Consumer prices'],
  ['PCEPI', 'PCE prices'],
  ['UNRATE', 'Unemployment'],
  ['FEDFUNDS', 'Policy rate'],
  ['DGS10', '10-year Treasury yield'],
  ['T10Y2Y', '10-year minus 2-year yield spread'],
] as const
/** Public FRED observations are current revisions. We record first availability
 * locally and never pretend this is an ALFRED historical information set. */
export async function captureInvestmentMacro(now = new Date()) {
  const db = investmentDb(),
    result = []
  for (const [id, label] of SERIES) {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${new Date(now.getTime() - 400 * 86400000).toISOString().slice(0, 10)}`
    const download = `https://fred.stlouisfed.org/graph/?id=${id}`
    // fredgraph.csv is the official no-key download endpoint.
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`FRED ${id} returned ${response.status}`)
    const text = await response.text(),
      observations = text
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .flatMap((line) => {
          const [date, raw] = line.split(',')
          const value = Number(raw)
          return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            raw &&
            raw !== '.' &&
            Number.isFinite(value) &&
            date <= now.toISOString().slice(0, 10)
            ? [{ date, value }]
            : []
        })
        .slice(-14)
    if (!observations.length)
      throw new Error(`FRED ${id} has no usable observations`)
    const content = {
      seriesId: id,
      label,
      observations,
      sourceUrl: download,
      requestUrl: url,
      publisher: 'Federal Reserve Bank of St. Louis',
      availability:
        'First captured here; current FRED vintage, not historical release-time evidence',
      publishedAt: null,
      units:
        id === 'UNRATE' ||
        id === 'FEDFUNDS' ||
        id === 'DGS10' ||
        id === 'T10Y2Y'
          ? 'percent'
          : 'index',
    }
    const hash = contentHash(content)
    const saved = await db
      .from('investment_macro_vintages')
      .upsert(
        {
          series_id: id,
          content_hash: hash,
          observed_at: now.toISOString(),
          content,
        },
        { onConflict: 'series_id,content_hash', ignoreDuplicates: true },
      )
    if (saved.error) throw new Error(saved.error.message)
    result.push({ seriesId: id, latest: observations.at(-1), hash })
  }
  return { series: result }
}
