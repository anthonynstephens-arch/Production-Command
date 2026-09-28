create table if not exists public.marsh_production_plan (
  account_slug text primary key check (account_slug = 'marsh-supply'),
  scheduled_date date not null,
  scheduled_time time without time zone not null,
  whatupdoe integer not null default 0 check (whatupdoe >= 0),
  did_you_call_first integer not null default 0 check (did_you_call_first >= 0),
  upside_down_welcome integer not null default 0 check (upside_down_welcome >= 0),
  marsh_supply integer not null default 0 check (marsh_supply >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.marsh_portal_users(id) on delete set null,
  constraint marsh_production_plan_batch_size check (
    whatupdoe + did_you_call_first + upside_down_welcome + marsh_supply = 40
  )
);

alter table public.marsh_production_plan enable row level security;
revoke all on public.marsh_production_plan from anon, authenticated;
