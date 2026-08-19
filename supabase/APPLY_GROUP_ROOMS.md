# Applying the group rooms migrations

Four migrations are written, tested, and **not applied to the project**:
`0019`, `0020`, `0021`, `0022`. The Group tab does not fully work until they
are. This file is the hand-off: paste the prompt below into a session that can
reach Supabase, and bring the output back.

`0016`, `0017`, and `0018` are already applied.

---

## Why this is a hand-off and not just done

The sessions that wrote these migrations reach Supabase through an MCP server
that has to be authorized on the account, and authorizing it is an interactive
step that cannot happen inside an automated session. See `ACCESS.md`. Nothing
about the migrations is unusual; the transport is the whole problem.

---

## What each one does, in a sentence

| | What it is for | What breaks without it |
|---|---|---|
| **0019** `group_reports_resolve` | Lets a host close a report without deleting the note. | The report queue's "Leave it up" button errors. The only way to empty the queue is to take somebody's writing down. |
| **0020** `group_word_filter` | The Guideline 1.2 posting filter: a slur list, checked on post and on edit. | Nothing filters. This is a named App Store requirement and its absence is a rejection. |
| **0021** `group_answer_index` | Tells the host that answers exist without telling them what they say. | **The host's reveal desk is empty in a full room.** No chips to tap, nothing can be opened, and the feature does not work at all. This is the important one. |
| **0022** `group_retention_schedule` | Schedules the ninety day sweep with pg_cron. | Nothing is ever deleted, and the privacy policy's ninety day promise is not true. |

Apply them in order. 0021 alone would make the tab usable; 0020 alone would
make it submittable; both are needed for either to be worth doing.

---

## The prompt

Paste everything between the lines into a session that has the Supabase MCP
server authorized, then bring the whole output back.

---

> I need four SQL migrations applied to the Home Church Supabase project,
> ref `ibqkumxfltfiuqevviji`. They are in the repo on branch
> `claude/group-environment-tab-vy2ost`:
>
> - `supabase/migrations/0019_group_reports_resolve.sql`
> - `supabase/migrations/0020_group_word_filter.sql`
> - `supabase/migrations/0021_group_answer_index.sql`
> - `supabase/migrations/0022_group_retention_schedule.sql`
>
> Please, in this order:
>
> 1. Confirm you are pointed at ref `ibqkumxfltfiuqevviji` before writing
>    anything.
> 2. Apply each file **in numerical order** with `apply_migration` (not
>    `execute_sql`), naming each migration after its filename. Paste each
>    file's contents verbatim; do not edit or reformat them. All four are
>    safe to run more than once.
> 3. **Read 0022's output and report it back verbatim.** It is written to
>    detect whether `pg_cron` is enabled and to say so rather than fail. If
>    it prints `NOT SCHEDULED`, enable pg_cron under Database → Extensions
>    and run 0022 again, then report what it says the second time.
> 4. Run these verification queries and paste the full results:
>
> ```sql
> -- Every function this feature needs, and who can call it.
> select p.proname,
>        has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
>        has_function_privilege('authenticated', p.oid, 'EXECUTE') as signed_in
>   from pg_proc p
>   join pg_type t on t.oid = p.prorettype
>  where p.pronamespace = 'public'::regnamespace
>    and (p.proname like 'hc\_room%' or p.proname in
>         ('hc_purge_group_rooms', 'hc_text_offends'))
>    and t.typname <> 'trigger'
>  order by p.proname;
> ```
>
> Expected: `anon` is **false** on every row except `hc_room_is_live` and
> `hc_room_is_member`, which are true because a signed out phone typing a
> code needs them for the questions policy. `signed_in` is true on every
> `hc_room_` row and false on `hc_purge_group_rooms` and `hc_text_offends`.
>
> ```sql
> -- The filter list is loaded and closed.
> select count(*) as terms from public.group_filter_terms;
> select has_table_privilege('anon',          'public.group_filter_terms', 'SELECT') as anon_reads,
>        has_table_privilege('authenticated', 'public.group_filter_terms', 'SELECT') as signed_in_reads;
> ```
>
> Expected: about 30 terms, and **both** privilege columns false. If either
> is true, stop and report it: a client that can read the list is a client
> that can work around it.
>
> ```sql
> -- The filter actually fires, and does not fire on an honest sentence.
> select public.hc_text_offends('I was drunk most nights that year.')  as should_be_null,
>        public.hc_text_offends('what a retard')                       as should_name_a_term;
> ```
>
> ```sql
> -- The answer index exists and cannot return a body.
> select pg_get_function_result('public.hc_room_answer_index(uuid)'::regprocedure) as returns;
> ```
>
> Expected: a table of `id, question_id, kind, author_id, author_name,
> opened_at, created_at`, with **no** `body` anywhere in it.
>
> ```sql
> -- The sweep is scheduled. Empty result means it is not.
> select jobname, schedule, active, command from cron.job
>  where jobname = 'hc-purge-group-rooms';
> ```
>
> (This query errors with "schema cron does not exist" if pg_cron is not
> enabled. That is the same finding as an empty result; report which.)
>
> 5. Run the security advisors and paste the output.
>
> **Expected advisor result, so it does not look like a problem:** there
> should be a small number of `security_definer` warnings naming
> `hc_room_is_live` and `hc_room_is_member`, and possibly the other
> `hc_room_` functions. The linter flags any SECURITY DEFINER function that a
> signed out client can reach, and those two must stay reachable or a phone
> typing a room code cannot see the questions. Everything in this feature
> writes through SECURITY DEFINER functions on purpose: there is no insert,
> update, or delete policy anywhere in it. Report the list; do not "fix" it.
>
> 6. Finally, mark the demo host so the Group tab's Leader mode appears:
>
> ```sql
> update public.profiles set can_host = true
>  where id = (select id from auth.users where email = 'teebacca@hotmail.com')
> returning id, first_name, can_host;
> ```
>
> If that returns no row, the account has not signed in yet; say so rather
> than creating anything.
>
> Report back: what applied, the verification output, the advisor list, and
> anything that did not match the expectations above.

---

## After it is applied

Two things are still not done and neither is SQL:

1. **The two Apple review accounts.** `SUBMISSION_KIT.md` section 1 has the
   checklist. Without them a reviewer cannot reach a single Guideline 1.2
   control, because Report and Block only appear on writing that is not your
   own.
2. **A room needs a group name.** `hc_room_open` is called with
   `p_group_name: null` (see `js/rooms.js`), because nothing yet ties a
   person to their group. The room falls back to the guide title, which reads
   fine, and this is the line to change when somebody wires that up.
