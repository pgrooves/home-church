/**
 * Home Church, the calendar anybody can subscribe to.
 *
 * WHAT IT DOES. Answers a GET with every published event as one .ics, built by
 * feed.mjs. Apple Calendar, Google Calendar and Outlook all take the address
 * of this function as a subscription and fetch it again on their own, so an
 * event the church adds, moves or deletes reaches every subscriber without
 * anybody opening the app. The Subscribe button on the Cal tab is the way in;
 * see subscribeLinks in js/screens/cal.js.
 *
 * WHY verify_jwt IS OFF. A calendar app fetching a subscription sends no
 * headers at all, let alone a Supabase session. That is safe here because
 * this function only ever reads what the events select policy already shows
 * to anon: published rows. The service key is used for the read, so the
 * filter on `published` below is the guard, not row level security, and it
 * is load bearing. An admin's pending event must not reach a stranger's phone.
 *
 *   supabase functions deploy calendar --no-verify-jwt
 *
 * WHAT A FAILURE RETURNS. A 503 and no body, never an empty calendar. A
 * subscribed calendar app that gets an error keeps the copy it already has;
 * one that gets a valid calendar with nothing in it deletes every event on
 * every subscriber's phone until the next good fetch.
 *
 * HOW FAR BACK. Ninety days, so last month's events stay where people
 * remember seeing them and the feed does not grow forever. Everything ahead
 * is included.
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 * No secrets of its own.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildFeed } from './feed.mjs';

const PAST_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('calendar: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
    return new Response(null, { status: 503 });
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - PAST_DAYS * 86400000).toISOString();
  const { data, error } = await db.from('events')
    .select('id, title, description, starts_at, ends_at, time_label, location, signup_url, also_on, updated_at')
    .eq('published', true)
    .gte('starts_at', since)
    .order('starts_at', { ascending: true });

  if (error) {
    console.error('calendar: events read', error.message);
    return new Response(null, { status: 503, headers: { 'Retry-After': '600' } });
  }

  const body = buildFeed(data ?? []);
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="home-church.ics"',
      // Short, so a correction reaches a subscriber's next fetch, and public,
      // so a burst of subscribers on a Sunday is one read of the table.
      'Cache-Control': 'public, max-age=900',
    },
  });
});
