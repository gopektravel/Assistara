-- Server-owned exam attempt persistence.
--
-- LOCAL ONLY. This file has not been applied to any Supabase instance and must
-- not be applied without human review.
--
-- academy_exam_attempts already exists in production. Migration
-- 202609270001_academy_access_and_exam_write_lockdown.sql already revoked
-- INSERT/UPDATE/DELETE from PUBLIC, anon and authenticated, granted INSERT to
-- service_role, and preserved the existing own-row SELECT policy that the
-- dashboard's loadProgress() read depends on. This migration therefore does NOT
-- create the table and does NOT change its grants, policies or index. It only
-- adds the missing write path:
--
--   * asserts the column contract the exam endpoint and the dashboard rely on,
--     and adds a column only if an older instance is genuinely missing one, and
--   * adds academy_record_exam_attempt(), a service_role-only function the exam
--     endpoint calls after it grades. Learners keep no write path at all, so a
--     score, a `passed` flag, or a phase unlock cannot be forged from a browser.
--
-- Every attempt is appended, never updated. A retake adds a row and the highest
-- score wins, so a learner cannot erase an earlier fail by retaking.

-- ---------------------------------------------------------------------------
-- 1. Column contract.
DO $block$
DECLARE
  present  text[];
  required text[] := ARRAY['user_id', 'exam_key', 'score', 'passed'];
  column_name text;
BEGIN
  IF to_regclass('public.academy_exam_attempts') IS NULL THEN
    RAISE EXCEPTION
      'public.academy_exam_attempts is missing. Expected a table created outside this repository; review before applying.'
      USING ERRCODE = '42P01';
  END IF;

  SELECT coalesce(array_agg(c.column_name::text ORDER BY c.column_name), '{}')
    INTO present
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'academy_exam_attempts';

  FOREACH column_name IN ARRAY required LOOP
    IF NOT (column_name = ANY (present)) THEN
      RAISE EXCEPTION
        'public.academy_exam_attempts is missing the required column "%". Found: %. Review the production shape before applying.',
        column_name, present
        USING ERRCODE = '42703';
    END IF;
  END LOOP;

  -- The dashboard SELECTs these two. Add them only when an older instance is
  -- missing them, so the read in loadProgress() cannot fail on a null column.
  IF NOT ('passing_score'::text = ANY (present)) THEN
    ALTER TABLE public.academy_exam_attempts
      ADD COLUMN IF NOT EXISTS passing_score integer;
  END IF;
  IF NOT ('attempted_at'::text = ANY (present)) THEN
    ALTER TABLE public.academy_exam_attempts
      ADD COLUMN IF NOT EXISTS attempted_at timestamptz NOT NULL DEFAULT now();
  END IF;
END;
$block$;

-- ---------------------------------------------------------------------------
-- 2. Server-owned write path.
CREATE OR REPLACE FUNCTION public.academy_record_exam_attempt(
  p_user_id       uuid,
  p_exam_key      text,
  p_exam_version  text,
  p_score         integer,
  p_passing_score integer,
  p_passed        boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_passed boolean;
BEGIN
  IF p_user_id IS NULL
     OR p_exam_key IS NULL
     OR p_exam_version IS NULL
     OR p_score IS NULL
     OR p_passing_score IS NULL
     OR p_passed IS NULL THEN
    RAISE EXCEPTION 'Invalid exam attempt' USING ERRCODE = '22023';
  END IF;

  -- Only the five assessments this Academy defines may be recorded.
  IF p_exam_key !~ '^(phase_[1-4]|final)$' THEN
    RAISE EXCEPTION 'Unknown exam key' USING ERRCODE = '22023';
  END IF;

  IF p_score < 0 OR p_score > 100 OR p_passing_score < 0 OR p_passing_score > 100 THEN
    RAISE EXCEPTION 'Exam score out of range' USING ERRCODE = '22023';
  END IF;

  -- The pass decision is derived here, not trusted from the caller: a bug or a
  -- tampered request in the API layer still cannot write a `passed` row that
  -- the server did not compute from the same threshold.
  v_passed := (p_score >= p_passing_score);
  IF v_passed IS DISTINCT FROM p_passed THEN
    RAISE EXCEPTION 'Exam pass flag does not match the recorded threshold' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.academy_exam_attempts
    (user_id, exam_key, score, passing_score, passed, attempted_at)
  VALUES
    (p_user_id, p_exam_key, p_score, p_passing_score, v_passed, now());

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.academy_record_exam_attempt(uuid, text, text, integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_record_exam_attempt(uuid, text, text, integer, integer, boolean)
  TO service_role;

COMMENT ON FUNCTION public.academy_record_exam_attempt(uuid, text, text, integer, integer, boolean) IS
  'Server-only exam attempt append. Called by /api/academy-exam after it grades against the private bank; derives `passed` from score >= passing_score and never updates or deletes an existing attempt.';

NOTIFY pgrst, 'reload schema';
