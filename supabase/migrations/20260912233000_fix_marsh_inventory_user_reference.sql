alter table public.marsh_inventory
  drop constraint if exists marsh_inventory_updated_by_fkey;

alter table public.marsh_inventory
  add constraint marsh_inventory_updated_by_fkey
  foreign key (updated_by)
  references public.marsh_portal_users(id)
  on delete set null;
