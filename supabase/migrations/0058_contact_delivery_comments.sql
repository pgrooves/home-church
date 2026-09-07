-- ===========================================================================
-- Home Church, what the contact table says about who delivers the mail
--
-- COMMENTS ONLY. No column, constraint, index or policy is touched. Migration
-- 0047 created this table when Resend was the only thing that sent anything,
-- and it says so in three places. The contact form now sends from
-- homechurchapp@gmail.com over Gmail's own SMTP, and keeps Resend underneath
-- as a backstop for when that fails; see the header of
-- supabase/functions/contact/index.ts and CONTACT_FORM_SETUP.md.
--
-- WHY THIS IS A NEW FILE RATHER THAN AN EDIT TO 0047. That migration ran
-- against production ten migrations ago. Editing an applied file makes the
-- repository disagree with the database about what was run, which is the one
-- thing the numbering exists to prevent.
--
-- WHY IT IS WORTH A MIGRATION AT ALL. `delivered_at` is the column somebody
-- reads at the worst possible moment: a message went missing and they are in
-- the table editor trying to find out what happened. What Postgres tells them
-- about it should be true. Naming a provider that is no longer the one that
-- sends is how a person concludes the wrong thing and goes to check the wrong
-- dashboard.
--
-- ONE NEW STATE TO KNOW ABOUT, and it is why delivery_error's description
-- changes rather than just losing the word Resend. A row can now have BOTH
-- delivered_at and delivery_error: the message reached the church through the
-- backstop after Gmail refused it. The church has it, so it is delivered, and
-- the error is the record of the main path being broken. Null delivered_at
-- still means, exactly as before, that nobody at the church has seen it.
--
-- Safe to run more than once. Needs 0047.
-- ===========================================================================

comment on table public.contact_messages is
  'Submissions from the contact form at the top of Connect. The email to '
  'hello@homechurchnola.com is the record; this is the backstop under it. '
  'A row with a null delivered_at was never delivered.';

comment on column public.contact_messages.delivered_at is
  'When a mail provider accepted the message. Null means it did not go, and '
  'the person who sent it was told so rather than thanked.';

comment on column public.contact_messages.delivery_error is
  'Why the send failed, or, on a row that also has delivered_at, why the '
  'Resend backstop had to carry it instead of Gmail. Set by the contact '
  'Edge Function; nothing reads it but a person looking for a lost message.';

do $$
begin
  raise notice 'contact_messages: comments updated for the Gmail sender. No schema change.';
end
$$;
