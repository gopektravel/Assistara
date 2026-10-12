-- Masterclass live-chat session audit.
--
-- The live chat itself is deliberately temporary: the Railway WebSocket server
-- keeps only the CURRENT session in memory and an admin close/reset discards it
-- (see assistara-chat-worker/railway-server.js). That discard must never destroy
-- the record of what was said.
--
-- ADDITIVE ONLY. Nothing here touches masterclass_events, signups or any other
-- existing table. It adds two archive tables the Vercel API writes to (under the
-- service role) every time it resets a chat session:
--
--   * masterclass_chat_messages  one row per message of a closed session,
--                                idempotent by the client-generated message id
--   * masterclass_chat_sessions  one row per (generation) session id, so an
--                                audit can list sessions and their sizes
--
-- These rows are for audit only. The public page and the chat widget never read
-- them: the active chat is served exclusively by the Railway server, which only
-- ever holds the current session. Old rows therefore cannot "reappear".
--
-- Read/write policy: server-only. There are no anon/authenticated policies and
-- the tables are revoked from every browser-facing role; the service role (the
-- Vercel API) is the only writer.

-- ---------------------------------------------------------------------------
-- 1. Archived messages (one row per message, deduplicated by message id)
-- ---------------------------------------------------------------------------
create table if not exists public.masterclass_chat_messages (
  id text not null,
  room_id text not null default 'founding-masterclass-2026',
  -- generation counter of the session this message belonged to
  session_id bigint not null default 0,
  user_name text not null default '',
  user_id text not null default '',
  role text not null default 'attendee',
  content text not null default '',
  -- raw client/server epoch (ms) and its readable form
  sent_at_ms bigint,
  sent_at timestamptz,
  -- why the session ended: close | reset | end | manual | start | unknown
  archived_reason text not null default 'reset',
  archived_at timestamptz not null default now(),
  constraint masterclass_chat_messages_pkey primary key (id)
);

create index if not exists masterclass_chat_messages_session_idx
  on public.masterclass_chat_messages (room_id, session_id);
create index if not exists masterclass_chat_messages_archived_idx
  on public.masterclass_chat_messages (archived_at desc);

-- ---------------------------------------------------------------------------
-- 2. Archived sessions (one row per generation / session id)
-- ---------------------------------------------------------------------------
create table if not exists public.masterclass_chat_sessions (
  session_id bigint not null,
  room_id text not null default 'founding-masterclass-2026',
  -- when the archive last saw this session (first/last archive attempt)
  archived_at timestamptz not null default now(),
  closed_reason text,
  message_count integer not null default 0,
  constraint masterclass_chat_sessions_pkey primary key (session_id)
);

create index if not exists masterclass_chat_sessions_room_idx
  on public.masterclass_chat_sessions (room_id, archived_at desc);

-- ---------------------------------------------------------------------------
-- 3. Server-only access (no browser policies; revocation is explicit)
-- ---------------------------------------------------------------------------
revoke all privileges on table public.masterclass_chat_messages
  from public, anon, authenticated;
revoke all privileges on table public.masterclass_chat_sessions
  from public, anon, authenticated;

do $block$
declare
  column_row record;
begin
  for column_row in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'masterclass_chat_messages'
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table public.masterclass_chat_messages from public, anon, authenticated',
      column_row.column_name
    );
  end loop;
  for column_row in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'masterclass_chat_sessions'
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table public.masterclass_chat_sessions from public, anon, authenticated',
      column_row.column_name
    );
  end loop;
end;
$block$;

grant select, insert, update, delete
  on table public.masterclass_chat_messages to service_role;
grant select, insert, update, delete
  on table public.masterclass_chat_sessions to service_role;

alter table public.masterclass_chat_messages enable row level security;
alter table public.masterclass_chat_sessions enable row level security;

notify pgrst, 'reload schema';
