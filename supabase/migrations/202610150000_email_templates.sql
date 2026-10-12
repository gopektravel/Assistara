-- Email Template Studio — centralized template library with versioning
-- Compatible with existing email_command_center schema

-- ---------------------------------------------------------------------------
-- 1. Template library (published templates used by senders)
-- ---------------------------------------------------------------------------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                    -- stable key: "masterclass_reminder_24h", "academy_accepted", etc.
  name text not null,                          -- human-readable: "Masterclass 24h Reminder"
  category text not null check (category in ('transactional', 'campaign', 'internal')),
  subject text not null,                       -- can contain {{variables}}
  preview_text text,                           -- optional preheader
  html text not null,                          -- full HTML (rendered by brandedEmail or custom)
  text_content text not null,                  -- plain text version
  sender_name text,                            -- override: "Assistara Academy", "Xyra from Assistara"
  sender_email text,                           -- override: "xyra@getassistara.com"
  reply_to text,                               -- override reply-to
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_critical boolean not null default false,  -- require confirmation before publish/delete
  version integer not null default 1,          -- published version number
  created_by text,                             -- admin user
  updated_by text,                             -- admin user
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists email_templates_category_idx on public.email_templates (category);
create index if not exists email_templates_status_idx on public.email_templates (status);

-- ---------------------------------------------------------------------------
-- 2. Template versions (full history for rollback)
-- ---------------------------------------------------------------------------
create table if not exists public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  version integer not null,
  subject text not null,
  preview_text text,
  html text not null,
  text_content text not null,
  sender_name text,
  sender_email text,
  reply_to text,
  change_summary text,                         -- what changed in this version
  created_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists email_template_versions_template_version_idx
  on public.email_template_versions (template_id, version);

create index if not exists email_template_versions_template_idx
  on public.email_template_versions (template_id, version desc);

-- ---------------------------------------------------------------------------
-- 3. Template variables (registry for validation + picker UI)
-- ---------------------------------------------------------------------------
create table if not exists public.email_template_variables (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  name text not null,                          -- variable name: "first_name", "join_url"
  label text not null,                         -- UI label: "First Name", "Join URL"
  description text,                            -- help text
  type text not null default 'string' check (type in ('string', 'url', 'number', 'date', 'boolean')),
  required boolean not null default false,     -- must be present for publish
  sample_value text,                           -- for preview: "Jesse", "https://getassistara.com/live?t=abc123"
  source_hint text,                            -- where it comes from: "signup.name", "generated token"
  sort_order integer not null default 0
);

create unique index if not exists email_template_variables_template_name_idx
  on public.email_template_variables (template_id, name);

-- ---------------------------------------------------------------------------
-- 4. Template drafts (work-in-progress, not used by senders)
-- ---------------------------------------------------------------------------
create table if not exists public.email_template_drafts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.email_templates(id) on delete cascade,  -- null for new templates
  name text not null,
  category text not null check (category in ('transactional', 'campaign', 'internal')),
  subject text not null,
  preview_text text,
  html text not null,
  text_content text not null,
  sender_name text,
  sender_email text,
  reply_to text,
  variables jsonb not null default '[]'::jsonb,  -- array of {name, label, description, type, required, sample_value, source_hint}
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. RLS + grants (service_role only, matching existing email tables)
-- ---------------------------------------------------------------------------
alter table public.email_templates enable row level security;
alter table public.email_template_versions enable row level security;
alter table public.email_template_variables enable row level security;
alter table public.email_template_drafts enable row level security;

revoke all on public.email_templates from anon, authenticated;
revoke all on public.email_template_versions from anon, authenticated;
revoke all on public.email_template_variables from anon, authenticated;
revoke all on public.email_template_drafts from anon, authenticated;

grant select, insert, update, delete on public.email_templates to service_role;
grant select, insert, update, delete on public.email_template_versions to service_role;
grant select, insert, update, delete on public.email_template_variables to service_role;
grant select, insert, update, delete on public.email_template_drafts to service_role;

