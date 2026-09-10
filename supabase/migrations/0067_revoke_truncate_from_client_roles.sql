-- ===========================================================================
-- Home Church, taking TRUNCATE away from the app's roles
--
-- WHAT THIS FOUND, and it was found by accident. 0023 was applied for the
-- first time today, years after it was written, and the grant list that came
-- back afterwards had TRUNCATE on it for `authenticated`. Nothing in 0023
-- granted that. Supabase does, by default, on every new table in the public
-- schema, and 0031 already noticed and revoked it for the editable content
-- tables. Six tables were created outside that loop and kept it:
--
--   profiles           authenticated
--   journal_entries    authenticated
--   worship_sets       anon and authenticated
--   newsletter_emails  anon and authenticated
--   newsletter_runs    anon and authenticated
--   group_status_runs  anon and authenticated
--
-- WHY IT MATTERS MORE THAN A STRAY GRANT USUALLY WOULD. TRUNCATE is the one
-- write row level security cannot see. A policy decides which rows a
-- statement may touch; TRUNCATE does not touch rows, it empties the table, so
-- every `auth.uid() = user_id` in this schema is simply not consulted. On
-- profiles that is every member's name, campus and role, admin flags with
-- them. On journal_entries it is everybody's private writing. Neither is
-- something a member should be one statement away from.
--
-- IT WAS NOT REACHABLE, AND THAT IS NOT THE POINT. PostgREST speaks GET,
-- POST, PATCH and DELETE. There is no TRUNCATE verb and no function in this
-- project truncates anything, so there was no route to it from a phone. Same
-- shape as the pg_net grant in 0057: a permission standing behind a missing
-- feature rather than behind a decision. A control that only holds while
-- nobody adds an RPC is not a control, and 0031 already made the house rule.
--
-- DELETE is untouched and stays untouched. That one RLS does see, and the
-- policies on these tables are what decide it.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Depends on nothing. Safe to run more than once.
-- ===========================================================================

revoke truncate on public.profiles           from anon, authenticated;
revoke truncate on public.journal_entries    from anon, authenticated;
revoke truncate on public.worship_sets       from anon, authenticated;
revoke truncate on public.newsletter_emails  from anon, authenticated;
revoke truncate on public.newsletter_runs    from anon, authenticated;
revoke truncate on public.group_status_runs  from anon, authenticated;

-- Verified after applying: no table in public grants TRUNCATE to anon or to
-- authenticated any more.
--
-- WORTH DOING AFTER ANY NEW TABLE. Supabase's default privileges hand it out
-- again every time, so a table added next spring will arrive with it. The
-- check is one query:
--
--   select table_name, grantee
--     from information_schema.role_table_grants
--    where table_schema = 'public' and privilege_type = 'TRUNCATE'
--      and grantee in ('anon', 'authenticated');
--
-- An empty result is the correct answer.
