-- Server-only Academy entitlement predicate. Auth user validity is checked by
-- the calling server function before this database predicate is evaluated.
CREATE OR REPLACE FUNCTION public.academy_has_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    count(*) = 1
    AND coalesce(
      bool_and(
        a.status = 'onboarded'
        AND a.payment_status = 'paid'
        AND a.onboarding_completed_at IS NOT NULL
        AND a.suspended_at IS NULL
      ),
      false
    )
  FROM public.academy_applications AS a
  WHERE p_user_id IS NOT NULL
    AND a.auth_user_id = p_user_id;
$function$;

REVOKE ALL ON FUNCTION public.academy_has_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_has_access(uuid) TO service_role;

COMMENT ON FUNCTION public.academy_has_access(uuid) IS
  'Server-only exact Academy entitlement predicate; denies zero or duplicate auth_user_id bindings.';

-- Learners must not be able to forge authoritative exam outcomes. Preserve
-- existing SELECT grants/policies and leave the existing exam index untouched.
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.academy_exam_attempts
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS students_insert_own_exam_attempts
  ON public.academy_exam_attempts;

DO $block$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'academy_exam_attempts'
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.academy_exam_attempts FROM PUBLIC, anon, authenticated',
      col.column_name
    );
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.academy_exam_attempts FROM PUBLIC, anon, authenticated',
      col.column_name
    );
  END LOOP;
END;
$block$;

GRANT INSERT ON TABLE public.academy_exam_attempts TO service_role;

NOTIFY pgrst, 'reload schema';
