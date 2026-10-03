-- ===========================================================================
-- Home Church, Happy Lion Cafe
--
-- WHAT THIS HOLDS. Ordering ahead from the cafe in the lobby on Sunday
-- mornings, paid for through Square, and the queue the cafe owner works from.
--
--   cafe_menu_items     What can be ordered. One row per drink, its sizes and
--                       prices, and the options a person can pick (milk,
--                       sweetener and how much). Read by everybody.
--   cafe_slots          The pickup times on the checkout screen, grouped under
--                       the three services. Read by everybody.
--   cafe_orders         One row per order. Written only by the cafe-checkout
--                       Edge Function and the functions below; read by the
--                       person who placed it and, through hc_cafe_queue(), by
--                       whoever runs the counter.
--   cafe_square_events  Square webhook deliveries already handled, so a
--                       retried delivery never pays for an order twice.
--
-- WHO RUNS THE COUNTER. profiles.can_run_cafe, granted by an admin under
-- Manage users, the same three tier rule as Leader mode in 0036: an admin
-- sets it, nobody sets their own, and the trigger below says so to a direct
-- PATCH. hc_is_barista() is the one place that asks, and an admin counts.
--
-- MONEY NEVER TRUSTS THE PHONE. The phone sends what it wants; the Edge
-- Function prices it from cafe_menu_items, asks Square to build the order,
-- and stores the totals Square sent back. Nothing here takes a price as an
-- argument.
--
-- THE SWITCHES, in app_settings, all drawn in Admin:
--   cafe_on             The Coffee page in the ••• menu. OFF until the church
--                       turns it on, unlike HomeKids, Practices and Alpha:
--                       a page that takes money is not one to discover early.
--   cafe_opens_at       The Sunday schedule: open from 7:50, ten minutes
--   cafe_closes_at      before the 8:00 service, to 11:20, twenty after the
--                       11:00. Church time. Open means orders are taken and
--                       the Coffee page says so in green under the logo;
--                       closed, in red, and no orders.
--   cafe_open_override  The counter's Open and Closed, for an off day: 'open
--                       2026-10-04' or 'closed 2026-10-04' beats the schedule
--                       for that one date and is ignored after it, so the
--                       next Sunday is back on the schedule without anybody
--                       remembering to undo it. Empty follows the schedule.
--   cafe_every_day      Orders on any day, not only Sunday. For testing.
--   cafe_tax_percent    Sales tax added to every order, as a percent.
--   cafe_tips_on        Square's checkout page offers a tip.
--   cafe_slot_capacity  Drinks per pickup time before the time shows full.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001, 0012, 0016, 0025, 0026, 0036 and 0078. Safe to run more than
--   once. Then deploy the functions (see .claude/ledgers/happy-lion-cafe.md):
--     supabase functions deploy cafe-checkout
--     supabase functions deploy cafe-square-webhook --no-verify-jwt
--     supabase functions deploy send-push --no-verify-jwt
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Who runs the counter
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists can_run_cafe boolean not null default false;

comment on column public.profiles.can_run_cafe is
  'Works the Happy Lion Cafe queue. Set by an admin under Manage users, never by the person themselves. See migration 0085.';

create or replace function public.hc_guard_cafe_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.can_run_cafe is not distinct from old.can_run_cafe then
    return new;                                  -- the ordinary profile save
  end if;

  if auth.uid() is null then
    return new;                                  -- service role
  end if;

  if not public.hc_is_admin() then
    raise exception 'Only an admin can give somebody the cafe counter.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.id = auth.uid() then
    raise exception 'Nobody sets their own tier, admins included.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.hc_guard_cafe_change() from public, anon, authenticated;

drop trigger if exists profiles_guard_cafe_change on public.profiles;
create trigger profiles_guard_cafe_change
  before update on public.profiles
  for each row execute function public.hc_guard_cafe_change();

create or replace function public.hc_is_barista()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (can_run_cafe or role = 'admin')
  );
$$;

revoke all on function public.hc_is_barista() from public, anon;
grant execute on function public.hc_is_barista() to authenticated;

