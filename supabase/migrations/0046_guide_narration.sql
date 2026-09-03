-- ===========================================================================
-- Home Church, a guide read out loud
--
-- WHAT THIS IS FOR. A guide is between two and three thousand words, and the
-- people who most need it are the ones with the least quiet time to read it:
-- a leader prepping in a car line, somebody catching up on Saturday night.
-- This adds a play button beside each of the six sections, so a guide can be
-- listened to instead of read.
--
-- WHERE THE AUDIO COMES FROM. Not from a vendor, and not at play time. It is
-- generated once when a guide is published, by scripts/build_narration.py,
-- which runs Kokoro-82M on a CPU with no API, no key, and no account. The
-- model is Apache 2.0 and the whole back catalogue took eleven minutes to
-- narrate. There is no per-play cost and nothing to meter, which is the only
-- reason this feature is affordable for a church on a free tier.
--
-- TWO PIECES HERE. A public Storage bucket to hold the mp3 files, following
-- the same shape as the instagram bucket in 0015 and the announcements bucket
-- in 0026: readable by anyone, writable only by the service role, so the
-- publishing script can fill it and nothing in the app can. And one jsonb
-- column on guides that says which sections actually have audio, so the app
-- can draw a play button only where pressing it would do something.
--
-- WHY A COLUMN RATHER THAN GUESSING THE PATH. The app already has the guide
-- row in hand and must decide, while drawing, whether a section gets a
-- button. Probing Storage for six files per guide over a phone connection to
-- answer that is absurd. The column is the answer, it arrives with the guide
-- it describes, and a guide with no audio yet simply has {}.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. What has been narrated
--
-- Shape, keyed by the section ids the reader already uses in
-- js/screens/guide.js, which are the same ids c.collapsible() draws:
--
--   {
--     "short-summary": { "path": "guide-slow-burn/af_heart/short-summary.mp3",
--                        "seconds": 89.5,
--                        "bytes": 537600,
--                        "voice": "af_heart",
--                        "hash": "3f9a1c…" },
--     "full-summary":  { … }
--   }
--
-- THE HASH IS THE POINT. It is a digest of the exact text that was spoken.
-- guides.subtitle, group_sections and reflection_questions are all editable
-- from inside the app (migration 0031), so a leader can change a question on
-- a Sunday and leave the recording saying the old one. The publishing script
-- re-hashes each section and regenerates only what moved; anything that
-- cannot be verified can be dropped from this column and the button goes away
-- rather than lying. Silence is recoverable. A guide that reads out a
-- question nobody wrote is not.
--
-- VOICE IS RECORDED PER SECTION, not per guide and not per church. Today
-- every file is af_heart. Storing it here means a second voice later is a
-- generation run and a path change rather than a migration, and a file whose
-- voice nobody can name is a file nobody can safely replace.
-- ---------------------------------------------------------------------------

alter table public.guides
  add column if not exists narration jsonb not null default '{}'::jsonb;

comment on column public.guides.narration is
  'Per-section narration manifest, keyed by the section ids in js/screens/guide.js. Each value carries path, seconds, bytes, voice and a hash of the spoken text. Written only by scripts/upload_narration.js. {} means this guide has no audio yet, which is the normal state until it is published.';

-- The same shape guard the six content columns already carry. A single object
-- sent where the app expects a map renders as no buttons at all, which is
-- invisible until somebody opens a guide expecting to hear it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guides_narration_is_object'
  ) then
    alter table public.guides
      add constraint guides_narration_is_object
      check (jsonb_typeof(narration) = 'object');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The bucket
--
-- Public, for the same reason the instagram bucket is public: these are files
-- the church is publishing to its own congregation, every phone needs them
-- without a session, and a signed URL per section per open would be six
-- round trips before anybody hears anything.
--
-- The 25MB cap is per object and generous on purpose. The longest section in
-- the current catalogue, the Sermon Summary of "Unsung Heroes", is 3MB at
-- 48kbps mono, so nothing legitimate comes close. The cap exists so a wrong
-- flag on the encoder cannot quietly push a 200MB wav into a 1GB free tier.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('narration', 'narration', true, 26214400, array['audio/mpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "narration is publicly readable" on storage.objects;

create policy "narration is publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'narration');

-- NO INSERT, UPDATE OR DELETE POLICY, and that is deliberate. Unlike the
-- announcements bucket, nothing in the app ever uploads here. The only writer
-- is scripts/upload_narration.js running with the service role key, which
-- bypasses row level security entirely. An admin with a phone cannot put a
-- file in this bucket, and should not be able to: the audio has to match text
-- that was published through the same script, or the hash contract above is
-- worthless.
