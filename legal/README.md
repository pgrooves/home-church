# Legal pages for the web

**Generated. Do not edit these by hand.**

They are rendered from `js/screens/legal.js`, which is the single source of
truth for this text, so the page on the website and the screen inside the app
cannot say different things. Edit the app screen, then run:

    npx http-server -p 8770 -s &
    node scripts/make_legal_pages.js

Each file is one self contained HTML document. No external requests, no
relative paths, both typefaces embedded. Host them anywhere.

## What they are for

`privacy.html` has to be published at a stable public URL and that URL goes
in the **Privacy Policy URL** field in App Store Connect. Apple requires the
policy both in the app and as a public link, and a 404 or a link to a generic
homepage is a Guideline 5.1.1 rejection.

`terms.html` **is** required now, and the sentence that used to sit here said
it was not. That was written when nothing one person typed was ever shown to
another person. The Group tab does exactly that, so Guideline 1.2 applies, and
1.2 wants terms that forbid objectionable content and that people agree to
before they post. The app enforces the agreement itself, at the first attempt
to write in a room and again on the server, but the terms it asks people to
agree to have to be readable somewhere public.

`support.html` goes in the **Support URL** field, which is also required.
A homepage is thin and reviewers do check.

## Before publishing

All three are drafts and none has been read by a lawyer. See
`LAUNCH_TODO.md`. Run `npm run preflight` after regenerating: it is what
catches these three files going stale against the app screens again.
