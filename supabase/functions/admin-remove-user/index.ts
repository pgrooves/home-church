/**
 * Home Church, removing somebody else's account.
 *
 * THE SIBLING OF delete-account, AND THE DIFFERENCE IS THE WHOLE FILE.
 * That function deletes the caller, works out who that is from their own
 * token, and refuses to accept a user id at all, because "a function that
 * accepts one is a function that will eventually delete the wrong person".
 * This one has to accept one: an admin removing a member is by definition
 * acting on somebody who is not them.
 *
 * So the id is not the thing that authorizes anything here. Three checks
 * stand between a request and a deleted account, and the id is only the
 * subject of the last one:
 *
 *   1. The caller presents a token, verified against the auth server rather
 *      than decoded locally, so an expired or forged one fails here.
 *   2. That caller's profiles.role is read with the service key and must be
 *      'admin'. Read server side, never taken from the request, because a
 *      client that can claim a role is a client that will.
 *   3. The target is not the caller. An admin cannot remove themselves, the
 *      same guard hc_admin_set_role applies to demotion and for the same
 *      reason: the last admin locking themselves out at 11pm on a Saturday
 *      leaves nobody who can let them back in.
 *
 * WHY IT IS NOT A POSTGRES FUNCTION, which is where every other admin action
 * in this project lives. Deleting a row from auth.users is not a table write
 * that RLS can gate; it is GoTrue's own business, and the supported way in is
 * the admin API with the service role key. A SECURITY DEFINER function doing
 * `delete from auth.users` would work today and is exactly the kind of thing
 * that stops working, quietly, the next time Supabase adds a column or a
 * side effect to signup. So this goes through the same admin client
 * delete-account uses.
 *
 * WHAT GETS DELETED is identical to delete-account, because it is the same
 * cascade from the same row. The list is in that file's header and the
 * privacy policy says it in words. Worth reading before pressing the button
 * on somebody else's behalf: a member who hosted a group room takes that
 * evening's writing down with them, including other people's.
 *
 * DEPLOY
 *   supabase functions deploy admin-remove-user
 *
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
 * by the platform. Do not add them by hand and do not paste the key anywhere.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* A uuid, or nothing. The admin API would reject a malformed id on its own,
   but a shape check before a deletion is four lines and means a typo cannot
   even reach the call. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !serviceKey || !anonKey) {
    console.error('admin-remove-user: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'You need to be signed in to do that.' }, 401);

  let payload: { user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const targetId = String(payload.user_id ?? '').trim();
  if (!UUID.test(targetId)) return json({ error: 'That is not a person.' }, 400);

  // Check 1. Who is asking, according to the auth server.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: whoError } = await asCaller.auth.getUser();
  if (whoError || !userData?.user) {
    return json({ error: 'That sign in has expired. Sign in again and try once more.' }, 401);
  }

  const callerId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check 2. Are they an admin. Read here with the service key rather than
  // trusted from the request, and read fresh on every call rather than from
  // anything the client is holding, so a demotion takes effect immediately.
  const { data: me, error: roleError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();

  if (roleError) {
    console.error('admin-remove-user: could not read the caller role', roleError.message);
    return json({ error: 'Could not check who you are. Try again in a moment.' }, 500);
  }

  if (me?.role !== 'admin') {
    // Deliberately the same shape of answer whether the caller is a member or
    // the id does not exist. Nothing here should help somebody map the roster.
    return json({ error: 'Admins only.' }, 403);
  }

  // Check 3. Not themselves.
  if (targetId === callerId) {
    return json({
      error: 'You cannot remove your own account here. Use Delete my account under Your data.',
    }, 400);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);

  if (deleteError) {
    console.error('admin-remove-user: failed for user', targetId, deleteError.message);
    return json({ error: 'We could not remove that account. Try again, or email the church.' }, 500);
  }

  console.log('admin-remove-user:', callerId, 'removed', targetId);
  return json({ ok: true });
});
