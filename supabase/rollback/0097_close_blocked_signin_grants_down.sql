-- Puts back the grants 0097 took away, which were Supabase's defaults.
-- Only worth running if 0097 is somehow suspected of breaking sign-in; the
-- table's row level security keeps it closed either way.
grant select, insert, update, delete on table public.hc_blocked_signin_emails to anon, authenticated;
grant execute on function public.hc_refuse_blocked_signin() to public, anon, authenticated;
