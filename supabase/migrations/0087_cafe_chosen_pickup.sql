-- ===========================================================================
-- Happy Lion Cafe: pickup at a time somebody chooses
--
-- The checkout screen used to offer a short list of fixed pickup times. Now
-- it offers every five minutes the cafe is open for (by the schedule, ten
-- minutes before the first service to twenty after the last), and the time
-- itself is what is stored, in cafe_orders.pickup_at.
--
-- cafe_orders.slot_id is still a foreign key, so a chosen time points at this
-- row. It is inactive, like 'asap' (0086), so it never appears in the list of
-- fixed times. The fixed rows stay where they are: old orders point at them
-- and a phone still on the old screen can order for one. Safe to run twice.
-- Undone by supabase/rollback/0085_happy_lion_cafe_down.sql with the rest.
-- ===========================================================================

insert into public.cafe_slots (id, service, pickup_time, sort_order, active)
values ('pick', 'Chosen', '00:00', 0, false)
on conflict (id) do nothing;
