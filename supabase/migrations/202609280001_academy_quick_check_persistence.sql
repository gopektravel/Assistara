-- Quick Check drafts are learner-owned UI state. Class completion is server-owned.
-- This migration does not alter academy_exam_attempts or its policies.

CREATE TABLE IF NOT EXISTS public.academy_quick_check_drafts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_key text NOT NULL,
  question_set_version text NOT NULL,
  state jsonb NOT NULL DEFAULT '{"schema_version":1,"selections":{},"last_checked_selections":{}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_quick_check_drafts_pkey PRIMARY KEY (user_id, class_key),
  CONSTRAINT academy_quick_check_drafts_class_key_format
    CHECK (class_key ~ '^p[1-4]m[1-9][0-9]*c[1-9][0-9]*$'),
  CONSTRAINT academy_quick_check_drafts_state_object
    CHECK (
      jsonb_typeof(state) = 'object'
      AND jsonb_typeof(state -> 'schema_version') = 'number'
      AND jsonb_typeof(state -> 'selections') = 'object'
      AND jsonb_typeof(state -> 'last_checked_selections') = 'object'
    ),
  CONSTRAINT academy_quick_check_drafts_schema_version_positive
    CHECK ((state ->> 'schema_version')::integer > 0)
);

ALTER TABLE public.academy_quick_check_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academy_quick_check_drafts_select_own
  ON public.academy_quick_check_drafts;
DROP POLICY IF EXISTS academy_quick_check_drafts_insert_own
  ON public.academy_quick_check_drafts;
DROP POLICY IF EXISTS academy_quick_check_drafts_update_own
  ON public.academy_quick_check_drafts;
DROP POLICY IF EXISTS academy_quick_check_drafts_delete_own
  ON public.academy_quick_check_drafts;

-- Draft reads, writes and cleanup are server-only through the API (service_role).

REVOKE ALL PRIVILEGES ON TABLE public.academy_quick_check_drafts
  FROM PUBLIC, anon, authenticated;
DO $block$
DECLARE
  column_row record;
BEGIN
  FOR column_row IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'academy_quick_check_drafts'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.academy_quick_check_drafts FROM PUBLIC, anon, authenticated',
      column_row.column_name
    );
  END LOOP;
END;
$block$;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.academy_quick_check_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.academy_quick_check_drafts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.academy_quick_check_drafts_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS academy_quick_check_drafts_set_updated_at
  ON public.academy_quick_check_drafts;
CREATE TRIGGER academy_quick_check_drafts_set_updated_at
  BEFORE UPDATE ON public.academy_quick_check_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.academy_quick_check_drafts_touch_updated_at();

-- Preserve every existing progress row. Remove all existing policies so no
-- permissive INSERT/UPDATE/DELETE/ALL policy can survive; recreate own SELECT.
DO $block$
DECLARE
  policy_row record;
  column_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'academy_class_progress'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.academy_class_progress',
      policy_row.policyname
    );
  END LOOP;

  -- Column-level grants can survive table-level revokes. Clear learner SELECT
  -- and write grants before restoring authenticated's own-row table SELECT.
  FOR column_row IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'academy_class_progress'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I) ON TABLE public.academy_class_progress FROM PUBLIC, anon, authenticated',
      column_row.column_name
    );
  END LOOP;
END;
$block$;

ALTER TABLE public.academy_class_progress ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.academy_class_progress
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.academy_class_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.academy_class_progress TO service_role;

CREATE POLICY academy_class_progress_select_own
  ON public.academy_class_progress
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- The API grades against its private question bank, then calls this function.
-- The database transaction writes completion and removes the draft atomically.
CREATE OR REPLACE FUNCTION public.academy_complete_class(p_user_id uuid, p_class_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_user_id IS NULL
     OR p_class_key IS NULL
     OR p_class_key !~ '^p[1-4]m[1-9][0-9]*c[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'Invalid class completion target' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.academy_class_progress AS existing
    (user_id, class_key, completed, completed_at, updated_at)
  VALUES
    (p_user_id, p_class_key, true, now(), now())
  ON CONFLICT (user_id, class_key) DO UPDATE
    SET completed = true,
        completed_at = CASE
          WHEN existing.completed THEN existing.completed_at
          ELSE now()
        END,
        updated_at = now();

  DELETE FROM public.academy_quick_check_drafts
  WHERE user_id = p_user_id
    AND class_key = p_class_key;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.academy_complete_class(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_complete_class(uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
