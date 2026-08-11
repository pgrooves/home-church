-- ===========================================================================
-- Home Church, device tokens for push notifications
--
-- WHY THIS TABLE HAS NO USER COLUMN. Version 1 of the app has no accounts, on
-- purpose. A push token identifies a phone, not a person, and keeping it that
-- way is what let notifications survive the decision to switch sign in off.
-- Nobody's name is in this table and nobody's name should be added to it
-- without a conversation about what that changes on the privacy label.
--
-- THE THREE SWITCHES on the Profile screen, a new guide, the Sunday reminder,
-- and the day your group meets, are not stored here. They live on the phone.
-- The church's side only needs to know which phones want to hear anything at
-- all, and the app stops registering when the last switch goes off. Storing
-- per-topic preferences server side would mean a row that describes somebody's
-- habits, for no gain over filtering on the sending side.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
-- ===========================================================================


create table if not exists public.device_tokens (
  -- The APNs token is already unique and already opaque, so it is the key.
  -- No surrogate id, nothing to join to.
  token       text primary key,
  platform    text not null default 'ios',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint device_tokens_platform_known check (platform in ('ios', 'android', 'web'))
);

comment on table public.device_tokens is
  'One row per phone that has asked to hear about new guides. No user column, on purpose: v1 has no accounts and a token is a device, not a person.';
comment on column public.device_tokens.active is
  'False when somebody turned the last notification switch off. Rows are deactivated rather than deleted so a re-register does not lose the original created_at.';

create index if not exists device_tokens_active_idx on public.device_tokens (active) where active;

drop trigger if exists device_tokens_set_updated_at on public.device_tokens;
create trigger device_tokens_set_updated_at
  before update on public.device_tokens
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- Row level security
--
-- This one is shaped differently from every other table in the project, and
-- the difference is worth reading before changing it.
--
-- The app writes here with the anon key, because there is no session to write
-- with. So anon needs INSERT, to register, and UPDATE, to deactivate when the
-- switches go off.
--
-- What anon must never have is SELECT. A readable token table is a list of
-- every phone with the app installed, downloadable by anybody who has the
-- publishable key, which is to say anybody. There is no SELECT policy below
-- and the grant is revoked, so two separate things have to be wrong before
-- that list can be read.
--
-- The residual risk, stated plainly: somebody who already knows a specific
-- token could deactivate it and stop that phone receiving notifications. APNs
-- tokens are 64 hex characters and are not guessable, and the only way to
-- learn one is to already have that phone. Nuisance at worst, and the cost of
-- fixing it properly is accounts, which is the thing v1 deliberately does not
-- have.
-- ---------------------------------------------------------------------------

alter table public.device_tokens enable row level security;

drop policy if exists "a phone can register itself"   on public.device_tokens;
drop policy if exists "a phone can update its own row" on public.device_tokens;

create policy "a phone can register itself"
  on public.device_tokens for insert
  to anon, authenticated
  with check (true);

create policy "a phone can update its own row"
  on public.device_tokens for update
  to anon, authenticated
  using (true)
  with check (true);

-- No SELECT policy and no DELETE policy, deliberately. See above.

revoke all on public.device_tokens from anon, authenticated;
grant insert, update on public.device_tokens to anon, authenticated;
grant all on public.device_tokens to service_role;
