-- Track whether a student has seen the one-time Founding Cohort welcome experience.
-- This is authoritative server-side state (not localStorage) so it persists across devices/browsers.
-- Null = not yet seen; timestamp = seen at that moment.

alter table public.academy_applications
  add column if not exists welcome_seen_at timestamptz;

comment on column public.academy_applications.welcome_seen_at
  is 'Timestamp when the student first completed the Founding Cohort welcome experience. Null = not yet seen.';

notify pgrst, 'reload schema';