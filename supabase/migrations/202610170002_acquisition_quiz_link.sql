-- ----------------------------------------------------------------------------
-- Remote Income Potential Quiz: link quiz completions into the existing
-- acquisition tracking model.
--
-- The acquisition tables (acquisition_links / acquisition_visits /
-- acquisition_performance) predate the migrations in this repository and are
-- therefore NOT created here. This migration only extends what is already
-- there, and every statement is guarded so applying it to an environment that
-- does not yet have those tables is a no-op rather than a failure.
--
-- Design note: quiz_results already carries acquisition_visit_id,
-- acquisition_visitor_id and tracking_token, so quiz -> campaign resolution
-- works with or without this column. What it adds is the reverse edge that
-- the Acquisition Tracker's per-link visitor drill-down needs, matching the
-- existing signup_id / application_id / b2b_lead_id pattern exactly.
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.acquisition_visits') is null then
    raise notice 'acquisition_visits not present; skipping quiz link column';
    return;
  end if;

  -- The completion that happened on this visit, if any. One visit may have
  -- many quiz_sessions, but only one saved result, which is what this points
  -- at. Deleting a result nulls the link rather than the visit.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'acquisition_visits'
      and column_name = 'quiz_result_id'
  ) then
    alter table public.acquisition_visits
      add column quiz_result_id uuid;
  end if;

  -- The per-link drill-down filters on this, so it needs an index like the
  -- other conversion columns.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'acquisition_visits'
      and indexname = 'acquisition_visits_quiz_result_idx'
  ) then
    create index acquisition_visits_quiz_result_idx
      on public.acquisition_visits (quiz_result_id);
  end if;
end $$;

-- A FK is only safe if the target table exists in this environment. Guarded
-- separately so a partially-migrated database still applies cleanly.
do $$
begin
  if to_regclass('public.acquisition_visits') is null
     or to_regclass('public.quiz_results') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'acquisition_visits'
      and constraint_name = 'acquisition_visits_quiz_result_fk'
  ) then
    alter table public.acquisition_visits
      add constraint acquisition_visits_quiz_result_fk
      foreign key (quiz_result_id)
      references public.quiz_results (id)
      on delete set null;
  end if;
end $$;
