# Happy Lion Cafe, rendered

Two renders of the Coffee page.

    node demo-happy-lion-cafe/render.js [out-dir]          # the real app, default out-app/
    node demo-happy-lion-cafe/render-mockup.js [out-dir]   # the signed-off mockup, default out/

`render.js` serves this repo as the phone loads it, signs a pretend person
in, fixes the clock to Sunday 4 October 2026 at 8:30, and answers the cafe's
REST and function calls from `sample.json`. Everything else is refused, so
nothing reaches the live project or Square. It writes the ••• menu, the menu,
a drink's sheet, the order with pickup times, a ticket, the counter's queue,
and the menu in dark.

`mockup.src.html` is the design that was signed off before building.

The plan, the Square setup and what is still needed live in
`.claude/ledgers/happy-lion-cafe.md`.
