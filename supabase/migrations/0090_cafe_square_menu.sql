-- ===========================================================================
-- 0090: the Happy Lion Cafe's menu comes from the owner's Square
--
-- Until now the drinks on the Coffee page were rows typed into
-- cafe_menu_items. From here they are copied out of the owner's Square item
-- library by _shared/cafe-sync.ts, run by the cafe-square-sync Edge Function
-- (Admin -> App settings -> Sync menu now) and by cafe-square-webhook every
-- time Square says the library changed (catalog.version.updated).
--
-- Two app_settings rows:
--
--   cafe_square_category  The category in his Square whose items are the
--                         Coffee page. His register already has one, "Home
--                         Church Menu". Empty turns the sync off and the menu
--                         is kept by hand, the way it was.
--
--   cafe_square_synced    When the menu last came from Square and what
--                         happened, written by the sync, shown in Admin under
--                         the button. Not for typing in.
--
-- Nothing else changes: cafe_menu_items already had square_item_id and a
-- square_variation_id on each size for exactly this (0085). The sync keeps
-- each drink's icon and add-ins, so a row set by hand is not undone.
--
-- Safe to run twice.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('cafe_square_category', 'Cafe: Square menu category',
   'The category in the cafe’s Square whose items are the Coffee page, spelled as it is in Square. Changes in Square show in the app within a minute. Empty keeps the menu by hand.',
   'text', null, 'Home Church Menu', 65),
  ('cafe_square_synced', 'Cafe: menu last synced',
   'Written by the sync. Shown under Sync menu now.',
   'text', null, '', 66)
on conflict (key) do nothing;
