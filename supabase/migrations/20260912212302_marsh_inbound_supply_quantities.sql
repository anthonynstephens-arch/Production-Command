alter table public.marsh_incoming_deliveries add column if not exists supply_type text;
alter table public.marsh_incoming_deliveries add column if not exists quantity numeric(12,2) not null default 1 check (quantity > 0);
alter table public.marsh_incoming_deliveries add column if not exists inventory_applied boolean not null default false;
alter table public.marsh_incoming_deliveries drop constraint if exists marsh_incoming_deliveries_supply_type_check;
alter table public.marsh_incoming_deliveries add constraint marsh_incoming_deliveries_supply_type_check
  check (supply_type is null or supply_type in ('mats','boxes','tape','thankYouCards','polyBags','ink'));