-- ---------------------------------------------------------------------------
-- 6. Helper: get published template by key (used by Edge Functions)
-- ---------------------------------------------------------------------------
create or replace function public.email_get_template(p_key text)
returns table (
  id uuid,
  key text,
  name text,
  category text,
  subject text,
  preview_text text,
  html text,
  text_content text,
  sender_name text,
  sender_email text,
  reply_to text,
  version integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    t.id, t.key, t.name, t.category, t.subject, t.preview_text,
    t.html, t.text_content, t.sender_name, t.sender_email, t.reply_to, t.version
  from public.email_templates t
  where t.key = p_key
    and t.status = 'published';
end;
$$;

grant execute on function public.email_get_template(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Helper: create new version on publish
-- ---------------------------------------------------------------------------
create or replace function public.email_publish_template(
  p_template_id uuid,
  p_updated_by text,
  p_change_summary text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_new_version integer;
begin
  -- Get current template
  select * into v_template
  from public.email_templates
  where id = p_template_id;

  if not found then
    raise exception 'Template not found: %', p_template_id;
  end if;

  if v_template.status = 'published' then
    v_new_version := v_template.version + 1;
  else
    v_new_version := 1;
  end if;

  -- Archive current published version (if any)
  insert into public.email_template_versions (
    template_id, version, subject, preview_text, html, text_content,
    sender_name, sender_email, reply_to, change_summary, created_by
  ) values (
    v_template.id, v_template.version, v_template.subject, v_template.preview_text,
    v_template.html, v_template.text_content, v_template.sender_name,
    v_template.sender_email, v_template.reply_to, p_change_summary, p_updated_by
  );

  -- Update template to new version + published
  update public.email_templates
  set
    version = v_new_version,
    status = 'published',
    published_at = now(),
    updated_by = p_updated_by,
    updated_at = now()
  where id = p_template_id;
end;
$$;

grant execute on function public.email_publish_template(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Helper: rollback to previous version
-- ---------------------------------------------------------------------------
create or replace function public.email_rollback_template(
  p_template_id uuid,
  p_target_version integer,
  p_updated_by text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version record;
  v_current_version integer;
begin
  -- Get target version
  select * into v_version
  from public.email_template_versions
  where template_id = p_template_id and version = p_target_version;

  if not found then
    raise exception 'Version % not found for template %', p_target_version, p_template_id;
  end if;

  -- Get current version
  select version into v_current_version
  from public.email_templates
  where id = p_template_id;

  -- Archive current as new version
  insert into public.email_template_versions (
    template_id, version, subject, preview_text, html, text_content,
    sender_name, sender_email, reply_to, change_summary, created_by
  ) values (
    p_template_id, v_current_version + 1,
    (select subject from public.email_templates where id = p_template_id),
    (select preview_text from public.email_templates where id = p_template_id),
    (select html from public.email_templates where id = p_template_id),
    (select text_content from public.email_templates where id = p_template_id),
    (select sender_name from public.email_templates where id = p_template_id),
    (select sender_email from public.email_templates where id = p_template_id),
    (select reply_to from public.email_templates where id = p_template_id),
    'Rollback to version ' || p_target_version, p_updated_by
  );

  -- Restore target version
  update public.email_templates
  set
    subject = v_version.subject,
    preview_text = v_version.preview_text,
    html = v_version.html,
    text_content = v_version.text_content,
    sender_name = v_version.sender_name,
    sender_email = v_version.sender_email,
    reply_to = v_version.reply_to,
    version = v_current_version + 1,
    updated_by = p_updated_by,
    updated_at = now()
  where id = p_template_id;
end;
$$;

grant execute on function public.email_rollback_template(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Trigger: auto-update updated_at
-- ---------------------------------------------------------------------------
create or replace function public.email_templates_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_templates_updated_at on public.email_templates;
create trigger email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.email_templates_updated_at();

create or replace function public.email_template_drafts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_template_drafts_updated_at on public.email_template_drafts;
create trigger email_template_drafts_updated_at
  before update on public.email_template_drafts
  for each row execute function public.email_template_drafts_updated_at();

notify pgrst, 'reload schema';