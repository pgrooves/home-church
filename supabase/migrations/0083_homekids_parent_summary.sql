-- ===========================================================================
-- 0083: HomeKids, two notes to parents
--
-- Every kids guide now speaks to the grown up twice. parent_summary sits under
-- the big idea, before the story: what the kids learned on Sunday. parent_note
-- keeps its place at the end of the guide: the teaching tied up in a line and
-- what to ask at bedtime. Gemini writes both (supabase/functions/homekids-drive).
--
-- One nullable column, and the approve function taught to carry it across
-- from the draft. Nothing is removed; create or replace keeps the grants.
-- ===========================================================================

alter table public.homekids_lessons
  add column if not exists parent_summary text;   -- read before the story

comment on column public.homekids_lessons.parent_summary is
  'For parents, the first one: what the kids learned, read before the story. parent_note is the second, at the end, with the bedtime question.';

create or replace function public.hc_admin_approve_homekids_lesson(p_id text, p_taught_on date default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d      public.homekids_lesson_drafts%rowtype;
  v_day  date;
  v_id   text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into d from public.homekids_lesson_drafts where id = p_id;
  if not found then
    raise exception 'No HomeKids draft with that id.';
  end if;
  if coalesce(d.lesson->>'title', '') = '' then
    raise exception 'This draft has no title yet, so it cannot go on the page.';
  end if;

  v_day := coalesce(p_taught_on, d.taught_on);
  v_id  := 'homekids-' || to_char(v_day, 'YYYY-MM-DD');

  insert into public.homekids_lessons
    (id, taught_on, title, passage, big_idea, memory_verse, story, groups,
     checklist, prayer, parent_summary, parent_note, source_url, published)
  values
    (v_id, v_day,
     d.lesson->>'title',
     nullif(d.lesson->>'passage', ''),
     nullif(d.lesson->>'big_idea', ''),
     case when jsonb_typeof(d.lesson->'memory_verse') = 'object' then d.lesson->'memory_verse' end,
     case when jsonb_typeof(d.lesson->'story') = 'array' then d.lesson->'story' else '[]'::jsonb end,
     case when jsonb_typeof(d.lesson->'groups') = 'object' then d.lesson->'groups' else '{}'::jsonb end,
     case when jsonb_typeof(d.lesson->'checklist') = 'array' then d.lesson->'checklist' else '[]'::jsonb end,
     nullif(d.lesson->>'prayer', ''),
     nullif(d.lesson->>'parent_summary', ''),
     nullif(d.lesson->>'parent_note', ''),
     nullif(d.lesson->>'source_url', ''),
     true)
  on conflict (id) do update set
     taught_on = excluded.taught_on, title = excluded.title, passage = excluded.passage,
     big_idea = excluded.big_idea, memory_verse = excluded.memory_verse,
     story = excluded.story, groups = excluded.groups, checklist = excluded.checklist,
     prayer = excluded.prayer, parent_summary = excluded.parent_summary,
     parent_note = excluded.parent_note,
     source_url = excluded.source_url, published = true;

  update public.homekids_lesson_drafts
     set review_state = 'approved', taught_on = v_day
   where id = p_id;

  return v_id;
end;
$$;

revoke all on function public.hc_admin_approve_homekids_lesson(text, date) from public, anon, authenticated;
grant execute on function public.hc_admin_approve_homekids_lesson(text, date) to authenticated;
