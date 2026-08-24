# The group rooms migrations, and what is on the project

`0016` through `0022` are **all applied** to `ibqkumxfltfiuqevviji` ("Home
Church App"). The Group tab works against the real schema.

This file was the hand-off prompt for applying `0019`–`0022`. They are applied,
so it is now the record of what went on and what the verification said, which
is the part worth keeping: the next person to read a security advisor list on
this project needs to know which twenty warnings are the design and which one
would be a problem.

---

## What is applied

| | What it does | Applied |
|---|---|---|
| **0016** `group_rooms` | Six tables, nineteen functions, the read policy the whole feature rests on. | yes |
| **0017** `group_rooms_grants` | Takes EXECUTE away from `public`. Incomplete; finished by 0018. | yes |
| **0018** `group_rooms_anon` | The real privilege fix, against Supabase's own default grants. | yes |
| **0019** `group_reports_resolve` | Lets a host close a report without deleting the note. | yes |
| **0020** `group_word_filter` | The Guideline 1.2 posting filter: a slur list, checked on post and on edit. | yes |
| **0021** `group_answer_index` | Tells the host answers exist without telling them what they say. | yes |
| **0022** `group_retention_schedule` | Schedules the ninety day sweep. | yes |
| **0029** `group_room_set_guide` | Lets a host point a room already open at another Sunday's guide. | **no, see below** |

---

## 0029, which is waiting

The Group tab can now swipe between Sundays in two places: before a room is
opened, which needs nothing from the database because `hc_room_open` already
takes whichever guide it is handed, and inside a room, which needs
`hc_room_set_guide` and therefore needs this migration run.

Until it is applied the rail in the room still draws and still swipes, and the
button on a slide answers "Changing tonight's guide is not switched on for this
church yet" (`switchGuide` in `js/rooms.js` translates PostgREST's schema cache
error into that, because the real one is a sentence about a function signature).
Everything else on the tab is unaffected.

Apply it the same way as the rest: dashboard, SQL Editor, New query, paste
`supabase/migrations/0029_group_room_set_guide.sql`, Run. Safe to run more than
once. `sh supabase/tests/run.sh 0016_group_rooms 0017_group_rooms_grants
0018_group_rooms_anon 0029_group_room_set_guide` covers it locally first, and
the thirteen checks in `supabase/tests/0029_group_room_set_guide_test.sql`
include the one worth reading before you run anything on production: swapping
the guide **deletes the answers written under the questions it replaces**. The
prayer requests and the host's own added questions survive; the app asks first,
with the number in the sentence, whenever there is anything to lose.

---

## What the verification said

**Function privileges, 22 rows.** `anon` false everywhere except
`hc_room_is_live` and `hc_room_is_member`. `signed_in` true on every
`hc_room_` row, false on `hc_purge_group_rooms` and `hc_text_offends`.

**The filter list.** 30 terms. Neither `anon` nor `authenticated` can read the
table, which is the point: a client holding the list is a client that can work
around it.

**The filter, on the sentences that matter.**

```
hc_text_offends('I was drunk most nights that year.')  → null
hc_text_offends('what a retard')                       → retard
hc_text_offends('we walked the dyke by the levee')     → null
hc_text_offends('proud coonass from Houma')            → null
```

The last two are the reason the word boundary is there. This church is in New
Orleans and both of those are ordinary sentences here.

**The answer index** returns `id, question_id, kind, author_id, author_name,
opened_at, created_at`. No `body`, which is the guarantee 0021 is built on.

**Retention.** pg_cron was not installed; 0022 installed it itself and never
reached its `NOT SCHEDULED` branch, so no dashboard step was needed.

```
jobname               | schedule  | active | command
hc-purge-group-rooms  | 0 9 * * * | true   | select public.hc_purge_group_rooms(90)
```

The ninety day line in the privacy policy is true as of this job existing, and
not before it.

**The demo host.** `can_host = true` on
`c8a1fb67-51bc-4c98-9321-8510dbbe941a`. Leader mode appears for that account.

---

## The advisor list, which looks worse than it is

**Twenty `security_definer` warnings. All twenty are the design.** They come
from two separate linter rules, and it is worth knowing which is which before
somebody decides to tidy them up:

| Rule | Count | What it is |
|---|---|---|
| `0028_anon_security_definer_function_executable` | 2 | `hc_room_is_live` and `hc_room_is_member`. These **must** stay reachable signed out, or a phone typing a six digit code cannot see the room's questions. |
| `0029_authenticated_security_definer_function_executable` | 18 | Essentially every `hc_room_` function. This rule fires on any SECURITY DEFINER function a signed-in user can reach, which is all of them. |

That second rule is flagging the architecture. **There is no insert, update, or
delete policy anywhere in this feature.** Every write goes through a SECURITY
DEFINER function, on purpose, and that is what lets a host open somebody's
answer without being able to rewrite it, and what makes the name on a note come
from the caller's own profile rather than from whatever the client claims.
Removing the definer property to clear the warnings would remove the feature.

Do not "fix" these. If the count ever drops, something was taken out.

**Two more, neither from these migrations:**

- `rls_enabled_no_policy` (INFO) on `public.group_filter_terms`. That is 0020
  working: RLS with no policy denies everything to `anon` and `authenticated`
  while `service_role` bypasses it, which is how the slur list stays closed.
  Also flagged on `public.push_log`, pre-existing.
- `auth_leaked_password_protection` (WARN). HaveIBeenPwned checking is off.
  **This app has no passwords.** Sign in is an emailed six digit code, start to
  finish — see `requestCode` and `verifyCode` in `js/auth.js`. The setting
  guards a code path nothing here uses. Turn it on if you like, one toggle in
  the dashboard, but nothing in this app changes either way.

---

## Still not done, and neither is SQL

1. **The two Apple review accounts.** `SUBMISSION_KIT.md` section 1 has the
   checklist. Report and Block only appear on writing that is not your own, so
   without a second signed-in account a reviewer cannot reach a single
   Guideline 1.2 control. This is the one thing left that could cost a
   rejection.

2. **A room has no group name.** `hc_room_open` is called with
   `p_group_name: null` (`js/rooms.js`), because nothing yet ties a person to
   their group: the `groups` table on Connect has the real names and no
   membership. The room falls back to the guide title, which is true and reads
   fine. That is the line to change when somebody wires up which group is
   whose.
