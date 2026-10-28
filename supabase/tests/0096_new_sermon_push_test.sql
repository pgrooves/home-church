-- ===========================================================================
-- "The sermon audio is up."
--
-- Nothing here reaches APNs. What is checked: the switch is off unless a
-- phone turns it on, an installed build's re-register cannot touch it, only
-- the slash command's key can send it, and a message is announced at most
-- once and only when there is something to listen to.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

create or replace function t_raises_like(label text, stmt text, want_fragment text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if position(lower(want_fragment) in lower(sqlerrm)) > 0 then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with "%" rather than "%")', label, sqlerrm, want_fragment;
    end if;
end;
$$;

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

delete from public.device_tokens where token like 'sermon-test-%';
delete from public.podcasts where id like 'sermon-0096-%';


-- ----------------------------------------------------------- the switch ---

begin;
  set local role anon;
  select public.hc_register_device_token('sermon-test-a', 'ios', true, true, false, true);
commit;

select t_check('a phone that just registered has it off',
  (select wants_new_sermon from public.device_tokens where token = 'sermon-test-a'), false);

begin;
  set local role anon;
  select public.hc_set_device_new_sermon('sermon-test-a', true);
commit;

select t_check('a phone can turn it on',
  (select wants_new_sermon from public.device_tokens where token = 'sermon-test-a'), true);

/* An installed build re-registers on every launch with the six arguments it
   knows. That must leave this switch exactly where its owner put it. */
begin;
  set local role anon;
  select public.hc_register_device_token('sermon-test-a', 'ios', false, true, false, true);
commit;

select t_check('an older build''s re-register leaves it on',
  (select wants_new_sermon from public.device_tokens where token = 'sermon-test-a'), true);

begin;
  set local role anon;
  select public.hc_set_device_new_sermon('sermon-test-a', false);
commit;

select t_check('and a phone can turn it off again',
  (select wants_new_sermon from public.device_tokens where token = 'sermon-test-a'), false);

begin;
  set local role anon;
  select public.hc_set_device_new_sermon('sermon-test-nobody', true);
commit;

select t_check('it never creates a row for a token that did not register',
  (select count(*)::int from public.device_tokens where token = 'sermon-test-nobody'), 0);

begin;
  set local role anon;
  select public.hc_set_device_new_sermon('sermon-test-a', true);
  select public.hc_deactivate_device_token('sermon-test-a');
commit;

select t_check('every switch off means this one too',
  (select wants_new_sermon from public.device_tokens where token = 'sermon-test-a'), false);

select t_check('there is still one hc_register_device_token, not two',
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_register_device_token'), 1);


-- ------------------------------------------------------------ who sends ---

insert into public.podcasts (id, title, episode_url, preached_on, published) values
  ('sermon-0096-ready', 'Who''s In Your Corner?', 'https://open.spotify.com/episode/x',
     (now() at time zone 'America/Chicago')::date - 2, true),
  ('sermon-0096-draft', 'A Draft', 'https://open.spotify.com/episode/y',
     (now() at time zone 'America/Chicago')::date - 2, false),
  ('sermon-0096-nolink', 'No Episode Yet', null,
     (now() at time zone 'America/Chicago')::date - 2, true),
  ('sermon-0096-old', 'From The Back Catalogue', 'https://open.spotify.com/episode/z',
     (now() at time zone 'America/Chicago')::date - 60, true);

begin;
  set local role anon;
  select t_raises_like('a phone cannot send it',
    $$select public.hc_announce_new_sermon('sermon-0096-ready')$$,
    'permission denied');
commit;

begin;
  set local role authenticated;
  select t_raises_like('nor can a signed in person',
    $$select public.hc_announce_new_sermon('sermon-0096-ready')$$,
    'permission denied');
commit;


-- ------------------------------------------- only when there is news ---

begin;
  set local role service_role;
  select t_raises_like('an unpublished message is refused',
    $$select public.hc_announce_new_sermon('sermon-0096-draft')$$,
    'not published');
  select t_raises_like('so is one with no episode to play',
    $$select public.hc_announce_new_sermon('sermon-0096-nolink')$$,
    'no episode link');
  select t_raises_like('and one from the back catalogue',
    $$select public.hc_announce_new_sermon('sermon-0096-old')$$,
    'last two weeks');
  select t_raises_like('and one that does not exist',
    $$select public.hc_announce_new_sermon('sermon-0096-missing')$$,
    'No message');
commit;

select t_check('none of those were stamped as told',
  (select count(*)::int from public.podcasts
    where id like 'sermon-0096-%' and push_announced_at is not null), 0);

begin;
  set local role service_role;
  select public.hc_announce_new_sermon('sermon-0096-ready');
commit;

select t_check('this week''s message is announced and stamped',
  (select push_announced_at is not null from public.podcasts where id = 'sermon-0096-ready'), true);

begin;
  set local role service_role;
  select t_raises_like('and running /new-podcast again does not send it twice',
    $$select public.hc_announce_new_sermon('sermon-0096-ready')$$,
    'already told');
commit;


-- -------------------------------------------------------- the vocabulary ---

insert into public.push_log (topic, note) values ('new_sermon', 'harness');

select t_check('push_log accepts the new_sermon topic',
  (select count(*)::int from public.push_log
    where topic = 'new_sermon' and note = 'harness'), 1);

delete from public.push_log where topic = 'new_sermon' and note = 'harness';

select t_check('there is still one hc_send_push, not two',
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_send_push'), 1);

delete from public.device_tokens where token like 'sermon-test-%';
delete from public.podcasts where id like 'sermon-0096-%';
