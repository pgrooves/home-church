-- ===========================================================================
-- 0084: switches for the Practices and Alpha pages
--
-- Two app_settings rows, the same shape as homekids_on in 0081: on unless an
-- admin turns them off under App settings, Pages, which takes the page out of
-- the ••• menu for everybody. js/app.js falls back to on without a row, and
-- the Admin switch writes the row on its first tap, so this only seeds what
-- the app would write anyway.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('practices_on',
   'Practices page',
   'Off takes Practices out of the ••• menu for everybody. Nothing is deleted, and it comes back exactly as it was when this goes on again.',
   'boolean', true, null, 36),
  ('alpha_on',
   'Alpha page',
   'Off takes Alpha out of the ••• menu for everybody. Nothing is deleted, and it comes back exactly as it was when this goes on again.',
   'boolean', true, null, 37)
on conflict (key) do nothing;