comment on function public.hc_is_barista() is
  'True when the signed in person runs the cafe counter (profiles.can_run_cafe) or is an admin. Signed in callers only: nothing a stranger reads asks it.';

create or replace function public.hc_admin_set_barista(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_on is null then
    raise exception 'On or off, not neither.' using errcode = '22023';
  end if;

  if p_user = auth.uid() then
    raise exception 'You cannot change your own tier.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set can_run_cafe = p_on where id = p_user;

  if not found then
    raise exception 'That person has no profile row.';
  end if;
end;
$$;

revoke all on function public.hc_admin_set_barista(uuid, boolean) from public, anon, authenticated;
grant execute on function public.hc_admin_set_barista(uuid, boolean) to authenticated;

-- The roster learns the column. Same body as 0036 left it plus is_barista,
-- which is why the return type changes and the old one has to be dropped.
drop function if exists public.hc_admin_list_users();

create or replace function public.hc_admin_list_users()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  role        text,
  is_leader   boolean,
  is_barista  boolean,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id,
           u.email::text,
           p.first_name,
           p.last_name,
           coalesce(p.role, 'member'),
           coalesce(p.can_host, false),
           coalesce(p.can_run_cafe, false),
           u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     order by (coalesce(p.role, 'member') = 'admin') desc,
              coalesce(p.can_host, false) desc,
              lower(coalesce(nullif(p.first_name, ''), u.email::text));
end;
$$;

revoke all on function public.hc_admin_list_users() from public, anon, authenticated;
grant execute on function public.hc_admin_list_users() to authenticated;

comment on function public.hc_admin_list_users() is
  'Every account, for the Manage Users screen. Admins only, checked inside. Redefined by 0085 to carry is_barista.';


-- ---------------------------------------------------------------------------
-- 2. The menu
-- ---------------------------------------------------------------------------

create table if not exists public.cafe_menu_items (
  id                 text primary key,          -- 'hot-coffee'
  name               text not null,             -- 'Hot Coffee'
  blurb              text,                      -- one line under the name
  icon               text not null default 'hot',
  sizes              jsonb not null default '[]'::jsonb,
  options            jsonb not null default '[]'::jsonb,
  square_item_id     text,                      -- once the menu lives in Square
  sort_order         integer not null default 0,
  available          boolean not null default true,
  published          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint cafe_menu_items_icon    check (icon in ('hot', 'cold')),
  constraint cafe_menu_items_sizes   check (jsonb_typeof(sizes) = 'array'),
  constraint cafe_menu_items_options check (jsonb_typeof(options) = 'array')
);

comment on column public.cafe_menu_items.sizes is
  '[{ "key": "12oz", "label": "12 oz", "price_cents": 300, "square_variation_id": null }]. Keys are permanent once orders exist.';
comment on column public.cafe_menu_items.options is
  '[{ "key": "half_and_half", "label": "Half & half", "group": "Milk", "type": "level", "levels": ["none","light","regular","extra"] }, { "key": "sugar", "label": "Sugar", "group": "Sweetener", "type": "count", "max": 4, "unit": "Packets" }]. `short` is how the option reads in a one line summary ("2 sugar"). Free unless an entry carries price_cents.';

drop trigger if exists cafe_menu_items_set_updated_at on public.cafe_menu_items;
create trigger cafe_menu_items_set_updated_at
  before update on public.cafe_menu_items
  for each row execute function public.hc_set_updated_at();

alter table public.cafe_menu_items enable row level security;

drop policy if exists "cafe menu is publicly readable" on public.cafe_menu_items;
create policy "cafe menu is publicly readable"
  on public.cafe_menu_items for select
  to anon, authenticated
  using (published or public.hc_is_admin());

grant select on public.cafe_menu_items to anon, authenticated;
revoke insert, update, delete on public.cafe_menu_items from anon, authenticated;
grant all on public.cafe_menu_items to service_role;

-- The two drinks the cafe starts with. Placeholder prices until the owner
-- sends his menu: change them here or in the table, never in the app.
insert into public.cafe_menu_items (id, name, blurb, icon, sizes, options, sort_order)
values
  ('hot-coffee', 'Hot Coffee', 'Our house drip, brewed fresh each service.', 'hot',
   '[{"key":"12oz","label":"12 oz","price_cents":300},{"key":"16oz","label":"16 oz","price_cents":350}]',
   '[{"key":"half_and_half","label":"Half & half","short":"Half & half","group":"Milk","type":"level","levels":["none","light","regular","extra"]},
     {"key":"two_percent","label":"2% milk","short":"2% milk","group":"Milk","type":"level","levels":["none","light","regular","extra"]},
     {"key":"sugar","label":"Sugar","short":"sugar","group":"Sweetener","type":"count","max":4,"unit":"Packets"},
     {"key":"splenda","label":"Splenda","short":"Splenda","group":"Sweetener","type":"count","max":4,"unit":"Packets"}]',
   10),
  ('cold-brew', 'Cold Brew', 'Slow steeped overnight, served over ice.', 'cold',
   '[{"key":"12oz","label":"12 oz","price_cents":400},{"key":"16oz","label":"16 oz","price_cents":475}]',
   '[{"key":"half_and_half","label":"Half & half","short":"Half & half","group":"Milk","type":"level","levels":["none","light","regular","extra"]},
     {"key":"two_percent","label":"2% milk","short":"2% milk","group":"Milk","type":"level","levels":["none","light","regular","extra"]},
     {"key":"sugar","label":"Sugar","short":"sugar","group":"Sweetener","type":"count","max":4,"unit":"Packets"},
     {"key":"splenda","label":"Splenda","short":"Splenda","group":"Sweetener","type":"count","max":4,"unit":"Packets"}]',
   20)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. Pickup times
