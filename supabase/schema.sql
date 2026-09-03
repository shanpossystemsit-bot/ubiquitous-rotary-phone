-- SHAN POS SYSTEMS / Netlify + Supabase persistence
create extension if not exists pgcrypto;

create table if not exists public.app_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_cache (
  key text primary key,
  value text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  path text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists documents_path_idx on public.documents(path text_pattern_ops);

create table if not exists public.app_files (
  id text primary key,
  name text not null,
  mime text not null,
  bytes text not null,
  folder_id text,
  created_at timestamptz not null default now(),
  trashed boolean not null default false
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id text,
  shop_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Master-controlled workflow notifications.  A notification is not a grant of
-- customer access: only the Master can issue a separate temporary session.
create table if not exists public.master_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'OPEN',
  customer_shop_code text,
  support_account_id text,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);
create index if not exists master_notifications_created_idx on public.master_notifications(created_at desc);
create index if not exists master_notifications_customer_idx on public.master_notifications(customer_shop_code, created_at desc);

alter table public.app_kv enable row level security;
alter table public.app_cache enable row level security;
alter table public.documents enable row level security;
alter table public.app_files enable row level security;
alter table public.audit_log enable row level security;
alter table public.master_notifications enable row level security;

-- Runtime access is server-only through the Supabase service role key.
-- The service role bypasses RLS. No service-role key is exposed to the browser.
