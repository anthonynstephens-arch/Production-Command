create table if not exists public.marsh_inventory (
  id uuid primary key default gen_random_uuid(),
  account_slug text not null default 'marsh-supply',
  item_key text not null check (item_key in ('blank_mats', 'shipping_boxes', 'ink')),
  quantity numeric not null default 0 check (quantity >= 0),
  unit text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (account_slug, item_key)
);

alter table public.marsh_inventory enable row level security;

create policy "Marsh inventory readable by assigned users"
on public.marsh_inventory for select to authenticated
using ((select auth.uid()) = updated_by);

create policy "Marsh inventory editable by assigned users"
on public.marsh_inventory for update to authenticated
using ((select auth.uid()) = updated_by)
with check ((select auth.uid()) = updated_by);
