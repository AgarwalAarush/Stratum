import type { MarketAsset, MarketSnapshot } from './types.ts'

export const EXPANDED_UNIVERSE_NAME = 'investable-us'
export const EXPANDED_UNIVERSE_TARGET = 1_500
export const MIN_EXPANDED_UNIVERSE_ASSETS = 900

export const MARKET_THEME_SYMBOLS = [
  // Semiconductors, foundries, equipment, memory, connectivity, and photonics.
  'NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'MRVL', 'ARM', 'TSM', 'ASML', 'AMAT',
  'LRCX', 'KLAC', 'TER', 'TXN', 'ADI', 'NXPI', 'MPWR', 'MCHP', 'MU', 'WDC',
  'STX', 'CRDO', 'ALAB', 'ACLS', 'COHR', 'LITE', 'MTSI', 'SITM', 'CAMT', 'FORM',
  'AEHR', 'AMBA', 'WOLF', 'QRVO', 'SWKS', 'LSCC', 'ON', 'PLAB',
  // Networking, servers, cooling, power delivery, and physical data centers.
  'ANET', 'CSCO', 'DELL', 'HPE', 'SMCI', 'VRT', 'ETN', 'PWR', 'CARR', 'JCI',
  'TT', 'NVT', 'MOD', 'CLS', 'FLEX', 'SANM', 'EQIX', 'DLR',
  // Cloud, data, applied AI, developer infrastructure, and enterprise software.
  'MSFT', 'GOOGL', 'AMZN', 'META', 'ORCL', 'IBM', 'PLTR', 'SNOW', 'DDOG', 'NET',
  'MDB', 'CFLT', 'ESTC', 'NOW', 'CRM', 'ADBE', 'APP', 'AI', 'PATH', 'SOUN',
  'BBAI', 'UPST', 'TEM', 'NBIS',
  // Cybersecurity.
  'CRWD', 'PANW', 'ZS', 'FTNT', 'OKTA', 'CYBR', 'S', 'TENB',
  // Power, nuclear, and compute infrastructure.
  'CEG', 'VST', 'NRG', 'GEV', 'BWXT', 'LEU', 'CCJ', 'SMR', 'OKLO', 'NNE',
  'IREN', 'CORZ', 'CLSK', 'WULF', 'CIFR',
  // Automation, autonomy, and space infrastructure.
  'TSLA', 'ISRG', 'SYM', 'ROK', 'MBLY', 'SERV', 'ASTS', 'RKLB',
] as const

const PRIMARY_EQUITY_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX'])
const EXCLUDED_SECURITY_NAME = new RegExp([
  '\\bwarrants?\\b',
  '\\brights?\\b',
  '\\bunits?\\b',
  '\\bpreferred\\b',
  '\\bacquisition corp(?:oration)?\\b',
  '\\bexchange traded\\b',
  '\\betf\\b',
  '\\bfund\\b',
  '\\bnotes? due\\b',
  '\\bdebentures?\\b',
].join('|'), 'i')

export interface ExpandedUniverseSelectionOptions {
  targetCount?: number
  minimumPrice?: number
  minimumDollarVolume?: number
}

export function isExpandedUniverseListing(asset: MarketAsset): boolean {
  return asset.active
    && asset.tradable
    && PRIMARY_EQUITY_EXCHANGES.has(asset.exchange.toUpperCase())
    && !EXCLUDED_SECURITY_NAME.test(asset.name)
}

export function selectExpandedUniverseAssets(
  assets: MarketAsset[],
  snapshots: MarketSnapshot[],
  requiredSymbols: Iterable<string>,
  options: ExpandedUniverseSelectionOptions = {},
): MarketAsset[] {
  const targetCount = options.targetCount ?? EXPANDED_UNIVERSE_TARGET
  const minimumPrice = options.minimumPrice ?? 2
  const minimumDollarVolume = options.minimumDollarVolume ?? 5_000_000
  const assetBySymbol = new Map(assets.map((asset) => [asset.symbol.toUpperCase(), asset]))
  const required = new Set([...requiredSymbols].map((symbol) => symbol.toUpperCase()))
  const selected: MarketAsset[] = []
  const selectedSymbols = new Set<string>()

  const add = (asset: MarketAsset | undefined) => {
    if (!asset || !asset.active || !asset.tradable || selectedSymbols.has(asset.symbol)) return
    selected.push(asset)
    selectedSymbols.add(asset.symbol)
  }

  for (const symbol of required) add(assetBySymbol.get(symbol))

  const ranked = snapshots
    .flatMap((snapshot) => {
      const asset = assetBySymbol.get(snapshot.symbol.toUpperCase())
      if (!asset || !isExpandedUniverseListing(asset)) return []
      const dollarVolume = snapshot.price * snapshot.volume
      if (snapshot.price < minimumPrice || dollarVolume < minimumDollarVolume) return []
      return [{ asset, dollarVolume }]
    })
    .sort((left, right) =>
      right.dollarVolume - left.dollarVolume
      || left.asset.symbol.localeCompare(right.asset.symbol))

  for (const item of ranked) {
    add(item.asset)
    if (selected.length >= Math.max(targetCount, required.size)) break
  }
  return selected
}
