-- ===========================================================================
-- Home Church, a series can say it is one
--
-- WHAT THIS ADDS. series.is_series, false by default. Sermons draws a series
-- holding one message as "Single message" unless this is true, so a one-off
-- never reads "Current series, 1 episode so far" as if more were coming.
-- Two or more messages make it a series whatever this says, so no older row
-- needs touching.
--
-- WHO SETS IT. /new-sunday (through /new-sermon), when the pastor says this
-- week starts a new series, or when a part 2 turns last week's single message
-- into one. Nothing else writes it.
--
-- SAFE FOR EVERY BUILD. Additive, with a default. Builds before Sermons read
-- series with select=* and ignore a column they do not know.
-- ===========================================================================

alter table public.series
  add column if not exists is_series boolean not null default false;

comment on column public.series.is_series is
  'True once this was said to be a series. One message and false reads as a single message in the app.';
