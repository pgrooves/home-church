-- ===========================================================================
-- Happy Lion Cafe: "as soon as it's ready"
--
-- When the counter opens the cafe by hand (an off day, an evening event, a
-- Saturday test) the Sunday morning pickup times can all be behind it, and
-- Open would have nothing anybody could order. So while the counter has
-- opened it by hand, the app offers "as soon as it's ready" first, and the
-- cafe-checkout function sets the pickup about ten minutes out.
--
-- This row is what such an order points at (cafe_orders.slot_id is a foreign
-- key). It is inactive, so it never appears in the ordinary list of times;
-- the app adds it itself when the counter has opened. Safe to run twice.
-- Undone by supabase/rollback/0085_happy_lion_cafe_down.sql with the rest.
-- ===========================================================================

insert into public.cafe_slots (id, service, pickup_time, sort_order, active)
values ('asap', 'Now', '00:00', 0, false)
on conflict (id) do nothing;
