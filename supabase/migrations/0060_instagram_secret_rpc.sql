-- ===========================================================================
-- Home Church, letting instagram-fetch actually read its own door key
--
-- WHAT WAS WRONG. 0059 put the shared secret in the vault, and the Edge
-- Function read it back with
--
--   admin.schema('vault').from('decrypted_secrets')
--
-- which goes out over the Data API. The Data API only serves the schemas on
-- its exposed list -- public, graphql_public, storage -- so `Accept-Profile:
-- vault` is refused with a 406 before a single row is considered. Not a
-- permission problem: service_role has USAGE on the schema and SELECT on the
-- view, and the secret was sitting there the whole time. The function read the
-- 406 as an empty result and logged "hc_instagram_secret is not in the vault",
-- which is the one thing it was not.
--
-- Exposing `vault` on the Data API would fix it and is the wrong trade: it
-- would put decrypted_secrets at /rest/v1/decrypted_secrets for the sake of
-- one function that already holds the service role key.
--
-- SO THE SECRET STAYS WHERE IT IS and gets a doorbell in a schema the Data
-- API already serves. The vault is still the only place the value lives, it is
-- still read at run time, and it can still be created and rotated from a web
-- session, which is the whole reason 0059 chose the vault over a function
-- secret.
-- ===========================================================================


-- The doorbell -------------------------------------------------------------
-- security definer because the caller is service_role over PostgREST and the
-- vault is not its to read directly. Takes no argument and looks up one fixed
-- name, so there is no way to ask it for a different secret.

create or replace function public.hc_instagram_secret()
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'hc_instagram_secret';
$$;


-- Who can ring it ----------------------------------------------------------
-- This hands back a secret in the clear, so the grant is the whole security
-- boundary. Execute on a function is granted to public by default, which for
-- this one would mean every copy of the app holding the anon key. Revoke
-- first, then name the only caller there is.

revoke all on function public.hc_instagram_secret() from public, anon, authenticated;
grant execute on function public.hc_instagram_secret() to service_role;

comment on function public.hc_instagram_secret() is
  'Returns the hc_instagram_secret vault value to the instagram-fetch Edge Function, which cannot reach the vault schema over the Data API. service_role only, deliberately: this returns a secret in plaintext.';
