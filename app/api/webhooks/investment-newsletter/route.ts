import { NextResponse } from 'next/server'
import { verifyNewsletterWebhook } from '@/lib/server/newsletter-webhook'
import { investmentDb, record } from '@/lib/server/recommendations'
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret)
    return NextResponse.json(
      { error: 'Webhook is not configured' },
      { status: 503 },
    )
  const body = await request.text()
  if (!verifyNewsletterWebhook(body, request.headers, secret))
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  try {
    const event = record(JSON.parse(body)),
      data = record(event.data),
      status = String(event.type).replace('email.', '')
    if (!['delivered', 'bounced', 'complained', 'suppressed'].includes(status))
      return NextResponse.json({ ignored: true })
    const db = investmentDb(),
      delivery = await db
        .from('investment_newsletter_delivery')
        .select('*')
        .eq('provider_id', String(data.email_id))
        .maybeSingle()
    if (delivery.error) throw new Error(delivery.error.message)
    // A callback can beat persistence of the send response; ask the provider to retry.
    if (!delivery.data)
      return NextResponse.json(
        { error: 'Delivery is not yet registered' },
        { status: 503 },
      )
    const result = await db.rpc('record_investment_newsletter_event', {
      p_id: request.headers.get('svix-id'),
      p_outbox_id: delivery.data.outbox_id,
      p_status: status,
      p_occurred_at: String(event.created_at),
    })
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json(
      { error: 'Unable to persist delivery event' },
      { status: 503 },
    )
  }
}
