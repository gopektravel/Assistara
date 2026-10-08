-- Force PostgREST to pick up the new masterclass_events columns/table.
NOTIFY pgrst, 'reload schema';
