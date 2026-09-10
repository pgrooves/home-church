# Turning on the contact form

There is a form at the top of the Connect tab. Somebody types their name,
their email address and a message, taps Send, and it arrives in
`hello@homechurchnola.com` as an ordinary email you can reply to.

It arrives **from `homechurchapp@gmail.com`**, sent over Gmail's own SMTP with
an App Password. That is a mailbox the church already owns and can open, so the
sent copy is somewhere a person can actually look, and the address is one
anybody at the church recognises.

Until you finish the steps below, the form does not lie about it. With
nothing configured it draws the church's email address and a button that opens
Mail, which is what Connect did before. With the function deployed but no way
to send, it says *"The form is not connected yet. Email the church directly and
somebody will answer."* Nothing anywhere thanks a person for a message that did
not go.

**That is the whole design.** Read the top of `js/screens/connect.js` if you
want the history: this screen used to have a form that collected a name, a
contact and a note and then threw all three away behind a warm toast, and it
was torn out for it. The rule the screen keeps now is that nothing claims to
have happened unless it happened, and it is enforced in three places — the
Edge Function reports success only when a mail provider accepts the message
(`supabase/functions/contact/index.ts`), `js/contact.js` rejects rather than
resolving when it does not, and `tests/e2e/contact.js` drives a real browser
against a failing send and asserts that nobody gets thanked and that the
person's words are still in the boxes.

---

## How it works, in one paragraph

The app posts the three fields to the `contact` Edge Function. That function
drops anything that filled in the hidden honeypot field, checks the lengths and
the shape of the address, counts recent messages from the same sender so the
open endpoint cannot be used as a mail relay, **writes the message to the
`contact_messages` table**, and only then sends it to the church from
`homechurchapp@gmail.com` with the sender's address in `Reply-To`. The row is
written first on purpose: it is the backstop, so a message cannot be lost to a
Gmail outage. The email is the record — it is what you reply from and what
somebody actually reads.

---

## Step 1. The migration

Run `supabase/migrations/0047_contact_messages.sql`. Dashboard → SQL Editor →
New query → paste → Run. Safe to run more than once. It needs `0025_admin_role`,
which is long since applied.

It creates the table, closes it to everybody but an admin, and schedules a
nightly sweep that deletes messages older than 180 days. **Read the output.**
If it says pg_cron is not enabled, enable it under Database → Extensions →
pg_cron and run the migration again, or the hundred and eighty days in the
privacy policy is not true.

Then run `supabase/migrations/0058_contact_delivery_comments.sql` the same way.
It changes no schema at all — it only corrects what the table says about itself
now that Gmail rather than Resend does the sending.

## Step 2. The App Password

An App Password is a sixteen character password Google issues for one program,
which can be revoked on its own without changing the account's real password.
SMTP will not accept the password you sign in with, so this step is not
optional.

