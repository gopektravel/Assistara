-- ---------------------------------------------------------------------------
-- Assistara Remote Income Potential Quiz
-- Session, result, consent and funnel-event storage.
--
-- Design notes
--   * Additive only: touches no existing table, no existing application,
--     payment, coupon, enrolment or email record.
--   * Service-role only. RLS is enabled on every table and no policy grants
--     anything to anon or authenticated, so no personal lead record is ever
--     publicly readable, even by guessing an id.
--   * The quiz is a marketing assessment, not an application. Application,
--     acceptance, checkout and paid status are NOT denormalised into these
--     tables, because a copy would go stale the moment an admin changed a
--     decision. They are read live through the `application_id` foreign key.
--   * Report access uses a random token whose SHA-256 hash is stored. The raw
--     token only ever exists in the results link, never in the database, so it
--     cannot be recovered by reading a row.
--   * Answers are validated server-side before insert and are constrained by a
--     CHECK on the shape of the object.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Quiz sessions: anonymous progress, survives a refresh.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,                 -- opaque id held in the visitor's browser
  rate_key text,                            -- HMAC of the client address, never the raw address
  current_question integer not null default 1 check (current_question between 1 and 10),
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'started' check (status in ('started', 'in_progress', 'completed', 'abandoned')),
  client_elapsed_ms integer,                -- used for spam heuristics, never shown to the visitor
  honeypot text,                            -- must stay empty; a filled field is spam
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  -- attribution carried through the funnel
  acquisition_visit_id uuid,
  acquisition_visitor_id text,
  tracking_token text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_path text,
  referrer text,
  constraint quiz_sessions_client_key_unique unique (client_key)
);

create index if not exists quiz_sessions_status_idx on public.quiz_sessions (status, started_at desc);
create index if not exists quiz_sessions_rate_idx on public.quiz_sessions (rate_key, started_at desc);
create index if not exists quiz_sessions_visit_idx on public.quiz_sessions (acquisition_visit_id);
create index if not exists quiz_sessions_visitor_idx on public.quiz_sessions (acquisition_visitor_id);

-- ---------------------------------------------------------------------------
-- 2. Quiz results: completed attempt + lead + report.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.quiz_sessions(id) on delete set null,
  idempotency_key text not null,            -- same payload submitted twice => one row
  -- contact + consent (marketing consent is optional and defaults to false)
  first_name text,
  email text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  consent_source text,                      -- e.g. 'quiz_results_form_v1'
  contact_id uuid,                          -- existing Assistara contacts identity
  -- answers and derived outcomes
  answers jsonb not null,
  scores jsonb not null default '{}'::jsonb,
  primary_career text not null,
  secondary_career text,
  readiness_stage integer not null check (readiness_stage between 1 and 5),
  readiness_key text not null,
  income_goal_php integer,
  weekly_hours integer,
  obstacle text,
  start_timeline text,
  -- Acquisition lead priority: an operational follow-up ranking, computed once
  -- at submit time from what the person actually said. Stored (not derived on
  -- read) so every surface shows the same number, and the reason breakdown is
  -- kept so it can always be explained. The income goal is deliberately not a
  -- component; see LEAD_PRIORITY in api/_quiz-engine.js.
  lead_priority integer not null default 0,
  lead_priority_band text not null default 'cool',
  lead_priority_reasons jsonb not null default '[]'::jsonb,
  report jsonb not null,
  scoring_version text not null,
  report_version text not null,
  -- secure report access
  result_token_hash text not null unique,
  result_token_expires_at timestamptz not null,
  result_view_count integer not null default 0,
  last_viewed_at timestamptz,
  -- results email delivery state (never gates showing the result on-page)
  email_state text not null default 'not_requested'
    check (email_state in ('not_requested', 'requested', 'sending', 'sent', 'failed', 'suppressed')),
  email_error text,
  email_sent_at timestamptz,
  email_attempts integer not null default 0,
  -- academy linkage: statuses are read live from academy_applications
  application_id uuid,
  -- Acquisition attribution, denormalised onto the result at submit time.
  -- quiz_sessions carries the same three columns, but the session link is
  -- nullable and a result can outlive its session, so a result that cannot
  -- answer "which campaign produced me" would be silently unattributable.
  -- Every admin surface reads these directly, exactly as academy_applications
  -- and masterclass_signups already do.
  acquisition_visit_id uuid,
  acquisition_visitor_id text,
  tracking_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_results_idempotency_unique unique (idempotency_key)
);

create index if not exists quiz_results_acquisition_visit_idx on public.quiz_results (acquisition_visit_id);
create index if not exists quiz_results_visitor_idx on public.quiz_results (acquisition_visitor_id);
create index if not exists quiz_results_token_idx on public.quiz_results (tracking_token);

create index if not exists quiz_results_created_idx on public.quiz_results (created_at desc);
create index if not exists quiz_results_email_idx on public.quiz_results (lower(email));
create index if not exists quiz_results_career_idx on public.quiz_results (primary_career, created_at desc);
create index if not exists quiz_results_consent_idx on public.quiz_results (marketing_consent, created_at desc);
create index if not exists quiz_results_session_idx on public.quiz_results (session_id);
create index if not exists quiz_results_application_idx on public.quiz_results (application_id);
create index if not exists quiz_results_visit_idx on public.quiz_results (session_id);

-- ---------------------------------------------------------------------------
-- 3. Funnel events: analytics with an idempotency key so a repeated event
--    (a re-render, a back button, a double click) is never double counted.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,                  -- dedupe key supplied by the client
  event text not null,                      -- landing_viewed, started, question_completed ...
  question_number integer,
  session_id uuid references public.quiz_sessions(id) on delete set null,
  result_id uuid references public.quiz_results(id) on delete set null,
  acquisition_visit_id uuid,
  acquisition_visitor_id text,
  tracking_token text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint quiz_events_key_unique unique (event_key)
);

