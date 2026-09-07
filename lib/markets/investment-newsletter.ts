import type { Recommendation } from './recommendations.ts'
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )
export function renderInvestmentNewsletter(input: {
  date: string
  publishedAt: string | null
  summary: string
  recommendations: Recommendation[]
  worldHighlights: string[]
  outcomes: string[]
  gaps: string[]
}) {
  const weekend = [0, 6].includes(
    new Date(`${input.date}T12:00:00Z`).getUTCDay(),
  )
  const subject = `Stratum · ${weekend ? 'Weekend review' : 'Morning investment brief'} · ${input.date}`
  const blocks = [
    subject,
    input.publishedAt
      ? `Published ${input.publishedAt}. Recommendations are for your review and manual action.`
      : 'No current recommendation batch is available. This is a service-status edition.',
    input.summary,
    'WORLD → YOUR PORTFOLIO',
    ...input.worldHighlights,
    'TODAY’S DECISIONS',
    ...input.recommendations.map(
      (r) =>
        `${r.symbol} · ${r.action.replaceAll('_', ' ').toUpperCase()}\n${r.reason}\nThesis: ${r.thesis}\nCounter-thesis: ${r.counterThesis}\nEntry: ${r.entry.condition}\nInvalidation: ${r.invalidation.join('; ')}\nReassess: ${r.reassessWhen}${r.gateReasons.length ? `\nBlocked: ${r.gateReasons.join('; ')}` : ''}`,
    ),
    'WHAT WE ARE LEARNING',
    ...(input.outcomes.length
      ? input.outcomes
      : [
          'No matured outcome cohort yet. Price changes alone do not establish thesis correctness.',
        ]),
    ...(input.gaps.length ? ['EVIDENCE GAPS', ...input.gaps] : []),
    'Review sources, forecasts and record your response: https://stratum.aarushagarwal.dev/markets/recommendations',
    'Delivery: 7:00 AM Pacific daily. No orders are placed by Stratum.',
  ]
  const text = blocks.join('\n\n')
  const cards = input.recommendations
    .map(
      (r) =>
        `<tr><td style="padding:20px 0;border-top:1px solid #dededb"><p style="font-size:12px;letter-spacing:1px;color:#666">${escape(r.symbol)} &nbsp; / &nbsp; ${escape(r.action.replaceAll('_', ' ').toUpperCase())}</p><p style="font-size:17px;font-weight:600">${escape(r.reason)}</p><p><b>Thesis</b> ${escape(r.thesis)}</p><p><b>Counter-thesis</b> ${escape(r.counterThesis)}</p><p><b>Entry</b> ${escape(r.entry.condition)}</p><p><b>Invalidation</b> ${escape(r.invalidation.join('; '))}</p><p style="color:#666">${escape(r.horizonDays + '-day horizon · ' + r.confidence + '% narrative confidence; not calibrated')}</p></td></tr>`,
    )
    .join('')
  const paragraphs = (xs: string[]) =>
    xs.map((x) => `<p>${escape(x)}</p>`).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f6f6f3;color:#1b1b1a;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(input.summary.slice(0, 160))}</div><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" style="max-width:620px;width:100%;line-height:1.6"><tr><td><p style="font-size:12px;letter-spacing:3px">STRATUM / ${escape(input.date)}</p><h1 style="font-size:30px;font-weight:500;line-height:1.2">${weekend ? 'The weekend review' : 'Your morning investment brief'}</h1><p>${escape(input.summary)}</p><p style="font-size:12px;color:#666">${escape(input.publishedAt ? `Published ${input.publishedAt}` : 'No current batch — service-status edition')}</p><h2 style="font-size:18px">World → your portfolio</h2>${paragraphs(input.worldHighlights)}<h2 style="font-size:18px">Decisions to review</h2></td></tr>${cards}<tr><td style="border-top:1px solid #dededb;padding-top:20px"><h2 style="font-size:18px">What we are learning</h2>${paragraphs(input.outcomes.length ? input.outcomes : ['No matured outcome cohort yet. Price changes alone do not establish thesis correctness.'])}${input.gaps.length ? `<h2 style="font-size:18px">Evidence gaps</h2>${paragraphs(input.gaps)}` : ''}<p><a style="color:#1b1b1a" href="https://stratum.aarushagarwal.dev/markets/recommendations">Open recommendations, sources and owner review →</a></p><p style="font-size:12px;color:#666">7:00 AM Pacific daily · For your review and manual action. Stratum does not place orders.</p></td></tr></table></td></tr></table></body></html>`
  return { subject, text, html }
}
