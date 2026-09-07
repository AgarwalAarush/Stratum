import { renderInvestmentNewsletter } from '../markets/investment-newsletter.ts'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import {
  contentHash,
  fetchRecommendationWorkspace,
  investmentDate,
  investmentDb,
  record,
} from './recommendations.ts'
import type {
  DecisionContext,
  Recommendation,
} from '../markets/recommendations.ts'

/** Sender is explicit server configuration. Recipient is the owner's authorized
 * address; no browser can redirect private portfolio advice to another party. */
export async function prepareInvestmentNewsletter(
  now = new Date(),
  ownerId = MARKETS_OWNER_ID,
) {
  const db = investmentDb(),
    date = investmentDate(now)
  const existing = await db
    .from('investment_newsletter_outbox')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('edition_date', date)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data
  const sender = process.env.STRATUM_NEWSLETTER_FROM?.trim()
  if (!sender)
    throw new Error(
      'STRATUM_NEWSLETTER_FROM must identify a verified email sender',
    )
  const workspace = await fetchRecommendationWorkspace(ownerId)
  const latest =
    workspace.latest?.decision_date === date ? workspace.latest : null
  const context = record(workspace.context).content as
    | DecisionContext
    | undefined
  const recommendations = latest
    ? workspace.recommendations.map((r) => r.content as Recommendation)
    : []
  const rendered = renderInvestmentNewsletter({
    date,
    publishedAt: latest?.published_at ?? null,
    summary:
      latest?.summary ??
      'Stratum could not publish today’s investment evaluation. Existing holdings have not been declared safe; consult your standing risk controls.',
    recommendations,
    worldHighlights:
      latest && Array.isArray(context?.world)
        ? context.world
            .slice(0, weekendLimit(date))
            .map((w) => String(record(w).summary ?? record(w).title ?? ''))
            .filter(Boolean)
        : ['No current governed World context is available for this edition.'],
    outcomes: workspace.evaluations
      .slice(0, 4)
      .map(
        (e) =>
          `${e.kind} · ${e.horizon}: ${String(record(e.content).reason ?? record(e.content).status ?? 'Review available in Stratum')}`,
      ),
    gaps: latest
      ? (context?.gaps ?? [])
      : [
          'No same-day recommendation publication. Prior advice is not relabeled as current.',
        ],
  })
  const result = await db
    .from('investment_newsletter_outbox')
    .insert({
      owner_id: ownerId,
      edition_date: date,
      batch_id: latest?.id ?? null,
      recipient: 'aarushaga@gmail.com',
      sender,
      subject: rendered.subject,
      html: rendered.html,
      plain_text: rendered.text,
      content_hash: contentHash(rendered),
    })
    .select('*')
    .single()
  if (result.error?.code === '23505')
    return prepareInvestmentNewsletter(now, ownerId)
  if (result.error) throw new Error(result.error.message)
  return result.data
}
function weekendLimit(date: string) {
  return [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()) ? 3 : 5
}

export async function sendInvestmentNewsletter(now = new Date()) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey)
    throw new Error(
      'RESEND_API_KEY is required on the private worker for newsletter delivery',
    )
  const db = investmentDb(),
    outbox = await prepareInvestmentNewsletter(now)
  const claim = await db.rpc('claim_investment_newsletter', {
    p_outbox_id: outbox.id,
  })
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data)
    return {
      outboxId: outbox.id,
      sent: false,
      reason:
        'Already delivered, leased, suppressed or requires reconciliation',
    }
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `stratum-newsletter/${outbox.id}`,
      },
      body: JSON.stringify({
        from: outbox.sender,
        to: [outbox.recipient],
        subject: outbox.subject,
        html: outbox.html,
        text: outbox.plain_text,
      }),
      signal: AbortSignal.timeout(20000),
    })
  } catch (error) {
    const update = await db
      .from('investment_newsletter_delivery')
      .update({
        status: 'uncertain',
        lease_until: null,
        error:
          'Provider response unknown; retry only within the original idempotency window',
        updated_at: new Date().toISOString(),
      })
      .eq('outbox_id', outbox.id)
    if (update.error) throw new Error(update.error.message)
    throw error
  }
  const payload = record(await response.json())
  const providerId = typeof payload.id === 'string' ? payload.id : null
  const updated = await db
    .from('investment_newsletter_delivery')
    .update({
      status: response.ok && providerId ? 'accepted' : 'failed',
      provider_id: providerId,
      error: response.ok
        ? null
        : `Email provider rejected request (${response.status}): ${String(payload.message ?? '').slice(0, 300)}`,
      lease_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('outbox_id', outbox.id)
  if (updated.error)
    throw new Error(
      'Email may have been accepted; local persistence failed. Reconcile using the original idempotency key.',
    )
  if (!response.ok || !providerId)
    throw new Error(`Newsletter provider failed (${response.status})`)
  return {
    outboxId: outbox.id,
    providerId,
    status: 'accepted',
    recipient: outbox.recipient,
  }
}
