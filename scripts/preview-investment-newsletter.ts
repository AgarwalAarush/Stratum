import { writeFile } from 'node:fs/promises'
import { renderInvestmentNewsletter } from '../lib/markets/investment-newsletter.ts'
import {
  abstention,
  type DecisionContext,
  type DecisionName,
} from '../lib/markets/recommendations.ts'
const date = new Date().toISOString().slice(0, 10),
  cutoff = new Date().toISOString()
const name = {
  symbol: 'EXAMPLE',
  portfolioId: 'illustrative',
  sources: [],
} as unknown as DecisionName
const context = { cutoff } as DecisionContext
const rec = abstention(
  name,
  context,
  'Illustrative: wait for the next earnings release to verify that demand is translating into durable margins.',
)
rec.action = 'research'
rec.thesis = 'Higher customer demand may improve pricing and operating margins.'
rec.counterThesis =
  'New capacity and stronger competition may absorb the benefit before shareholders capture it.'
rec.mechanism = 'Demand → pricing → operating margin → free cash flow.'
const result = renderInvestmentNewsletter({
  date,
  publishedAt: cutoff,
  summary:
    'Illustrative preview — this is sample content, not a live recommendation. Start with the economic change, examine the companies affected, then decide whether the evidence supports action.',
  recommendations: [rec],
  worldHighlights: [
    'A source-backed change belongs here, followed by the economic channel and the portfolio questions it raises.',
  ],
  outcomes: [
    'Separate thesis confirmation from price performance. Early markouts will appear after five completed trading sessions.',
  ],
  gaps: ['This preview contains no private holdings or current market claims.'],
})
await writeFile(
  process.argv[2] ?? '/private/tmp/stratum-newsletter-preview.html',
  result.html,
)
