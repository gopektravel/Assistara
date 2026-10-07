-- Founding Cohort community join state is learner-owned but server-persisted.
-- The dashboard may optimistically show the Community card, but the
-- authoritative "I've joined" confirmation is written ONLY by the Vercel API
-- (api/academy-community.js) under the service role, exactly like quick-check
-- drafts and class completion. Learners get no direct INSERT/UPDATE/DELETE
-- path; the dashboard's join state always round-trips through the API.

CREATE TABLE IF NOT EXISTS public.academy_student_community (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_joined boolean NOT NULL DEFAULT false,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_student_community_pkey PRIMARY KEY (user_id),
  CONSTRAINT academy_student_community_join_consistency CHECK (
    (community_joined AND joined_at IS NOT NULL)
    OR (NOT community_joined AND joined_at IS NULL)
  )
);

-- No learner policies: reads and writes both go through the server API.
DROP POLICY IF EXISTS academy_student_community_select_own
  ON public.academy_student_community;

REVOKE ALL PRIVILEGES ON TABLE public.academy_student_community
  FROM PUBLIC, anon, authenticated;
DO $block$
DECLARE
  column_row record;
BEGIN
  FOR column_row IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'academy_student_community'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.academy_student_community FROM PUBLIC, anon, authenticated',
      column_row.column_name
    );
  END LOOP;
END;
$block$;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.academy_student_community TO service_role;

CREATE OR REPLACE FUNCTION public.academy_student_community_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.academy_student_community_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS academy_student_community_set_updated_at
  ON public.academy_student_community;
CREATE TRIGGER academy_student_community_set_updated_at
  BEFORE UPDATE ON public.academy_student_community
  FOR EACH ROW
  EXECUTE FUNCTION public.academy_student_community_touch_updated_at();

ALTER TABLE public.academy_student_community ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';