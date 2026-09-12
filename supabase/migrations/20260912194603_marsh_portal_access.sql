create table if not exists public.marsh_portal_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 80),
  role text not null check (role in ('admin', 'partner')),
  pin_salt text not null,
  pin_hash text not null unique,
  active boolean not null default true,
  last_login timestamptz,
  login_count integer not null default 0 check (login_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.marsh_login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.marsh_portal_users(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  ip_address text
);

create table if not exists public.marsh_pin_attempts (
  ip_address text primary key,
  failed_count integer not null default 0 check (failed_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.marsh_portal_users enable row level security;
alter table public.marsh_login_events enable row level security;
alter table public.marsh_pin_attempts enable row level security;

revoke all on public.marsh_portal_users from anon, authenticated;
revoke all on public.marsh_login_events from anon, authenticated;
revoke all on public.marsh_pin_attempts from anon, authenticated;

create index if not exists marsh_login_events_user_time_idx on public.marsh_login_events(user_id, logged_in_at desc);
