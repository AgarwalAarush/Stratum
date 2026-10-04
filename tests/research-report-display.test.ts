import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement, type ComponentType, type ReactNode } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseHTML } from 'linkedom'
import ts from 'typescript'
import * as presentation from '../lib/markets/research-presentation.ts'
import { formatMarketDate } from '../lib/markets/format-date.ts'
import type { ResearchAdvice as Advice } from '../lib/markets/research-advice.ts'
import type { EtfResearchNote, EtfResearchPacket, StockViewerData } from '../lib/markets/types.ts'
import { currentAdvice } from './fixtures/research-advice-v2.ts'

// Compile the production TSX for Node's test runner. Only unrelated Next/client
// widgets are replaced; date formatting and Markdown rendering run unchanged.
async function component<T>(path: string, bindings: Record<string, unknown>): Promise<T> {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const componentModule = { exports: {} }
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name === 'react/jsx-runtime') return jsxRuntime
    assert.ok(name in bindings, `Unexpected component dependency: ${name}`)
    return bindings[name]
  }, componentModule, componentModule.exports)
  return componentModule.exports as T
}

const { ResearchAdvice } = await component<{ ResearchAdvice: ComponentType<{ advice?: Advice | null }> }>(
  '../components/markets/ResearchAdvice.tsx', {
    'react-markdown': { default: ReactMarkdown }, 'remark-gfm': { default: remarkGfm },
    '@/lib/markets/research-presentation': presentation,
  },
)
const { EtfResearchReport } = await component<{ EtfResearchReport: ComponentType<{ stock: StockViewerData; packet: EtfResearchPacket | null; research: EtfResearchNote | null }> }>(
  '../components/markets/EtfResearchReport.tsx', {
    '@/components/markets/ResearchAdvice': { ResearchAdvice },
    'next/link': { default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) },
    'react-markdown': { default: ReactMarkdown }, 'remark-gfm': { default: remarkGfm },
    '@/components/markets/InteractivePriceChart': { InteractivePriceChart: () => null },
    '@/lib/markets/format-date': { formatMarketDate }, '@/lib/markets/research-presentation': presentation,
    './ResearchActionButton': { ResearchActionButton: () => null }, './ResearchEvidenceToggle': { ResearchEvidenceToggle: () => null },
  },
)

const stock = { company: 'Reaves Utilities ETF', symbol: 'UTES', exchange: 'NYSE', price: 100, dailyChange: 0, dataAsOf: '2026-10-01T20:00:00Z', history: [] } as unknown as StockViewerData
const research = { status: 'complete', version: 1, confidence: 70, advice: null, formalRating: 'HOLD', entryAction: 'wait', investmentThesis: 'Fixture thesis', keyDebate: 'Fixture debate', fastestKillSignal: 'Fixture signal', sections: [] } as unknown as EtfResearchNote
const packet = { version: 1, dataAsOf: '2026-10-01T20:00:00Z', issuer: 'Virtus', holdings: [], holdingsCount: 19, priceHistory: { return30d: null },
  evidenceQuality: { checkedAt: '2026-10-04T05:00:00Z', missing: [], coveredWeight: 1.0002, priceAsOf: '2026-10-01T20:00:00Z', holdingsAsOf: '2026-10-02T00:00:00Z' },
} as unknown as EtfResearchPacket
const report = (value: EtfResearchPacket | null) => parseHTML(renderToStaticMarkup(createElement(EtfResearchReport, { stock, packet: value, research }))).document

test('ETF header and holdings table use the explicit issuer calendar date rather than the earlier market timestamp', () => {
  const document = report(packet)
  const header = document.querySelector('.equity-research-header')!.textContent!
  const effective = document.querySelector('.etf-research-holdings header span')!.textContent!
  assert.match(header, /issuer-held portfolio data as of Oct 2, 2026/)
  assert.equal(effective, 'Effective Oct 2, 2026')
  assert.ok(!header.includes('Oct 1, 2026'))
  assert.equal(packet.dataAsOf, '2026-10-01T20:00:00Z')
})

test('missing or invalid explicit issuer dates show unavailable without falling back to market data', () => {
  for (const value of [undefined, '', 'invalid-date']) {
    const undated = { ...packet, evidenceQuality: { ...packet.evidenceQuality, holdingsAsOf: value } } as unknown as EtfResearchPacket
    const document = report(undated)
    assert.match(document.querySelector('.equity-research-header')!.textContent!, /Issuer holdings date unavailable/)
    assert.equal(document.querySelector('.etf-research-holdings header span')!.textContent, 'Effective date unavailable')
  }
  assert.match(report(null).querySelector('.equity-research-header')!.textContent!, /Issuer holdings date unavailable/)
})

test('legacy ETF packets retain their original issuer date without a UTC-midnight timezone shift', () => {
  const document = report({ ...packet, evidenceQuality: undefined, dataAsOf: '2026-10-02T00:00:00Z' })
  assert.match(document.querySelector('.equity-research-header')!.textContent!, /issuer-held portfolio data as of Oct 2, 2026/)
  assert.equal(document.querySelector('.etf-research-holdings header span')!.textContent, 'Effective Oct 2, 2026')
})

test('legacy stance reasons render readable Markdown in memo mode and retain claim tags in Evidence mode', () => {
  const advice = currentAdvice()
  advice.businessView.reason = String.raw`**VIEW:** Utilities support \*\*regulated earnings\*\*. [issuer-holdings]

- Observe *cash conversion*.
- Read the [issuer](https://www.virtus.com).`
  const document = parseHTML(renderToStaticMarkup(createElement(ResearchAdvice, { advice }))).document
  const memo = document.querySelector('.research-memo-copy')!
  const evidence = document.querySelector('.research-evidence-copy')!
  assert.equal(memo.querySelector('strong')!.textContent, 'regulated earnings')
  assert.equal(memo.querySelector('em')!.textContent, 'cash conversion')
  assert.equal(memo.querySelectorAll('li').length, 2)
  assert.equal(memo.querySelector('a')!.getAttribute('href'), 'https://www.virtus.com')
  assert.ok(!memo.textContent!.includes('VIEW:'))
  assert.ok(!memo.textContent!.includes('**'))
  assert.ok(!memo.textContent!.includes('[issuer-holdings]'))
  assert.equal(evidence.querySelector('strong')!.textContent, 'VIEW:')
  assert.match(evidence.textContent!, /regulated earnings/)
})
