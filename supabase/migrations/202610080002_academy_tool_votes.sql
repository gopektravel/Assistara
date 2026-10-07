-- Founding Cohort tool voting. Learner-owned, server-persisted.
-- The dashboard may optimistically show vote state, but the authoritative
-- vote is written ONLY by the Vercel API (api/academy-tool-votes.js) under
-- the service role. Learners get no direct INSERT/UPDATE/DELETE path;
-- the dashboard's vote state always round-trips through the API.

CREATE TABLE IF NOT EXISTS public.academy_tool_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_tool_votes_pkey PRIMARY KEY (id),
  CONSTRAINT academy_tool_votes_user_tool_key UNIQUE (user_id, tool_id),
  CONSTRAINT academy_tool_votes_tool_id_check CHECK (tool_id ~ '^[a-z0-9-]+$')
);

-- Aggregate count index
CREATE INDEX IF NOT EXISTS academy_tool_votes_tool_id_idx
  ON public.academy_tool_votes (tool_id);

-- Learner vote lookup index
CREATE INDEX IF NOT EXISTS academy_tool_votes_user_id_idx
  ON public.academy_tool_votes (user_id);

-- No learner policies: reads and writes both go through the server API.
DROP POLICY IF EXISTS academy_tool_votes_select_own
  ON public.academy_tool_votes;
DROP POLICY IF EXISTS academy_tool_votes_insert_own
  ON public.academy_tool_votes;
DROP POLICY IF EXISTS academy_tool_votes_delete_own
  ON public.academy_tool_votes;

REVOKE ALL PRIVILEGES ON TABLE public.academy_tool_votes
  FROM PUBLIC, anon, authenticated;
DO $block$
DECLARE
  column_row record;
BEGIN
  FOR column_row IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'academy_tool_votes'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.academy_tool_votes FROM PUBLIC, anon, authenticated',
      column_row.column_name
    );
  END LOOP;
END;
$block$;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.academy_tool_votes TO service_role;

ALTER TABLE public.academy_tool_votes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