-- ---------------------------------------------------------------------------

create table if not exists public.cafe_slots (
  id           text primary key,                -- '0920'
  service      text not null,                   -- '9:30', the heading it sits under
  pickup_time  time not null,                   -- 09:20, church local time
  capacity     integer,                         -- null reads cafe_slot_capacity
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint cafe_slots_capacity check (capacity is null or capacity >= 0)
);

drop trigger if exists cafe_slots_set_updated_at on public.cafe_slots;
create trigger cafe_slots_set_updated_at
  before update on public.cafe_slots
  for each row execute function public.hc_set_updated_at();

alter table public.cafe_slots enable row level security;

drop policy if exists "cafe slots are publicly readable" on public.cafe_slots;
create policy "cafe slots are publicly readable"
  on public.cafe_slots for select
  to anon, authenticated
  using (true);

grant select on public.cafe_slots to anon, authenticated;
revoke insert, update, delete on public.cafe_slots from anon, authenticated;
grant all on public.cafe_slots to service_role;

insert into public.cafe_slots (id, service, pickup_time, sort_order)
values
  ('0740', '8:00',  '07:40', 10), ('0750', '8:00',  '07:50', 20), ('0845', '8:00',  '08:45', 30),
  ('0910', '9:30',  '09:10', 40), ('0920', '9:30',  '09:20', 50), ('1015', '9:30',  '10:15', 60),
  ('1040', '11:00', '10:40', 70), ('1050', '11:00', '10:50', 80), ('1115', '11:00', '11:15', 90)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 4. Orders
-- ---------------------------------------------------------------------------

create table if not exists public.cafe_orders (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  service_day             date not null,           -- church local date
  slot_id                 text not null references public.cafe_slots(id),
  pickup_at               timestamptz not null,
  cup_name                text not null,
  items                   jsonb not null,          -- priced lines, see cafe-checkout
  drinks                  integer not null,        -- what counts against a slot
  status                  text not null default 'pending_payment',
  ticket_no               integer,                 -- given at payment, per day
  subtotal_cents          integer not null,
  tax_cents               integer not null default 0,
  tip_cents               integer not null default 0,
  total_cents             integer not null,
  square_env              text not null,           -- 'sandbox' or 'production'
  square_order_id         text unique,
  square_payment_link_id  text,
  square_payment_id       text,
  checkout_url            text,
  push_token              text,                    -- this phone, if it has one
  paid_at                 timestamptz,
  started_at              timestamptz,
  ready_at                timestamptz,
  picked_up_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint cafe_orders_status check (status in
    ('pending_payment', 'paid', 'making', 'ready', 'picked_up', 'cancelled')),
  constraint cafe_orders_items_is_array check (jsonb_typeof(items) = 'array'),
  constraint cafe_orders_env check (square_env in ('sandbox', 'production')),
  constraint cafe_orders_cup_name check (length(btrim(cup_name)) between 1 and 40)
);

