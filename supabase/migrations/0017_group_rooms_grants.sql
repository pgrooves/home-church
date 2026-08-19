-- ===========================================================================
-- Home Church, group rooms, closing the PUBLIC grant
--
-- WHAT WENT WRONG IN 0016. Section 12 of that file ends with this line:
--
--   revoke execute on function public.hc_purge_group_rooms(integer)
--     from anon, authenticated;
--
-- which reads like it locks the retention sweep away from the app, and does
-- not. Postgres grants EXECUTE on every newly created function to PUBLIC,
-- and PUBLIC is not a role you can name in a revoke list. Revoking from anon
-- and authenticated removes privileges those roles were never separately
-- granted, leaves the PUBLIC grant untouched, and every role keeps inheriting
-- EXECUTE through it. The catalog says so plainly, where the leading `=X` is
-- PUBLIC's entry:
--
--   proname              | proacl
--   hc_purge_group_rooms | {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--
-- PostgREST exposes every function in the public schema at /rest/v1/rpc, so
-- the practical shape of this was: anybody at all, holding nothing but the
-- publishable anon key that ships inside the app, could POST to
-- /rest/v1/rpc/hc_purge_group_rooms with {"p_days": 1} and delete every group
-- room older than a day, cascading to its members, questions, answers, prayer
-- requests and reports. It was reproduced end to end against a local Postgres
-- before this fix was written, and it is the only function in 0016 that was
-- actually exposed, because every other one checks auth.uid() or asks
-- hc_room_is_host before it does anything. Those refuse an anonymous caller
-- on their own. This one had no check at all, by design, because it was meant
-- to be unreachable.
--
-- THE RULE THIS FILE ADOPTS, so the same mistake cannot be made twice: revoke
-- from PUBLIC first, then grant to exactly the roles that need it. Never rely
-- on a revoke naming roles to take a privilege away, because the privilege
-- usually did not come from a role.
--
-- No table, column, policy or function body changes here. This file only
-- moves privileges, and it is safe to run more than once.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Take PUBLIC's implicit grant off all nineteen functions
--
-- Every function 0016 created, in one statement each, including the ones that
-- were never at risk. Two reasons for the wide net rather than a one line fix
-- to the purge. It silences the anon half of the advisor warnings Supabase
-- raises for these functions, which otherwise sit in the report as permanent
-- noise and train everybody to skim past it. And a function that raises for
-- an anonymous caller is safe by its body rather than by its grant, which is
-- one refactor away from not being true.
-- ---------------------------------------------------------------------------

revoke execute on function public.hc_room_is_member(uuid)                from public;
revoke execute on function public.hc_room_is_host(uuid)                  from public;
revoke execute on function public.hc_room_is_live(uuid)                  from public;

revoke execute on function public.hc_room_accept_terms()                 from public;
revoke execute on function public.hc_room_open(text, text, text, jsonb)  from public;
revoke execute on function public.hc_room_join(text)                     from public;
revoke execute on function public.hc_room_post(uuid, uuid, text, text)   from public;
revoke execute on function public.hc_room_edit_note(uuid, text)          from public;
revoke execute on function public.hc_room_delete_note(uuid)              from public;
revoke execute on function public.hc_room_open_answer(uuid, boolean)     from public;
revoke execute on function public.hc_room_open_all(uuid, uuid, boolean)  from public;
revoke execute on function public.hc_room_add_question(uuid, text)       from public;
revoke execute on function public.hc_room_edit_question(uuid, text)      from public;
revoke execute on function public.hc_room_remove_question(uuid)          from public;
revoke execute on function public.hc_room_report(uuid, text)             from public;
revoke execute on function public.hc_room_take_down(uuid)                from public;
revoke execute on function public.hc_room_block(uuid, boolean)           from public;
revoke execute on function public.hc_room_close(uuid)                    from public;

revoke execute on function public.hc_purge_group_rooms(integer)          from public;


-- ---------------------------------------------------------------------------
-- 2. Grant back, to exactly who needs it
--
-- The three helpers are the subtle ones. They are not called by the app at
-- all, they are called inside the row level security policies, and a policy
-- expression is evaluated with the privileges of whoever is running the
-- query. The `questions follow the room` policy in 0016 is granted `to anon,
-- authenticated` and its USING clause calls hc_room_is_live and
-- hc_room_is_member, so a signed out phone needs EXECUTE on both of those or
-- reading a room's questions by its code starts failing with a permission
-- error. hc_room_is_host only ever appears in policies restricted to
-- authenticated, so it does not need anon.
--
-- This is exactly the kind of thing that is invisible until somebody signs
-- out and tries to join a room, which is why the test file for this migration
-- checks the anon read path rather than only the revokes.
-- ---------------------------------------------------------------------------

grant execute on function public.hc_room_is_member(uuid) to anon, authenticated;
grant execute on function public.hc_room_is_live(uuid)   to anon, authenticated;
grant execute on function public.hc_room_is_host(uuid)   to authenticated;

-- The writes. Same list as 0016 section 12, restated here so that this file
-- is the single place the privileges are described once PUBLIC is gone.
grant execute on function public.hc_room_accept_terms()                      to authenticated;
grant execute on function public.hc_room_open(text, text, text, jsonb)       to authenticated;
grant execute on function public.hc_room_join(text)                          to authenticated;
grant execute on function public.hc_room_post(uuid, uuid, text, text)        to authenticated;
grant execute on function public.hc_room_edit_note(uuid, text)               to authenticated;
grant execute on function public.hc_room_delete_note(uuid)                   to authenticated;
grant execute on function public.hc_room_open_answer(uuid, boolean)          to authenticated;
grant execute on function public.hc_room_open_all(uuid, uuid, boolean)       to authenticated;
grant execute on function public.hc_room_add_question(uuid, text)            to authenticated;
grant execute on function public.hc_room_edit_question(uuid, text)           to authenticated;
grant execute on function public.hc_room_remove_question(uuid)               to authenticated;
grant execute on function public.hc_room_report(uuid, text)                  to authenticated;
grant execute on function public.hc_room_take_down(uuid)                     to authenticated;
grant execute on function public.hc_room_block(uuid, boolean)                to authenticated;
grant execute on function public.hc_room_close(uuid)                         to authenticated;

-- The sweep runs as a scheduled job and as nobody's session.
grant execute on function public.hc_purge_group_rooms(integer) to service_role;


-- ---------------------------------------------------------------------------
-- 3. What is deliberately NOT here, and what guards it instead
--
-- The obvious next line would be:
--
--   alter default privileges in schema public revoke execute on functions from public;
--
-- so that the next migration to add a function cannot reopen this door. It is
-- in a lot of hardening guides. It was written into a draft of this file, and
-- then it was tested, and it does not work. Checked against Postgres 16 both
-- as the superuser that runs migrations and as an ordinary role owning its own
-- functions, with and without the explicit `for role` form: pg_default_acl
-- stores only privileges that ALTER DEFAULT PRIVILEGES itself granted, the
-- built-in PUBLIC EXECUTE on a new function is applied on top of that
-- regardless, and a function created afterwards still comes out carrying
--
--   {=X/postgres,postgres=X/postgres,...}
--
-- with the leading `=X` intact. Shipping it would have left a line that reads
-- like a guarantee and is not one, which is precisely the mistake in 0016
-- section 12 that this whole file exists to correct. So it is not here.
--
-- WHAT GUARDS IT INSTEAD, and what you have to do. Every future migration that
-- adds a function to this schema must revoke execute from public on it by
-- name, the way section 1 does. supabase/tests/0017_group_rooms_grants_test.sql
-- ends with a check that walks every hc_% function in the schema and fails if
-- any of them still carries a PUBLIC grant, so forgetting is caught by
-- `sh supabase/tests/run.sh` rather than by somebody reading an advisory
-- report months later.
-- ---------------------------------------------------------------------------

comment on function public.hc_purge_group_rooms is
  'Deletes rooms older than p_days, default 90, and closes rooms whose evening has passed. service_role only, see migration 0017. Schedule it, see migration 0016 section 11.';
