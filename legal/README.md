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

`terms.html` is not required by Apple, since the app has no user generated
content and uses Apple's standard EULA. Publish it anyway if there is
somewhere sensible to put it.

## Before publishing

Both are drafts and neither has been read by a lawyer. See `LAUNCH_TODO.md`.