comment on table public.cafe_orders is
  'One Happy Lion Cafe order. Inserted by cafe-checkout as pending_payment, paid by hc_cafe_mark_paid from the Square webhook, then worked through making, ready and picked_up from the counter.';

create index if not exists cafe_orders_day_idx   on public.cafe_orders (service_day, status);
create index if not exists cafe_orders_user_idx  on public.cafe_orders (user_id, created_at desc);
create unique index if not exists cafe_orders_ticket_key
  on public.cafe_orders (service_day, ticket_no) where ticket_no is not null;

drop trigger if exists cafe_orders_set_updated_at on public.cafe_orders;
create trigger cafe_orders_set_updated_at
  before update on public.cafe_orders
  for each row execute function public.hc_set_updated_at();

alter table public.cafe_orders enable row level security;

-- Your own orders. The counter reads through hc_cafe_queue(), which hands
-- back what a barista needs and not anybody's phone token.
drop policy if exists "cafe orders are readable by whoever placed them" on public.cafe_orders;
create policy "cafe orders are readable by whoever placed them"
  on public.cafe_orders for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.cafe_orders to authenticated;
revoke insert, update, delete on public.cafe_orders from anon, authenticated;
revoke all on public.cafe_orders from anon;
grant all on public.cafe_orders to service_role;

create table if not exists public.cafe_square_events (
  event_id     text primary key,
  type         text,
  received_at  timestamptz not null default now()
);

alter table public.cafe_square_events enable row level security;
revoke all on public.cafe_square_events from anon, authenticated;
grant all on public.cafe_square_events to service_role;


-- ---------------------------------------------------------------------------
-- 5. Settings
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('cafe_on', 'Happy Lion Cafe page',
   'Off takes Coffee out of the ••• menu for everybody. Orders already paid for stay in the queue.',
   'boolean', false, null, 38),
  ('cafe_opens_at', 'Cafe: opens at',
   'On Sundays, church time, 24 hour, for example 07:50. Ten minutes before the first service.',
   'text', null, '07:50', 58),
  ('cafe_closes_at', 'Cafe: closes at',
   'On Sundays, church time, 24 hour, for example 11:20. Twenty minutes after the third service.',
   'text', null, '11:20', 59),
  ('cafe_open_override', 'Cafe: open or closed today',
   'Set from the counter with Open and Closed, for one day only. Empty follows the Sunday schedule.',
   'text', null, '', 60),
  ('cafe_every_day', 'Cafe: orders every day',
   'For testing. Off means orders can only be placed for Sunday morning, on Sunday morning.',
   'boolean', false, null, 61),
  ('cafe_tips_on', 'Cafe: ask for a tip',
   'Square’s checkout page offers a tip.',
   'boolean', false, null, 62),
  ('cafe_tax_percent', 'Cafe: sales tax percent',
   'Added to every order, for example 9.75. Leave at 0 to charge no tax.',
   'text', null, '0', 63),
  ('cafe_slot_capacity', 'Cafe: drinks per pickup time',
   'How many drinks one pickup time can take before it shows as full.',
   'text', null, '8', 64)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- 6. The day, and how full each pickup time is
-- ---------------------------------------------------------------------------

create or replace function public.hc_cafe_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Chicago')::date;
$$;

revoke all on function public.hc_cafe_today() from public, anon;
grant execute on function public.hc_cafe_today() to authenticated, service_role;

-- Drinks spoken for at each time, counted the way cafe-checkout counts them:
-- everything paid or being worked, and anything still at Square's checkout
-- for under twenty minutes. Numbers only, never who.
create or replace function public.hc_cafe_slot_load(p_day date)
returns table (slot_id text, drinks integer)
language sql
stable
security definer
set search_path = public
as $$
  select o.slot_id, sum(o.drinks)::integer
    from public.cafe_orders o
   where o.service_day = p_day
     and (o.status in ('paid', 'making', 'ready', 'picked_up')
          or (o.status = 'pending_payment' and o.created_at > now() - interval '20 minutes'))
   group by o.slot_id;
