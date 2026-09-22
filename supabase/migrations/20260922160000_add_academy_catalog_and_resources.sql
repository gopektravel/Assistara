create table if not exists public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  title text not null,
  description text,
  sort_order integer not null check (sort_order > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.academy_modules(id) on delete cascade,
  lesson_key text not null unique,
  title text not null,
  description text,
  sort_order integer not null check (sort_order > 0),
  estimated_minutes integer check (estimated_minutes > 0),
  pass_score integer not null default 80 check (pass_score between 0 and 100),
  video_provider text,
  video_reference text,
  video_status text not null default 'planned' check (video_status in ('planned', 'ready', 'published')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, sort_order)
);

create table if not exists public.academy_lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  title text not null,
  description text,
  resource_type text not null check (resource_type in ('slides', 'workbook', 'template', 'exercise', 'other')),
  storage_provider text not null check (storage_provider in ('google_drive', 'supabase_storage', 'external')),
  provider_file_id text,
  provider_path text,
  mime_type text,
  downloadable boolean not null default true,
  audience text not null default 'student' check (audience in ('student', 'instructor', 'internal')),
  sort_order integer not null default 1 check (sort_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (storage_provider = 'google_drive' and provider_file_id is not null)
    or (storage_provider <> 'google_drive' and (provider_file_id is not null or provider_path is not null))
  ),
  unique (lesson_id, audience, sort_order)
);

alter table public.academy_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_lesson_resources enable row level security;

grant select on public.academy_modules, public.academy_lessons, public.academy_lesson_resources to anon, authenticated;

create policy "Public can read published Academy modules"
  on public.academy_modules for select to anon, authenticated
  using (published = true);

create policy "Public can read published Academy lessons"
  on public.academy_lessons for select to anon, authenticated
  using (published = true);

create policy "Public can read active student Academy resources"
  on public.academy_lesson_resources for select to anon, authenticated
  using (is_active = true and audience = 'student');

insert into public.academy_modules (module_key, title, description, sort_order, published)
values ('core-admin-delivery', 'Core Admin Delivery', 'Handle client inboxes, calendars and files with clarity and care.', 3, true)
on conflict (module_key) do update
set title = excluded.title,
    description = excluded.description,
    sort_order = excluded.sort_order,
    published = excluded.published,
    updated_at = now();

insert into public.academy_lessons (
  module_id, lesson_key, title, description, sort_order, estimated_minutes, pass_score, video_status, published
)
select id, 'core-admin-client-inbox-workflow', 'Build a Client Inbox Workflow',
       'Turn a busy inbox into clear actions, calm communication and reliable follow-through.',
       2, 10, 80, 'planned', true
from public.academy_modules
where module_key = 'core-admin-delivery'
on conflict (lesson_key) do update
set title = excluded.title,
    description = excluded.description,
    sort_order = excluded.sort_order,
    estimated_minutes = excluded.estimated_minutes,
    pass_score = excluded.pass_score,
    video_status = excluded.video_status,
    published = excluded.published,
    updated_at = now();

insert into public.academy_lesson_resources (
  lesson_id, title, description, resource_type, storage_provider, provider_file_id, mime_type, downloadable, audience, sort_order, is_active
)
select l.id, resource.title, resource.description, resource.resource_type, 'google_drive', resource.provider_file_id,
       'application/pdf', true, 'student', resource.sort_order, true
from public.academy_lessons l
cross join (
  values
    ('Client Inbox Workflow Checklist', 'PDF · Student resource', 'workbook', '1a2tWVZzgVnJelwxVcayhc-6pHDhx-CfK', 1),
    ('Build a Client Inbox Workflow — Lesson Slides', 'PDF · Student lesson slides', 'slides', '1KP0rf8Li40WndjuEgk-NfqWhXip4naju', 2)
) as resource(title, description, resource_type, provider_file_id, sort_order)
where l.lesson_key = 'core-admin-client-inbox-workflow'
on conflict (lesson_id, audience, sort_order) do update
set title = excluded.title,
    description = excluded.description,
    resource_type = excluded.resource_type,
    storage_provider = excluded.storage_provider,
    provider_file_id = excluded.provider_file_id,
    mime_type = excluded.mime_type,
    downloadable = excluded.downloadable,
    is_active = excluded.is_active,
    updated_at = now();
