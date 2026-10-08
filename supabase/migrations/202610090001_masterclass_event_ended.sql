-- Masterclass event lifecycle (additive, idempotent).
--
-- Status is derived server-side from scheduled_at + ended_at, so the event
-- becomes live automatically at its scheduled time and stays ended once an
-- admin ends it. This migration only adds what that needs and never mutates
-- existing rows.

CREATE TABLE IF NOT EXISTS public.masterclass_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'How to Land Your First Remote Client',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT '2026-10-11T18:00:00+08:00',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  live_destination_url TEXT DEFAULT 'https://www.getassistara.com/live.html',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.masterclass_events ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.masterclass_events ADD COLUMN IF NOT EXISTS ended_by TEXT;

INSERT INTO public.masterclass_events (event_key, title, scheduled_at, status, live_destination_url)
SELECT 'founding-masterclass-2026','How to Land Your First Remote Client','2026-10-11T18:00:00+08:00','scheduled','https://www.getassistara.com/live.html'
WHERE NOT EXISTS (SELECT 1 FROM public.masterclass_events WHERE event_key='founding-masterclass-2026');

CREATE TABLE IF NOT EXISTS public.masterclass_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES public.masterclass_events(event_key),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_masterclass_events_key ON public.masterclass_events(event_key);
CREATE INDEX IF NOT EXISTS idx_masterclass_status_log_event ON public.masterclass_status_log(event_key);

-- Table privileges: the Edge Function uses the service role; the public read
-- endpoint is served through the service role too, so anon/authenticated only
-- need SELECT for completeness.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.masterclass_events TO service_role;
GRANT SELECT ON public.masterclass_events TO anon, authenticated;
GRANT SELECT, INSERT ON public.masterclass_status_log TO service_role;

NOTIFY pgrst, 'reload schema';
