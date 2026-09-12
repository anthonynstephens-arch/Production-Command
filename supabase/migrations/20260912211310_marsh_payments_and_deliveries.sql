create table if not exists public.marsh_payments (
  id uuid primary key default gen_random_uuid(), amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date, method text not null default 'Other', reference text, note text,
  submitted_by uuid references public.marsh_portal_users(id) on delete set null, submitted_by_name text not null,
  submitted_by_role text not null check (submitted_by_role in ('admin','partner')),
  status text not null check (status in ('pending','confirmed')) default 'pending', confirmed_at timestamptz,
  confirmed_by uuid references public.marsh_portal_users(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists marsh_payments_status_created_idx on public.marsh_payments(status, created_at desc);
create index if not exists marsh_payments_submitted_by_idx on public.marsh_payments(submitted_by);
create index if not exists marsh_payments_confirmed_by_idx on public.marsh_payments(confirmed_by);
alter table public.marsh_payments enable row level security;
revoke all on public.marsh_payments from anon, authenticated;

create table if not exists public.marsh_incoming_deliveries (
  id uuid primary key default gen_random_uuid(), description text not null, carrier text not null,
  tracking_number text not null, eta_start date, eta_end date,
  status text not null check (status in ('expected','in_transit','delivered')) default 'expected',
  submitted_by uuid references public.marsh_portal_users(id) on delete set null, submitted_by_name text not null,
  created_at timestamptz not null default now(), delivered_at timestamptz
);
create index if not exists marsh_deliveries_status_eta_idx on public.marsh_incoming_deliveries(status, eta_start);
create index if not exists marsh_deliveries_submitted_by_idx on public.marsh_incoming_deliveries(submitted_by);
alter table public.marsh_incoming_deliveries enable row level security;
revoke all on public.marsh_incoming_deliveries from anon, authenticated;
