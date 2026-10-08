create table public.marsh_run_breakdowns (
 run_id uuid primary key,
 scheduled_date date not null,
 stage text not null,
 forecast jsonb not null,
 actual jsonb,
 notes text not null default '',
 updated_at timestamptz not null default now(),
 updated_by uuid references public.marsh_portal_users(id) on delete set null
);
alter table public.marsh_run_breakdowns enable row level security;
revoke all on public.marsh_run_breakdowns from anon,authenticated;
grant all on public.marsh_run_breakdowns to service_role;
create function public.archive_marsh_run_breakdown() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into marsh_run_breakdowns(run_id,scheduled_date,stage,forecast)
 values(new.run_id,new.scheduled_date,new.stage,jsonb_build_object('whatupdoe',new.whatupdoe,'did_you_call_first',new.did_you_call_first,'upside_down_welcome',new.upside_down_welcome,'marsh_supply',new.marsh_supply))
 on conflict(run_id) do update set stage=excluded.stage,scheduled_date=excluded.scheduled_date,
 forecast=case when new.stage='scheduled' then excluded.forecast else marsh_run_breakdowns.forecast end;
 return new;
end $$;
create trigger archive_marsh_run_breakdown after insert or update on public.marsh_production_plan for each row execute function public.archive_marsh_run_breakdown();
insert into public.marsh_run_breakdowns(run_id,scheduled_date,stage,forecast)
select run_id,scheduled_date,stage,jsonb_build_object('whatupdoe',whatupdoe,'did_you_call_first',did_you_call_first,'upside_down_welcome',upside_down_welcome,'marsh_supply',marsh_supply) from public.marsh_production_plan;
revoke all on function public.archive_marsh_run_breakdown() from public,anon,authenticated;
grant execute on function public.archive_marsh_run_breakdown() to service_role;

create table public.marsh_defective_mats (
 id uuid primary key,
 quantity integer not null check(quantity>0),
 received_date date not null,
 delivery_id uuid references public.marsh_incoming_deliveries(id) on delete set null,
 run_id uuid references public.marsh_run_breakdowns(run_id),
 reason text not null check(length(trim(reason))>0),
 inventory_removed boolean not null default false,
 photo_paths text[] not null default '{}',
 created_by uuid references public.marsh_portal_users(id) on delete set null,
 created_by_name text not null,
 created_at timestamptz not null default now(),
 credit_amount numeric(12,2) not null default 0 check(credit_amount>=0),
 credit_rate numeric(6,2),
 credited_at timestamptz,
 credited_by uuid references public.marsh_portal_users(id) on delete set null,
 credited_by_name text,
 check ((credited_at is null and credit_amount=0) or (credited_at is not null and credit_amount>0 and credit_rate>0 and credit_rate<=14))
);
alter table public.marsh_defective_mats enable row level security;
revoke all on public.marsh_defective_mats from anon,authenticated;
grant all on public.marsh_defective_mats to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marsh-defect-photos','marsh-defect-photos',false,3000000,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create function public.record_marsh_defective_mats(p_id uuid,p_quantity integer,p_reason text,p_received_date date,p_delivery_id uuid,p_run_id uuid,p_remove_inventory boolean,p_actor uuid,p_actor_name text)
returns public.marsh_defective_mats language plpgsql security invoker set search_path=public as $$
declare r public.marsh_defective_mats; inventory_count numeric;
begin
 if not exists(select 1 from marsh_portal_users where id=p_actor and active and role='admin') then raise exception 'Admin access required.'; end if;
 -- Retries use the same record ID and never deduct inventory twice.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from marsh_defective_mats where id=p_id;
 if found then
  if r.created_by<>p_actor or r.quantity<>p_quantity or r.reason<>p_reason or r.received_date<>p_received_date or r.delivery_id is distinct from p_delivery_id or r.run_id is distinct from p_run_id or r.inventory_removed<>p_remove_inventory then raise exception 'Record reference already used. Refresh and try again.'; end if;
  return r;
 end if;
 if p_delivery_id is not null and not exists(select 1 from marsh_incoming_deliveries where id=p_delivery_id and supply_type='mats') then raise exception 'Choose a mat delivery.'; end if;
 if p_remove_inventory then
  select quantity into inventory_count from marsh_inventory where account_slug='marsh-supply' and item_key='blank_mats' for update;
  if inventory_count is null or inventory_count<p_quantity then raise exception 'Not enough blank mats in inventory. If already deducted, uncheck Remove from blank inventory.'; end if;
  update marsh_inventory set quantity=quantity-p_quantity,updated_at=now(),updated_by=null where account_slug='marsh-supply' and item_key='blank_mats';
 end if;
 insert into marsh_defective_mats(id,quantity,received_date,delivery_id,run_id,reason,inventory_removed,created_by,created_by_name)
 values(p_id,p_quantity,p_received_date,p_delivery_id,p_run_id,p_reason,p_remove_inventory,p_actor,p_actor_name) returning * into r;
 return r;
end $$;

create function public.credit_marsh_defective_mats(p_id uuid,p_rate numeric,p_actor uuid,p_actor_name text)
returns public.marsh_defective_mats language plpgsql security invoker set search_path=public as $$
declare r public.marsh_defective_mats;
begin
 if not exists(select 1 from marsh_portal_users where id=p_actor and active and role='admin') then raise exception 'Admin access required.'; end if;
 if p_rate is null or p_rate<=0 or p_rate>14 or p_rate<>round(p_rate,2) then raise exception 'Credit per mat must be between $0.01 and $14.00.'; end if;
 select * into r from marsh_defective_mats where id=p_id for update;
 if not found then raise exception 'Defect record not found.'; end if;
 if r.credited_at is not null then
  if r.credit_rate<>p_rate then raise exception 'This defect record has already been credited.'; end if;
  return r;
 end if;
 update marsh_defective_mats set credit_rate=p_rate,credit_amount=quantity*p_rate,credited_at=now(),credited_by=p_actor,credited_by_name=p_actor_name where id=p_id returning * into r;
 return r;
end $$;

create function public.append_marsh_defect_photo(p_id uuid,p_path text)
returns void language plpgsql security invoker set search_path=public as $$
begin
 update marsh_defective_mats set photo_paths=array_append(photo_paths,p_path) where id=p_id and cardinality(photo_paths)<20;
 if not found then raise exception 'Record not found or 20-photo limit reached.'; end if;
end $$;
revoke all on function public.record_marsh_defective_mats(uuid,integer,text,date,uuid,uuid,boolean,uuid,text) from public,anon,authenticated;
revoke all on function public.credit_marsh_defective_mats(uuid,numeric,uuid,text) from public,anon,authenticated;
revoke all on function public.append_marsh_defect_photo(uuid,text) from public,anon,authenticated;
grant execute on function public.record_marsh_defective_mats(uuid,integer,text,date,uuid,uuid,boolean,uuid,text) to service_role;
grant execute on function public.credit_marsh_defective_mats(uuid,numeric,uuid,text) to service_role;
grant execute on function public.append_marsh_defect_photo(uuid,text) to service_role;
