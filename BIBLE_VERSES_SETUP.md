# Verses in the app — setup

Tap a scripture reference and the words come up in a sheet over whatever you
were reading, the way they do in the YouVersion app, instead of Bible Gateway
opening in a browser. This is what has to exist on the server for that to
work. Until it does, the sheet opens and says it cannot reach the verse, and
**Read the full chapter** still takes people to bible.com, so nothing is
broken in the meantime.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| `js/bible.js` | the app | Reads "Rom 12:1-2" into a passage and writes YouVersion's id for it (`ROM.12.1-ROM.12.2`) |
| `js/verse.js` | the app | The sheet. Asks the function, keeps every passage it gets on the phone |
| `supabase/functions/bible-passage` | Supabase | Holds the YouVersion key, asks YouVersion, answers the app |
| `supabase/migrations/0076_scripture_cache.sql` | Supabase | Remembers passages, so a whole church opening John 3:16 costs one request |

The translation is the **NIV (2011), YouVersion Bible id 111**. That number is
in two places that must agree: `VERSION` in `js/bible.js` and the function's
default (or the `YVP_BIBLE_ID` secret).

## Turning it on

1. **The key.** Project Settings → Edge Functions → Secrets →
   `YVP_APP_KEY` = the app key from platform.youversion.com. Never in the repo,
   never in the app. *(Done.)*
2. **The table.** SQL Editor → paste `supabase/migrations/0076_scripture_cache.sql`
   → Run. Safe to run twice.
3. **The function.**

   ```sh
   supabase functions deploy bible-passage --no-verify-jwt
   ```

   `--no-verify-jwt` matters: reading a verse is for anybody, signed in or not.
4. **Check it.** Open this in a browser, with your project's URL:

   ```
   https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/bible-passage?ref=JHN.3.16
   ```

   You want JSON with `"text": "For God so loved the world…"` and the NIV
   copyright line. What anything else means:

   | Answer | Meaning |
   | --- | --- |
   | `503 Verses are not switched on yet` | `YVP_APP_KEY` is missing, or YouVersion refused it. Check the key and that the NIV licence is accepted on the YouVersion dashboard |
   | `404 We could not find that passage` | The key works but that Bible id does not have the passage. Check the id is 111 |
   | `502` | YouVersion did not answer. The function's logs say what it got |

## Optional secrets

| Secret | Default | Why you would set it |
| --- | --- | --- |
| `YVP_BIBLE_ID` | `111` | A different translation. Change `VERSION` in `js/bible.js` to match |
| `YVP_CACHE` | on | Set to `off` if YouVersion's terms ever say text may not be kept on our side, then empty `scripture_cache` |

## Before this ships to the App Store

- Confirm with YouVersion's platform terms that keeping passages (in
  `scripture_cache` and on the phone) is allowed. If it is not, set
  `YVP_CACHE=off` — the phone copy is what keeps verses working without
  signal, so that one is worth asking about specifically.
- Press **Make live** on the YouVersion dashboard if it is required for
  production traffic.
- The privacy policy already names YouVersion (`js/screens/legal.js`,
  regenerated into `legal/`).
