# Turning on the contact form

There is a form at the top of the Connect tab. Somebody types their name,
their email address and a message, taps Send, and it arrives in
`hello@homechurchnola.com` as an ordinary email you can reply to.

Until you finish the three steps below, the form does not lie about it. With
nothing configured it draws the church's email address and a button that opens
Mail, which is what Connect did before. With the function deployed but no
Resend key set, it says *"The form is not connected yet. Email the church
directly and somebody will answer."* Nothing anywhere thanks a person for a
message that did not go.

**That is the whole design.** Read the top of `js/screens/connect.js` if you
want the history: this screen used to have a form that collected a name, a
contact and a note and then threw all three away behind a warm toast, and it
was torn out for it. The rule the screen keeps now is that nothing claims to
have happened unless it happened, and it is enforced in three places — the
Edge Function reports success only when Resend accepts the message
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
`contact_messages` table**, and only then asks Resend to send it to the church
with the sender's address in `Reply-To`. The row is written first on purpose:
it is the backstop, so a message cannot be lost to a Resend outage. The email
is the record — it is what you reply from and what somebody actually reads.

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

## Step 2. The Resend key

You already have a Resend account — it is what sends the six digit sign in
codes. What is in the Supabase auth settings is an SMTP password, and this
needs an **API key**, which is a different thing on the same account.

1. resend.com → **API Keys** → **Create API Key**. Sending access is enough.
2. Copy it. It starts `re_` and is shown once.

**Check the domain while you are there.** Resend → **Domains**. The address the
form sends *from* has to be at a domain listed there with every record
verified, or every send is refused. The default is
`app@homechurchnola.com`; if `homechurchnola.com` is not the verified domain,
set `CONTACT_FROM` in step 3 to something at whichever domain is.

> **The From address is not the sender's, and must not be.** The person who
> wrote the message goes in `Reply-To`, so hitting reply in the church's
> mailbox still writes to them. Putting their address in `From` is an
> unauthenticated claim to send as them, which is what SPF and DMARC exist to
> refuse, and it is how a contact form gets a church's whole domain marked as
> spam.

## Step 3. The secrets

Supabase dashboard → **Project Settings** → **Edge Functions** → **Secrets**.
They are project wide, so this page already holds `HC_NEWSLETTER_CRON_SECRET`
and the four `APNS_` values. Add:

| Secret | Required | What it is |
| --- | --- | --- |
| `RESEND_API_KEY` | **yes** | The `re_...` key from step 2. Without it the form says it is not connected and sends nothing. |
| `CONTACT_IP_PEPPER` | wanted | Any long random string, made up on the spot. See below. |
| `CONTACT_TO` | no | Where messages go. Defaults to `hello@homechurchnola.com`. |
| `CONTACT_FROM` | no | Who they come from. Defaults to `Home Church app <app@homechurchnola.com>`, and it must be at a domain verified in Resend. |

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
Send yourself a real message and watch it arrive.

If it does not, the answer is in one of two places.

**The function's logs.** Dashboard → Edge Functions → `contact` → Logs. Every
failure is written there with what Resend said. `contact: send failed for` is
followed by the actual refusal, and it is nearly always one of two things: the
key is wrong, or the `From` domain is not verified.

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

You can also read them from a phone: an admin signed into the app can select
this table, and nobody else can. That is asserted as the real roles in
`supabase/tests/0047_contact_messages_test.sql`, which stands up a Postgres,
becomes a signed out phone and then a signed in member, and checks that neither
of them gets a single row back.

---

## What this cost

Nothing new. Resend's free tier is 3,000 emails a month and the sign in codes
are already well inside it; a church contact form is a few messages a week. The
table is rows of text in a database you already run, and the sweep keeps it
from growing forever.

---

## If you ever want to turn it off

Delete the `RESEND_API_KEY` secret. The form immediately says it is not
connected and sends nothing, which is honest but ugly. Better: remove the
`contactForm()` call from `render()` in `js/screens/connect.js` and the screen
goes back to what it was, with the church's address still on Your account and
in the privacy policy. If you do that, take the **Writing to us from Connect**
section out of `js/screens/legal.js` and re-run `npm run legal`, or the policy
describes something the app no longer does.
