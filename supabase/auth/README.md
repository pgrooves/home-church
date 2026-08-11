# Sign-in emails

The app asks for an email address, says "Send me a code", and then asks for a
six digit code. Whether a code is actually what arrives is decided entirely in
the Supabase dashboard, not in this repo. Out of the box it is not: Supabase's
stock templates send a bare link and no code at all.

That is the bug this folder exists to close, and it looked like this from the
pew:

> The button says send me a code. The email is titled **Supabase Auth** and has
> a link in it, no code. Tapping the link says *"Safari couldn't open this page
> because it couldn't connect to the server."*

Three separate stock settings, all doing what they say on the tin:

| What | Was | Why it broke |
|---|---|---|
| Confirm signup template | `{{ .ConfirmationURL }}` only | No code in the email, so nothing to type |
| Magic Link template | `{{ .ConfirmationURL }}` only | Same, for everyone after their first time |
| Site URL | `http://localhost:3000` | The link redirected to a machine that is not there |

`http://localhost:3000` means "this phone, port 3000". Nothing is listening
there, which is precisely what Safari was reporting.

---

## Fixing it

Two ways, same result. Both are one time.

### From a machine with a shell

```bash
python3 scripts/hc_auth.py show    # what the project sends today
python3 scripts/hc_auth.py apply
```

It needs `SUPABASE_ACCESS_TOKEN` in `.env`, a personal access token from
[account/tokens](https://supabase.com/dashboard/account/tokens). That is a
third credential, different from both the anon key in `js/config.js` and the
service role key the content scripts use: email templates are project
settings rather than rows in the database, so they are reached through the
Management API instead. The script reads the project ref out of
`js/config.js`, so it can only ever change the project the phones point at.

### From a phone, in the dashboard

Everything above, by hand. This is the path that works from anywhere.

**1. Authentication → URL Configuration**

- Site URL: `https://pgrooves.github.io/home-church/`
- Redirect URLs, add: `https://pgrooves.github.io/home-church/**`

**2. Authentication → Emails → Confirm signup**

- Subject: `{{ .Token }} is your Home Church code`
- Message body: all of [`confirm-signup.html`](confirm-signup.html), minus the
  comment at the top

**3. Authentication → Emails → Magic Link**

- Subject: `{{ .Token }} is your Home Church code`
- Message body: all of [`magic-link.html`](magic-link.html), minus the comment

**4. Authentication → Emails → Email OTP Expiration:** `3600`

Both templates matter. Which of the two goes out depends on whether the
address already has an account, so changing only one means some people get a
code and some get a bare link, and that is a much harder thing to notice.

---

## Why the templates are shaped the way they are

**The code comes first and the link is the fallback**, which is the opposite
of Supabase's default. A link is the wrong shape for this app twice over.

An email opens in Safari. The app is a home screen icon, and under Capacitor
it is a native shell, and neither shares a session with Safari, so a link
signs you in to the wrong place and leaves the app still logged out. A code
crosses that gap; a link cannot.

And several mail providers open every link in a message before a person ever
sees it, to scan it. Outlook and Hotmail do this loudly. A sign-in link works
exactly once, so it is already spent by the time it is tapped, and the person
gets *"Email link is invalid or has expired"* on a link they never used.

**The link is built by hand**, not with `{{ .ConfirmationURL }}`:

```
{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=email
```

`{{ .ConfirmationURL }}` points at Supabase's own `/verify`, which is a GET
that signs you in and redirects, which is the endpoint that the scanners
above spend. The hand built one lands on the app carrying an unspent hash,
and `consumeRedirect()` in `js/auth.js` trades it for a session over POST.
A scanner fetching that URL just downloads the app's HTML and does no harm.

**Anything the app does not recognise gets scrubbed** from the address bar
before the app reads its own route out of it, so a reload or a pasted URL
cannot replay a token that has been spent.

---

## Still says "Supabase Auth"

That is the *sender* name, and it is separate from everything above. Supabase's
built in email service sends as `noreply@mail.app.supabase.io` and it cannot be
renamed. The subject line is ours; the From line is not.

Changing it means connecting real SMTP under **Project Settings → Auth → SMTP
Settings**, with a sending service such as Resend or Postmark and a `From`
address on `homechurchnola.com`.

Worth doing before this is in many hands, and not only for the name. **The
built in service is capped at a couple of emails an hour for the whole
project**, and Supabase does not intend it for production. One Sunday
announcement pointing a congregation at the app will hit that ceiling long
before the congregation does, and the failure looks like "the code never came"
rather than like a quota. Custom SMTP is what actually lifts it.

---

## Checking it worked

Send yourself a code from the app's Profile screen. You want:

- The code visible in the email, large, without scrolling
- Typing it into the app signs you in
- Tapping **Sign me in** in the same email also signs you in, in Safari, rather
  than failing to connect

If the code is missing, one of the two templates is still stock. If the link
still dies, Site URL is still `http://localhost:3000`. `hc_auth.py show`
prints both without changing anything.
