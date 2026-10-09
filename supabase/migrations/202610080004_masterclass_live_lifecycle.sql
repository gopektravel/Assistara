-- Masterclass event lifecycle — additive only. No existing records modified.
CREATE TABLE IF NOT EXISTS public.masterclass_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE, -- e.g. 'founding-masterclass-2026'
  title TEXT NOT NULL DEFAULT 'How to Land Your First Remote Client',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT '2026-10-11T18:00:00+08:00',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  live_destination_url TEXT DEFAULT 'https://www.getassistara.com/live.html',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

-- Insert the existing masterclass if not present (idempotent).
INSERT INTO public.masterclass_events (event_key, title, scheduled_at, status, live_destination_url)
SELECT 'founding-masterclass-2026','How to Land Your First Remote Client','2026-10-11T18:00:00+08:00','scheduled','https://www.getassistara.com/live.html'
WHERE NOT EXISTS (SELECT 1 FROM public.masterclass_events WHERE event_key='founding-masterclass-2026');

-- Audit trail for status transitions
CREATE TABLE IF NOT EXISTS public.masterclass_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES public.masterclass_events(event_key),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Trusted by admin endpoint; safe for public (read-only) endpoint.
ALTER TABLE public.masterclass_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS masterclass_events_read ON public.masterclass_events;
CREATE POLICY masterclass_events_read ON public.masterclass_events FOR SELECT USING (true);
DROP POLICY IF EXISTS masterclass_events_admin ON public.masterclass_events;
CREATE POLICY masterclass_events_admin ON public.masterclass_events FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL); -- admin auth enforced at endpoint layer

-- Index for fast lookup by event_key
CREATE INDEX IF NOT EXISTS idx_masterclass_events_key ON public.masterclass_events(event_key);
CREATE INDEX IF NOT EXISTS idx_masterclass_status_log_event ON public.masterclass_status_log(event_key);
