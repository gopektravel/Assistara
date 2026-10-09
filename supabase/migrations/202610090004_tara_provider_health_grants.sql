-- Tara provider fallback: allow the analyze-opportunity Edge Function
-- (which uses the service-role key) to read and update the provider order.
--
-- Evidence: the deployed function's read of public.tara_provider_health returns
-- HTTP 403 from PostgREST ("permission denied for table"), because service_role
-- currently holds only REFERENCES/TRIGGER/TRUNCATE on this table. As a result
-- the configurable provider chain silently falls back to the built-in default
-- order and failed-provider rotation never persists.
--
-- This table is server-only configuration; no anon/authenticated access is
-- granted. Least privilege: only the privileges the function actually uses.

grant select, insert, update, delete on table public.tara_provider_health to service_role;
