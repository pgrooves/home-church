-- ===========================================================================
-- Home Church, group rooms, taking anon's explicit grants away
--
-- THE THIRD AND LAST GO AT THIS, and the reason it took three is worth
-- writing down, because the mistake got more subtle each time rather than
-- less.
--
--   0016 said `revoke execute ... from anon, authenticated` and believed it
--        had locked the retention sweep away. It had not: PUBLIC still held a
--        grant.
--   0017 revoked from PUBLIC and believed that finished it. It had not:
--        Supabase holds a grant too.
--   0018 revokes from anon by name, which is the one that was actually left.
--
-- WHAT NOBODY HAD ACCOUNTED FOR. A bare Postgres gives a new function exactly
-- one grant, EXECUTE to PUBLIC. This project is not a bare Postgres. Supabase
-- ships default privileges on the public schema:
--
--   alter default privileges in schema public
--     grant all on tables, functions, sequences
--     to postgres, anon, authenticated, service_role;
--
-- so every function 0016 created came out of the ground carrying FOUR grants,
-- not one:
--
--   {=X/postgres, postgres=X/postgres, anon=X/postgres,
--    authenticated=X/postgres, service_role=X/postgres}
--
-- 0016's role-named revoke removed `anon=X` and `authenticated=X` from the
-- sweep and left `=X`. 0017 removed `=X` from all nineteen and left `anon=X`
-- on the eighteen 0016 had never revoked. Between them the sweep ended up
-- correct by accident, and eighteen functions stayed callable by a signed out
-- client. The local test suite passed the whole time because the harness was a
-- bare Postgres and had no anon grant to miss.
--
-- The harness now carries Supabase's default privileges verbatim, which is the
-- change that actually prevents a fourth round of this. Every check in
-- 0017's test file failed the moment it went in, exactly matching what the
-- project reported.
--
-- AND THE SAME THING ON THE TABLES, which is new here. `grant all on tables`
-- means anon was handed SELECT on all six, including group_room_notes. 0016
-- revoked insert, update and delete and never thought to revoke select,
-- because on a bare Postgres a new table starts closed. No answer ever leaked:
-- the policies on those four tables are `to authenticated`, so anon got zero
-- rows rather than data. But that is protection by policy alone, where this
-- feature is supposed to be protected by the grant and the policy both, and
-- "the row level security happened to save us" is not the sentence anybody
-- wants to write after the fact.
--
-- THE RULE, stated once and for all: on this project a new table or function
-- is world readable and world executable the moment it exists. Revoke from
-- public AND from anon AND from authenticated by name, then grant back exactly
-- what each role needs. Never infer a privilege is absent because you did not
-- grant it.
--
-- No table, column, policy or function body changes here. Privileges only, and
-- safe to run more than once.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The tables: closed first, then opened by name
--
-- `revoke all` rather than `revoke select`, because `grant all` gave anon and
-- authenticated the whole set including TRUNCATE, REFERENCES and TRIGGER, and
-- naming the four verbs anybody thinks of leaves the three nobody does.
-- ---------------------------------------------------------------------------

revoke all on public.group_rooms          from anon, authenticated;
revoke all on public.group_room_members   from anon, authenticated;
revoke all on public.group_room_questions from anon, authenticated;
revoke all on public.group_room_notes     from anon, authenticated;
revoke all on public.group_note_reports   from anon, authenticated;
revoke all on public.group_blocks         from anon, authenticated;

-- What a signed out phone is allowed to see, and the whole of it: a live room,
-- so that typing a code can find it, and that room's questions, which are the
-- guide's words rather than anybody's private writing. Nothing else.
grant select on public.group_rooms          to anon, authenticated;
grant select on public.group_room_questions to anon, authenticated;

-- Everything anybody wrote needs an account, and then the policies from 0016
-- decide which rows.
grant select on public.group_room_members to authenticated;
grant select on public.group_room_notes   to authenticated;
grant select on public.group_note_reports to authenticated;
grant select on public.group_blocks       to authenticated;

-- No writes for anybody. Every write goes through an hc_room_* function, which
-- is what 0016 section 10 exists to explain.
grant all on public.group_rooms          to service_role;
grant all on public.group_room_members   to service_role;
grant all on public.group_room_questions to service_role;
grant all on public.group_room_notes     to service_role;
grant all on public.group_note_reports   to service_role;
grant all on public.group_blocks         to service_role;


-- ---------------------------------------------------------------------------
-- 2. The functions: anon's explicit grant, which is what 0017 missed
--
-- Belt and braces on PUBLIC as well, so this file alone is enough on a fresh
-- project and does not depend on 0017 having run first.
-- ---------------------------------------------------------------------------

revoke execute on function public.hc_room_is_member(uuid)                from public, anon, authenticated;
revoke execute on function public.hc_room_is_host(uuid)                  from public, anon, authenticated;
revoke execute on function public.hc_room_is_live(uuid)                  from public, anon, authenticated;

revoke execute on function public.hc_room_accept_terms()                 from public, anon, authenticated;
revoke execute on function public.hc_room_open(text, text, text, jsonb)  from public, anon, authenticated;
revoke execute on function public.hc_room_join(text)                     from public, anon, authenticated;
revoke execute on function public.hc_room_post(uuid, uuid, text, text)   from public, anon, authenticated;
revoke execute on function public.hc_room_edit_note(uuid, text)          from public, anon, authenticated;
revoke execute on function public.hc_room_delete_note(uuid)              from public, anon, authenticated;
revoke execute on function public.hc_room_open_answer(uuid, boolean)     from public, anon, authenticated;
revoke execute on function public.hc_room_open_all(uuid, uuid, boolean)  from public, anon, authenticated;
revoke execute on function public.hc_room_add_question(uuid, text)       from public, anon, authenticated;
revoke execute on function public.hc_room_edit_question(uuid, text)      from public, anon, authenticated;
revoke execute on function public.hc_room_remove_question(uuid)          from public, anon, authenticated;
revoke execute on function public.hc_room_report(uuid, text)             from public, anon, authenticated;
revoke execute on function public.hc_room_take_down(uuid)                from public, anon, authenticated;
revoke execute on function public.hc_room_block(uuid, boolean)           from public, anon, authenticated;
revoke execute on function public.hc_room_close(uuid)                    from public, anon, authenticated;

revoke execute on function public.hc_purge_group_rooms(integer)          from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Grant back, to exactly who needs it
--
-- The two helpers anon keeps are not called by the app. They are called inside
-- the `questions follow the room` policy, which is granted to anon, and a
-- policy expression runs with the privileges of whoever is asking. Revoke
-- these two and a signed out phone joining a room gets a permission error
-- instead of a room. hc_room_is_host only appears in policies restricted to
-- authenticated, so it stays off anon.
-- ---------------------------------------------------------------------------

grant execute on function public.hc_room_is_member(uuid) to anon, authenticated;
grant execute on function public.hc_room_is_live(uuid)   to anon, authenticated;
grant execute on function public.hc_room_is_host(uuid)   to authenticated;

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

grant execute on function public.hc_purge_group_rooms(integer) to service_role;