$$;

-- Signed in only, like ordering itself, which also keeps the short list of
-- what a stranger can call (the 0018 test) exactly as short as it was.
revoke all on function public.hc_cafe_slot_load(date) from public, anon;
grant execute on function public.hc_cafe_slot_load(date) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. Paid
--
-- Called by the two Edge Functions, as the service role, once Square says the
-- money is in. Gives the order its ticket number for the day. Idempotent: an
-- order already past pending_payment comes back as it is.
-- ---------------------------------------------------------------------------

create or replace function public.hc_cafe_mark_paid(
  p_square_order_id text,
  p_payment_id      text,
  p_total_cents     integer default null,
  p_tip_cents       integer default null
)
returns public.cafe_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.cafe_orders;
  v_ticket integer;
begin
  select * into v_order from public.cafe_orders
   where square_order_id = p_square_order_id
   for update;

  if not found then
    return null;
  end if;

  if v_order.status <> 'pending_payment' then
    return v_order;
  end if;

  perform pg_advisory_xact_lock(hashtext('cafe-ticket-' || v_order.service_day::text));

  select coalesce(max(ticket_no), 0) + 1 into v_ticket
    from public.cafe_orders where service_day = v_order.service_day;

  update public.cafe_orders
     set status = 'paid',
         ticket_no = v_ticket,
         paid_at = now(),
         square_payment_id = coalesce(p_payment_id, square_payment_id),
         total_cents = coalesce(p_total_cents, total_cents),
         tip_cents = coalesce(p_tip_cents, tip_cents)
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.hc_cafe_mark_paid(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hc_cafe_mark_paid(text, text, integer, integer) to service_role;


-- ---------------------------------------------------------------------------
-- 8. Where am I in line
-- ---------------------------------------------------------------------------

create or replace function public.hc_cafe_ahead(p_order uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order public.cafe_orders;
begin
  select * into v_order from public.cafe_orders where id = p_order;
  if not found or v_order.user_id is distinct from auth.uid() then
    return null;
  end if;
  if v_order.status not in ('paid', 'making') then
    return 0;
  end if;

  return (
    select coalesce(sum(o.drinks), 0)::integer
      from public.cafe_orders o
     where o.service_day = v_order.service_day
       and o.status in ('paid', 'making')
       and o.id <> v_order.id
       and (o.pickup_at < v_order.pickup_at
            or (o.pickup_at = v_order.pickup_at and o.ticket_no < v_order.ticket_no))
  );
end;
$$;

revoke all on function public.hc_cafe_ahead(uuid) from public, anon;
grant execute on function public.hc_cafe_ahead(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 9. The counter
-- ---------------------------------------------------------------------------

create or replace function public.hc_cafe_queue(p_day date default null)
returns table (
  id           uuid,
  ticket_no    integer,
  cup_name     text,
  slot_id      text,
  pickup_at    timestamptz,
  status       text,
  items        jsonb,
  drinks       integer,
  paid_at      timestamptz,
  started_at   timestamptz,
  ready_at     timestamptz,
  picked_up_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.hc_is_barista() then
    raise exception 'The cafe counter only.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select o.id, o.ticket_no, o.cup_name, o.slot_id, o.pickup_at, o.status,
           o.items, o.drinks, o.paid_at, o.started_at, o.ready_at, o.picked_up_at
      from public.cafe_orders o
     where o.service_day = coalesce(p_day, public.hc_cafe_today())
       and o.status in ('paid', 'making', 'ready', 'picked_up')
     order by o.pickup_at, o.ticket_no;
end;
$$;

revoke all on function public.hc_cafe_queue(date) from public, anon, authenticated;
grant execute on function public.hc_cafe_queue(date) to authenticated;

-- One step along, or one step back for a mis-tap. Ready tells the phone that
-- ordered it, through the same send-push every other notification uses.
create or replace function public.hc_cafe_set_status(p_order uuid, p_status text)
returns public.cafe_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.cafe_orders;
  v_ok boolean;
begin
  if not public.hc_is_barista() then
    raise exception 'The cafe counter only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.cafe_orders where id = p_order for update;
  if not found then
    raise exception 'No order with that id.';
  end if;

  v_ok := (v_order.status, p_status) in (
    ('paid', 'making'), ('paid', 'ready'),
    ('making', 'ready'), ('making', 'paid'),
    ('ready', 'picked_up'), ('ready', 'making'),
    ('picked_up', 'ready')
  );
  if not v_ok then
    raise exception 'That order is % and cannot go to %.', v_order.status, p_status
      using errcode = '22023';
  end if;

  update public.cafe_orders
     set status = p_status,
         started_at   = case when p_status = 'making' then coalesce(started_at, now()) else started_at end,
         ready_at     = case when p_status = 'ready' then now()
                             when p_status in ('making', 'paid') then null else ready_at end,
         picked_up_at = case when p_status = 'picked_up' then now()
                             when p_status = 'ready' then null else picked_up_at end
   where id = p_order
   returning * into v_order;

  -- Only on the way forward to ready, and never allowed to undo the tap: a
  -- phone that cannot be reached still has its order marked ready.
  if p_status = 'ready' and v_order.push_token is not null then
    begin
      perform public.hc_send_push('cafe_ready', false, v_order.id::text);
    exception when others then
      raise warning 'hc_cafe_set_status: push not sent: %', sqlerrm;
    end;
  end if;

  return v_order;
end;
$$;

revoke all on function public.hc_cafe_set_status(uuid, text) from public, anon, authenticated;
grant execute on function public.hc_cafe_set_status(uuid, text) to authenticated;

-- Open and Closed, from the counter, for today only. 'open' and 'closed'
-- write that word and today's church date into cafe_open_override, which
-- beats the Sunday schedule until midnight; 'schedule' clears it. Returns
-- what it wrote.
drop function if exists public.hc_cafe_set_open(boolean);

create or replace function public.hc_cafe_set_open(p_state text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  if not public.hc_is_barista() then
    raise exception 'The cafe counter only.' using errcode = 'insufficient_privilege';
  end if;

  if p_state not in ('open', 'closed', 'schedule') then
    raise exception 'Open, closed, or schedule.' using errcode = '22023';
  end if;

  v_value := case when p_state = 'schedule' then ''
                  else p_state || ' ' || public.hc_cafe_today()::text end;

  insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
  values ('cafe_open_override', 'Cafe: open or closed today',
          'Set from the counter with Open and Closed, for one day only. Empty follows the Sunday schedule.',
          'text', null, v_value, 60)
  on conflict (key) do update set value_text = excluded.value_text;

  return v_value;
end;
$$;

revoke all on function public.hc_cafe_set_open(text) from public, anon, authenticated;
grant execute on function public.hc_cafe_set_open(text) to authenticated;

-- An earlier draft of this file had a pause switch in place of Open and
-- Closed. Gone, so a project that ran that draft is left with one control.
drop function if exists public.hc_cafe_set_taking_orders(boolean);
delete from public.app_settings where key in ('cafe_taking_orders', 'cafe_open_on');
delete from public.cafe_slots where id = '1145'
   and not exists (select 1 from public.cafe_orders where slot_id = '1145');


-- ---------------------------------------------------------------------------
-- 10. The ready notification
--
-- send-push learns `cafe_ready`, addressed to one phone: the token the order
-- was placed from. Same signature and body as 0078 left hc_send_push.
-- ---------------------------------------------------------------------------

alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner', 'cafe_ready'));

create or replace function public.hc_send_push(
  p_topic   text,
  p_dry_run boolean default false,
  p_ref     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                     'announcement', 'announcement_review', 'event_review',
                     'banner', 'cafe_ready') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('topic', p_topic, 'dry_run', p_dry_run, 'ref', p_ref),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_send_push(text, boolean, text) from public, anon, authenticated;
grant execute on function public.hc_send_push(text, boolean, text) to service_role;
