create table if not exists public.marsh_dashboard_state (
  account_slug text primary key check (account_slug = 'marsh-supply'),
  orders_in_production integer not null default 0 check (orders_in_production >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.marsh_portal_users(id) on delete set null
);
create table if not exists public.marsh_charges (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  description text not null check (char_length(trim(description)) between 2 and 240),
  charge_date date not null default current_date,
  created_by uuid references public.marsh_portal_users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);
alter table public.marsh_dashboard_state enable row level security;
alter table public.marsh_charges enable row level security;
revoke all on public.marsh_dashboard_state from anon, authenticated;
revoke all on public.marsh_charges from anon, authenticated;
insert into public.marsh_dashboard_state (account_slug, orders_in_production) values ('marsh-supply', 0) on conflict (account_slug) do nothing;
create index if not exists marsh_charges_date_idx on public.marsh_charges(charge_date desc, created_at desc);
