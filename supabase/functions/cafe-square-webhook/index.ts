/**
 * Home Church, Square telling us a cafe order has been paid.
 *
 * Square posts here on payment.created and payment.updated. A payment that
 * is COMPLETED and belongs to an order we made marks that order paid, which
 * gives it its ticket number and puts it in the queue at the counter.
 *
 * WHY verify_jwt IS OFF. Square has no Supabase session to present. It proves
 * itself instead with x-square-hmacsha256-signature: HMAC-SHA256, keyed with
 * the subscription's signature key, over the notification URL followed by the
 * raw body. Anything that does not match is refused before it is parsed.
 *
 * IDEMPOTENT TWICE OVER. Square retries a delivery it thinks failed, and it
 * sends both payment.created and payment.updated for one payment. Every
 * event id is written to cafe_square_events and a repeat is acknowledged and
 * ignored; and hc_cafe_mark_paid leaves an order that is already paid alone.
 *
 * WHAT IT NEEDS. Secrets on this function:
 *
 *   SQUARE_WEBHOOK_SIGNATURE_KEY  from the webhook subscription in Square's
 *                                 developer dashboard
 *   SQUARE_WEBHOOK_URL            this function's URL, written EXACTLY as it is
 *                                 in that subscription, because it is part of
 *                                 what Square signs
 *
 * DEPLOY
 *   supabase functions deploy cafe-square-webhook --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { completedPayment, verifySquareSignature } from '../_shared/cafe.mjs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const signatureKey = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') ?? '';
  const notificationUrl = Deno.env.get('SQUARE_WEBHOOK_URL') ?? '';
  if (!signatureKey || !notificationUrl) {
    console.error('cafe-square-webhook: SQUARE_WEBHOOK_SIGNATURE_KEY or SQUARE_WEBHOOK_URL not set');
    return json({ error: 'Not configured.' }, 500);
  }

  const raw = await req.text();
  const presented = req.headers.get('x-square-hmacsha256-signature') ?? '';
  if (!(await verifySquareSignature(signatureKey, notificationUrl, raw, presented))) {
    return json({ error: 'Bad signature.' }, 401);
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Platform env missing.' }, 500);
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const eventId = typeof event.event_id === 'string' ? event.event_id : null;
  if (eventId) {
    const { error: seenError } = await db
      .from('cafe_square_events')
      .insert({ event_id: eventId, type: String(event.type ?? '') });
    // 23505 is the primary key saying we have had this one already.
    if (seenError?.code === '23505') return json({ ok: true, duplicate: true });
    if (seenError) {
      console.error('cafe-square-webhook: could not record the event', seenError.message);
      return json({ error: 'Try again.' }, 500);
    }
  }

  const payment = completedPayment(event);
  if (!payment) return json({ ok: true, ignored: true });

  const { data: order, error } = await db.rpc('hc_cafe_mark_paid', {
    p_square_order_id: payment.order_id,
    p_payment_id: payment.payment_id,
    p_total_cents: payment.total_cents,
    p_tip_cents: payment.tip_cents,
  });

  if (error) {
    console.error('cafe-square-webhook: mark paid failed', error.message);
    // Let Square retry: forget we saw it, so the retry is not a duplicate.
    if (eventId) await db.from('cafe_square_events').delete().eq('event_id', eventId);
    return json({ error: 'Try again.' }, 500);
  }

  // A payment for something that is not a cafe order (the owner's other
  // sales on the same account) is normal and not an error.
  return json({ ok: true, order: order?.id ?? null, ticket_no: order?.ticket_no ?? null });
});
