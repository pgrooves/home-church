-- ===========================================================================
-- Home Church, giving back the phones the wrong gateway took away
--
-- WHAT WAS WRONG. Until the two-gateway fallback in send-push (25 September),
-- a token refused as BadDeviceToken was retired on the spot. BadDeviceToken
-- almost always meant "this phone is on the other APNs gateway", not "this
-- phone is gone", so every send between 5 and 18 September retired real
-- phones: push_log shows 12 of 13 refused on one announcement alone. By
-- 27 September device_tokens held 23 inactive rows, every one retired that
-- way, every one with its switches still on.
--
-- A retired row only comes back when that phone opens the app and
-- re-registers. Anybody who has not opened it since was off every list,
-- including the pinned banner, which is meant to reach every phone iOS
-- allows (0078).
--
-- WHAT THIS DOES. Puts those rows back on the list. It is safe for the same
-- reason the fallback is: send-push now tries each token on both gateways and
-- only retires one that both refuse, so a row that really is dead is retired
-- again on the next send, with a truthful reason this time.
--
-- Only rows retired by the sender before the fallback shipped. A row somebody
-- switched off themselves (hc_deactivate_device_token) carries no last_error
-- and is left alone.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once: the second run finds nothing to change.
-- ===========================================================================

update public.device_tokens
   set active        = true,
       failure_count = 0,
       last_error    = null
 where active = false
   and last_error = 'Retired: APNs says this phone is gone.'
   and updated_at < timestamptz '2026-09-25 23:30:00+00';
