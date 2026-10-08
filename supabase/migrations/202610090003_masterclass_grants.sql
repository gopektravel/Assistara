-- Grant table privileges for the masterclass event tables (Edge Function uses service_role).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.masterclass_events TO service_role;
GRANT SELECT ON public.masterclass_events TO anon, authenticated;
GRANT SELECT, INSERT ON public.masterclass_status_log TO service_role;
NOTIFY pgrst, 'reload schema';
