create table public.marsh_portal_notice (
 account_slug text primary key check (account_slug = 'marsh-supply'),
 revision uuid not null unique,
 title text not null default '' check (length(title) <= 160),
 message text not null default '' check (length(message) <= 5000),
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid references public.marsh_portal_users(id) on delete set null,
 check (not enabled or (length(trim(title)) > 0 and length(trim(message)) > 0))
);
create table public.marsh_notice_acknowledgments (
 revision uuid not null,
 user_id uuid not null references public.marsh_portal_users(id) on delete cascade,
 acknowledged_at timestamptz not null default now(),
 primary key (revision, user_id)
);
create index marsh_notice_acknowledgments_user_idx on public.marsh_notice_acknowledgments(user_id);
alter table public.marsh_portal_notice enable row level security;
alter table public.marsh_notice_acknowledgments enable row level security;
revoke all on public.marsh_portal_notice, public.marsh_notice_acknowledgments from public, anon, authenticated;
grant select, insert, update on public.marsh_portal_notice, public.marsh_notice_acknowledgments to service_role;
