-- ===========================================================================
-- Home Church, the guide notice goes out on Sunday when the guide is ready
--
-- WHAT CHANGES. Until now the "new guide" notice had exactly one moment:
-- Monday at 8am, Chicago time. A guide written up on Sunday morning sat on
-- everybody's phone unannounced for a whole day. Now:
--
--   * A guide posted before noon on Sunday is announced at 1pm that Sunday.
--   * A guide posted after noon on Sunday (or any time before Monday 8am) is
--     announced at 8am Monday, exactly as before.
--
-- WHY THE WATERMARK MOVES ONTO THE GUIDE. The Monday job used to ask "has a
-- guide appeared since the last time push_log says we announced one?" That
-- breaks the moment there are two send times. A guide posted at 12:30 on
-- Sunday is after the noon cutoff, so the 1pm send leaves it alone, and then
-- the 1pm send's ran_at becomes the watermark and Monday skips it as old. It
-- would never be announced at all.
--
-- So the guide itself records that it was announced: `push_announced_at`. A
-- send picks up any recent published guide that has not been announced yet,
-- and stamps every one it covered. No guide is announced twice, and no guide
-- falls between the two sends.
--
-- WHERE THE CUTOFF LIVES. The clock below decides it, in Chicago local time,
-- and hands it to send-push as `ref`: "only guides created before this
-- moment". Monday passes no cutoff, so it takes everything still waiting.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001, 0012 and 0085 (hc_send_push with p_ref). Safe to run twice.
--   Then redeploy send-push, which reads the new column:
--     supabase functions deploy send-push --no-verify-jwt
-- ===========================================================================


-- 1. The guide remembers it was announced ------------------------------------

alter table public.guides
  add column if not exists push_announced_at timestamptz;

comment on column public.guides.push_announced_at is
  'When the "new guide" push went out for this guide. Null until then. Set by send-push, read by send-push; nothing in the app shows it.';

-- Everything already announced under the old push_log watermark stays
-- announced, so the first Sunday under this migration does not re-announce
-- last week's guide. Only rows still null are touched, which is what makes a
-- second run a no-op.
update public.guides g
   set push_announced_at = w.ran_at
  from (select max(ran_at) as ran_at
          from public.push_log
         where topic = 'new_guide' and not skipped) w
 where w.ran_at is not null
   and g.push_announced_at is null
   and g.created_at <= w.ran_at;


-- 2. The clock ----------------------------------------------------------------
--
-- Split out of hc_push_tick so the test can hand it any moment it likes rather
-- than waiting for a Sunday. Returns the cutoff to send with on Sunday at 1pm,
-- 'infinity' on Monday at 8am (no cutoff: everything still waiting), and null
-- at every other hour.

create or replace function public.hc_new_guide_cutoff(p_now timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_local timestamp := p_now at time zone 'America/Chicago';
  v_dow   integer   := extract(isodow from v_local);   -- 1 = Monday, 7 = Sunday
  v_hour  integer   := extract(hour from v_local);
begin
  -- Sunday 1pm: announce what was posted before noon today.
  if v_dow = 7 and v_hour = 13 then
    return (date_trunc('day', v_local) + interval '12 hours') at time zone 'America/Chicago';
  end if;

  -- Monday 8am: whatever is still waiting, including a guide posted Sunday
  -- afternoon or overnight.
  if v_dow = 1 and v_hour = 8 then
    return 'infinity'::timestamptz;
  end if;

  return null;
end;
$$;

revoke all on function public.hc_new_guide_cutoff(timestamptz) from public, anon, authenticated;

comment on function public.hc_new_guide_cutoff(timestamptz) is
  'When the new guide notice is due: the "posted before" cutoff on Sunday at 1pm, infinity on Monday at 8am, null otherwise. America/Chicago.';


create or replace function public.hc_push_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_local  timestamp   := now() at time zone 'America/Chicago';
  v_dow    integer     := extract(isodow from v_local);
  v_hour   integer     := extract(hour from v_local);
  v_cutoff timestamptz := public.hc_new_guide_cutoff(now());
begin
  -- The new guide. The sender decides whether one is actually waiting; this
  -- only decides that now is a moment we would say so.
  if v_cutoff = 'infinity'::timestamptz then
    perform public.hc_send_push('new_guide');
  elsif v_cutoff is not null then
    -- ISO 8601 in UTC, spelled out, so Date() in the function parses it the
    -- same whatever this session's TimeZone happens to be.
    perform public.hc_send_push('new_guide', false,
      to_char(v_cutoff at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;

  -- Saturday evening, the Sunday reminder. Unchanged from 0012.
  if v_dow = 6 and v_hour = 18 then
    perform public.hc_send_push('sunday_reminder');
  end if;
end;
$$;

revoke all on function public.hc_push_tick() from public, anon, authenticated;

comment on function public.hc_push_tick() is
  'Runs hourly. Decides in America/Chicago local time whether this is a moment we send something: the new guide on Sunday at 1pm (posted before noon) or Monday at 8am (the rest), the Sunday reminder on Saturday at 6pm.';
