# HomeKids, rendered

Not a mockup: `render.js` serves this repo exactly as the phone loads it,
answers the two HomeKids REST calls with `sample.json`, and lets
`js/content.js` map the rows the way it will map the real tables. Every other
Supabase call is refused, so nothing touches the live project.

    node demo-homekids/render.js [out-dir]     # default: demo-homekids/out

`sample.json` is **sample content**, in the exact shape of migration
`0081_homekids.sql`. It is also what `tests/homekids.test.js` reads. Nothing in
it is ever published. `HOMEKIDS_SETUP.md` at the root is the real guide.
