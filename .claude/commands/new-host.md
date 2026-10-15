---
description: Grant or take away can_host for a group room, by the email someone signed in with.
---

# /new-host

Flips `public.profiles.can_host` for one person, found by the email they
signed in with rather than a uuid.

```
/new-host let teebacca@hotmail.com host
/new-host take hosting away from teebacca@hotmail.com
```

$ARGUMENTS

---

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`**. It says which of the two transports to use, the
Supabase MCP server or `scripts/hc_supabase.py`, and gives the SQL equivalent
below.

A missing `.env` or a refused connection is the ordinary shape of a web
session, not a reason to stop. Use MCP. Confirm the project ref is
`ibqkumxfltfiuqevviji`, stop only if neither transport is available, and never
ask for a key in the chat.

## Step 1. Work out email and direction

Two things, both required: the email address, and whether hosting is being
granted or taken away. Ask for whichever is missing rather than guessing from
a partial request.

This is deliberately not self service, see migration 0016: hosting a room is
real authority over other people's writing in it, opening and closing it,
deleting anything anybody wrote, editing the questions the whole group sees.
The church grants it, this command is that step.

## Step 2. Run it

```bash
python3 scripts/hc_supabase.py host teebacca@hotmail.com on
python3 scripts/hc_supabase.py host teebacca@hotmail.com off
```

No script or MCP access? The email lookup needs GoTrue's admin endpoint, which
plain `execute_sql` cannot reach, so ask them their `id` instead and:

```sql
update public.profiles set can_host = true where id = '<uuid>';
```

## Step 3. Read the result

The script's own output already says what happened, whether the person was
found, and what `can_host` was before the change. Two outcomes are not errors,
just report them plainly:

- **No account found.** `can_host` lives on the profile row a sign-in creates.
  The person has to open the app and sign in once, with this exact email,
  before hosting can be granted. Say that, do not try to create the row
  yourself.
- **More than one match.** The script refuses to guess. Say so, do not pick
  one.

## Step 4. Confirm, briefly

```
Trey can now host group rooms.  (teebacca@hotmail.com, was off)
```

One line and stop.

---

**This reaches phones on its own.** `can_host` gates buttons the app already
reads from `profiles` on open, no matching edit anywhere else, no `?v=N` bump,
no build.