create index if not exists quiz_events_event_idx on public.quiz_events (event, occurred_at desc);
create index if not exists quiz_events_time_idx on public.quiz_events (occurred_at desc);
create index if not exists quiz_events_visitor_idx on public.quiz_events (acquisition_visitor_id);

-- ---------------------------------------------------------------------------
-- 4. Referrals: a share-card referral resolves back to a result.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_referrals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  created_at timestamptz not null default now(),
  visits integer not null default 0,
  last_visit_at timestamptz
);

create index if not exists quiz_referrals_result_idx on public.quiz_referrals (result_id);

-- ---------------------------------------------------------------------------
-- 5. Constraints and triggers
-- ---------------------------------------------------------------------------
-- Answers must be an object; the server validates every key before writing.
alter table public.quiz_results
  drop constraint if exists quiz_results_answers_is_object;
alter table public.quiz_results
  add constraint quiz_results_answers_is_object
  check (jsonb_typeof(answers) = 'object' and jsonb_typeof(report) = 'object');

-- Consent is recorded only when it is true; an absent timestamp with consent
-- true is a data-integrity error, not a silent opt-in.
alter table public.quiz_results
  drop constraint if exists quiz_results_consent_timestamp;
alter table public.quiz_results
  add constraint quiz_results_consent_timestamp
  check (marketing_consent = false or marketing_consent_at is not null);

-- Never store the raw report token, only its hash.
alter table public.quiz_results
  drop constraint if exists quiz_results_token_is_hash;
alter table public.quiz_results
  add constraint quiz_results_token_is_hash
  check (length(result_token_hash) between 32 and 128);

create or replace function public.quiz_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quiz_results_touch on public.quiz_results;
create trigger quiz_results_touch
  before update on public.quiz_results
  for each row execute function public.quiz_touch_updated_at();

drop trigger if exists quiz_sessions_touch on public.quiz_sessions;
create trigger quiz_sessions_touch
  before update on public.quiz_sessions
  for each row execute function public.quiz_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security: service role only, no public read.
-- ---------------------------------------------------------------------------
alter table public.quiz_sessions enable row level security;
alter table public.quiz_results  enable row level security;
alter table public.quiz_events   enable row level security;
alter table public.quiz_referrals enable row level security;

-- Drop any policy that could expose lead records to a public role.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('quiz_sessions', 'quiz_results', 'quiz_events', 'quiz_referrals')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- No policy at all => anon and authenticated are blocked entirely.
revoke all on public.quiz_sessions from public, anon, authenticated;
revoke all on public.quiz_results  from public, anon, authenticated;
revoke all on public.quiz_events   from public, anon, authenticated;
revoke all on public.quiz_referrals from public, anon, authenticated;

grant select, insert, update, delete on public.quiz_sessions  to service_role;
grant select, insert, update, delete on public.quiz_results   to service_role;
grant select, insert, update, delete on public.quiz_events    to service_role;
grant select, insert, update, delete on public.quiz_referrals  to service_role;

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------
-- Cleanup: removes abandoned anonymous sessions and expired report tokens.
-- Called on a schedule from the quiz API; safe to run repeatedly.
create or replace function public.quiz_cleanup_expired(p_retention_days integer default 30)
returns table (sessions_deleted integer, results_expired integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  s integer;
  r integer;
begin
  delete from public.quiz_sessions
  where status in ('started', 'in_progress', 'abandoned')
    and started_at < now() - make_interval(days => greatest(1, p_retention_days));
  get diagnostics s = row_count;

  update public.quiz_results
     set email_state = 'not_requested',
         result_token_hash = encode(sha256(('expired:' || id::text || clock_timestamp()::text)::bytea), 'hex'),
         result_token_expires_at = now()
   where result_token_expires_at < now()
     and email_state in ('sent', 'failed', 'not_requested');
  get diagnostics r = row_count;

  return query select s, r;
end;
$$;

revoke execute on function public.quiz_cleanup_expired(integer) from public, anon, authenticated;
grant execute on function public.quiz_cleanup_expired(integer) to service_role;

-- Aggregate used by the admin quiz overview so counts come from the database
-- rather than being assembled in the browser.
create or replace function public.quiz_funnel_summary(p_since timestamptz default null)
returns table (
  metric text,
  value bigint
)
language sql
security definer
set search_path = public
as $$
  with since as (select coalesce(p_since, now() - interval '30 days') as s)
  select * from (
    select 'landing_views'::text, count(*)::bigint from public.quiz_events, since
      where event = 'landing_viewed' and occurred_at >= since.s
    union all
    select 'starts', count(*) from public.quiz_events, since
      where event = 'started' and occurred_at >= since.s
    union all
    select 'completions', count(*) from public.quiz_results, since
      where created_at >= since.s
    union all
    select 'leads', count(*) from public.quiz_results, since
      where created_at >= since.s and email is not null
    union all
    select 'consented', count(*) from public.quiz_results, since
      where created_at >= since.s and marketing_consent = true
    union all
    select 'emails_sent', count(*) from public.quiz_results, since
      where created_at >= since.s and email_state = 'sent'
    union all
    select 'linked_applications', count(*) from public.quiz_results, since
      where created_at >= since.s and application_id is not null
  ) t(metric, value);
$$;

revoke execute on function public.quiz_funnel_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.quiz_funnel_summary(timestamptz) to service_role;
