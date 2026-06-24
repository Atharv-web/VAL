-- Supabase schema for the Lennox voice sales agent storage layer.
-- Run this once in the Supabase SQL editor (or via the Supabase CLI) before
-- pointing the backend at SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
--
-- The backend connects with the service_role key, which bypasses Row Level
-- Security. RLS is therefore left disabled here; do NOT expose these tables to
-- the anon/publishable key.

-- ── Conversation history ─────────────────────────────────────────────
-- One row per message. `message` holds the raw { role, content, ... } object.
create table if not exists public.conversation_messages (
  id            bigint generated always as identity primary key,
  session_token text        not null,
  message       jsonb       not null,
  created_at    timestamptz not null default now()
);

create index if not exists conversation_messages_session_idx
  on public.conversation_messages (session_token, id);

-- ── Session state + valid-session metadata ───────────────────────────
-- One row per session_token. `valid_session` mirrors the validSessions map
-- value; `state` mirrors the orchestrator/turn state. Both are jsonb.
create table if not exists public.voice_sessions (
  session_token text        primary key,
  valid_session jsonb,
  state         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  expires_at    timestamptz
);

create index if not exists voice_sessions_expires_idx
  on public.voice_sessions (expires_at);

-- ── Competitor catalog ───────────────────────────────────────────────
-- One row per competitor model. `data` holds the full competitor object as
-- consumed by the comparison engine; the tier JSON files are the seed source.
create table if not exists public.competitors (
  model_id   text        primary key,
  tier       text,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);