1. Sign into **homechurchapp@gmail.com**.
2. **2-Step Verification has to be on first**, at
   [myaccount.google.com/security](https://myaccount.google.com/security).
   Google does not offer App Passwords on an account without it. If it is
   already on, skip ahead.
3. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   Name it something you will recognise in a year — `Home Church app contact
   form` — and create it.
4. Copy the sixteen characters. **Google shows them once.** It displays them in
   four groups of four; the spaces do not matter, the function strips them, so
   paste it however it comes.

> **Keep it out of the repository.** It goes in a Supabase secret in step 3 and
> nowhere else. Anybody holding it can send mail as the church. If it ever
> leaks, revoke it on that same Google page and make a new one; nothing else
> about the account is affected.

## Step 3. The secrets

Supabase dashboard → **Project Settings** → **Edge Functions** → **Secrets**.
They are project wide, so this page already holds `HC_NEWSLETTER_CRON_SECRET`
and the four `APNS_` values. Add:

| Secret | Required | What it is |
| --- | --- | --- |
| `GMAIL_APP_PASSWORD` | **yes** | The sixteen characters from step 2. Without it the form cannot send from Gmail. |
| `CONTACT_IP_PEPPER` | wanted | Any long random string, made up on the spot. See below. |
| `GMAIL_USER` | no | The account the App Password belongs to. Defaults to `homechurchapp@gmail.com`. |
| `GMAIL_FROM_NAME` | no | The name beside the address. Defaults to `Home Church app`. |
| `GMAIL_SMTP_PORT` | no | Defaults to `465`. Set it to `587` only if 465 turns out to be blocked. |
| `CONTACT_TO` | no | Where messages go. Defaults to `hello@homechurchnola.com`. |
| `RESEND_API_KEY` | no | The backstop. See below. |

For the pepper, anything unguessable will do:

```sh
openssl rand -hex 32
```

**What the pepper is for.** The rate limit has to be able to tell two messages
from the same source apart from two messages from two people, and the only
thing available is the network address. Storing that address would make this
the one place in the app that records where somebody is, which the privacy
policy says at length the app does not do. So the address is hashed with this
secret before it is stored: the pepper never leaves the function's environment,
the database holds a digest that cannot be turned back into an address, and
the count only ever looks at the last hour. Set nothing and the rate limit
still works, it is just easier for somebody holding the database to guess their
way back to an address.

### The Resend backstop, and whether you want it

Resend is the account that already sends the eight digit sign in codes, and it
used to send this form too. It is still wired up as a fallback: **if the Gmail
send fails and `RESEND_API_KEY` is set, the message goes out through Resend
instead**, from `Home Church app <app@homechurchnola.com>` rather than from
Gmail. An email from the wrong address beats a person being turned away at a
form.

When that happens the row gets **both** `delivered_at` and a `delivery_error`
saying what Gmail did. That combination is the alarm: the church got the
message, and the main path is broken and wants fixing. The function's log line
is `contact: gmail failed`.

That path needs `homechurchnola.com` verified under Resend → **Domains**, or it
is refused too. `CONTACT_FROM` overrides the address it sends from if the
verified domain is a different one.

**If you would rather the form simply fail loudly**, leave `RESEND_API_KEY`
unset for this function — but note it is a project wide secret shared with
anything else using Resend, so check what else would lose it first.

## Step 4. Deploy

```sh
supabase functions deploy contact --no-verify-jwt
```

`--no-verify-jwt` is not an oversight. The form is for anybody, including
somebody who has never signed in and has no token to present, so there is
nothing to verify. That is what the honeypot, the length caps and the rate
limit are for, and the header of `supabase/functions/contact/index.ts` sets out
the reasoning.

---

## Checking it worked

Open Connect on a phone or in a browser. If the top of the screen shows three
boxes rather than an **Email the church** button, the app can see the project.
Send yourself a real message and watch it arrive. **Check who it is from** —
`homechurchapp@gmail.com` means the main path is working, the domain address
means it fell through to the backstop.

If it does not arrive, the answer is in one of two places.

**The function's logs.** Dashboard → Edge Functions → `contact` → Logs. Every
failure is written there with what the provider said.

| What the log says | What it means |
| --- | --- |
| `Username and Password not accepted` | Not an App Password, or it was pasted wrong. Make a new one. |
| `no answer from smtp.gmail.com:465` | Nothing answered on that port in twenty seconds. Try `GMAIL_SMTP_PORT` = `587`; if that also hangs, the runtime is blocking outbound SMTP and this needs the Gmail API over HTTPS instead. |
| `GMAIL_APP_PASSWORD is not set` | Step 3 did not take. Secrets apply to the next invocation, not the running one. |
| `Resend returned 403` | The backstop's `From` domain is not verified in Resend. |

**The table.** Dashboard → Table Editor → `contact_messages`, or:

```sql
select created_at, name, email, delivered_at, delivery_error
from public.contact_messages
order by created_at desc
limit 20;
```

A row with a **null `delivered_at`** is a message the church never received.
The person who sent it was told so and given the email address instead, so
nobody is waiting on a reply they think is coming — but the message is right
there, and it is worth reading and answering by hand.

A row with **both** `delivered_at` and `delivery_error` was delivered by the
backstop. Nobody is waiting; go fix Gmail.

You can also read them from a phone: an admin signed into the app can select
this table, and nobody else can. That is asserted as the real roles in
`supabase/tests/0047_contact_messages_test.sql`, which stands up a Postgres,
becomes a signed out phone and then a signed in member, and checks that neither
of them gets a single row back.

---

## What this cost

Nothing new. Gmail sends 500 messages a day from a free account and a church
contact form is a few a week; Resend's free tier is 3,000 a month and the sign
in codes are already well inside it. The table is rows of text in a database
you already run, and the sweep keeps it from growing forever.

---

## If you ever want to turn it off

Delete the `GMAIL_APP_PASSWORD` secret, and `RESEND_API_KEY` if the backstop is
on. The form immediately says it is not connected and sends nothing, which is
honest but ugly. Better: remove the `contactForm()` call from `render()` in
`js/screens/connect.js` and the screen goes back to what it was, with the
church's address still on Your account and in the privacy policy. If you do
that, take the **Writing to us from Connect** section out of
`js/screens/legal.js` and re-run `npm run legal`, or the policy describes
something the app no longer does.
