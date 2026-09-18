create table if not exists public.marsh_order_issues (
  account_slug text not null,
  order_id text not null,
  order_number text not null,
  reason text not null,
  note text,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_name text,
  primary key (account_slug, order_id)
);

create table if not exists public.marsh_finished_mats (
  account_slug text not null,
  design_key text not null,
  design_name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_slug, design_key)
);

alter table public.marsh_order_issues enable row level security;
alter table public.marsh_finished_mats enable row level security;
revoke all on public.marsh_order_issues from anon, authenticated;
revoke all on public.marsh_finished_mats from anon, authenticated;

insert into public.marsh_finished_mats (account_slug, design_key, design_name, quantity)
values
  ('marsh-supply', 'whatupdoe', 'Whatupdoe', 0),
  ('marsh-supply', 'did-you-call-first', 'Did You Call First?', 0),
  ('marsh-supply', 'upside-down-welcome', 'Upside Down Welcome', 0),
  ('marsh-supply', 'marsh-supply', 'Marsh Supply', 0)
on conflict (account_slug, design_key) do nothing;

create or replace function public.marsh_print_finished_mats(
  p_account_slug text,
  p_design_key text,
  p_design_name text,
  p_quantity integer
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  blank_count integer;
  finished_count integer;
begin
  if p_quantity < 1 then raise exception 'Quantity must be positive'; end if;
  perform pg_advisory_xact_lock(hashtext('marsh-finished-mats:' || p_account_slug));
  select quantity::integer into blank_count
  from public.marsh_inventory
  where account_slug = p_account_slug and item_key = 'blank_mats'
  for update;
  if coalesce(blank_count, 0) < p_quantity then raise exception 'Not enough blank mats'; end if;
  update public.marsh_inventory
  set quantity = quantity - p_quantity, updated_at = now(), updated_by = null
  where account_slug = p_account_slug and item_key = 'blank_mats';
  insert into public.marsh_finished_mats (account_slug, design_key, design_name, quantity)
  values (p_account_slug, p_design_key, p_design_name, p_quantity)
  on conflict (account_slug, design_key) do update
  set quantity = public.marsh_finished_mats.quantity + excluded.quantity,
      design_name = excluded.design_name,
      updated_at = now()
  returning quantity into finished_count;
  return jsonb_build_object('blankMats', blank_count - p_quantity, 'finishedMats', finished_count);
end;
$$;

revoke all on function public.marsh_print_finished_mats(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.marsh_print_finished_mats(text, text, text, integer) to service_role;

alter table public.marsh_processed_shipments add column if not exists designs jsonb not null default '[]'::jsonb;

create or replace function public.sync_marsh_shipment_inventory(p_account_slug text, p_shipments jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  shipment jsonb; design jsonb; shipment_key text; design_key text;
  item_units integer; design_units integer; available_finished integer; use_finished integer;
  inserted_count integer; processed_count integer := 0; processed_units integer := 0; blank_units integer;
  tape_coverage integer; tape_usage integer; tape_total_usage integer; tape_rolls_used integer;
begin
  if jsonb_typeof(p_shipments) <> 'array' then raise exception 'Shipments must be a JSON array'; end if;
  perform pg_advisory_xact_lock(hashtext('marsh-shipment-inventory:' || p_account_slug));
  if not exists (select 1 from public.marsh_processed_shipments where account_slug=p_account_slug and shipment_id='__initialized__') then
    insert into public.marsh_processed_shipments(account_slug,shipment_id,units,designs) values(p_account_slug,'__initialized__',0,'[]') on conflict do nothing;
    for shipment in select value from jsonb_array_elements(p_shipments) loop
      shipment_key := nullif(trim(shipment->>'id'),''); item_units := greatest(0,coalesce((shipment->>'units')::integer,0));
      if shipment_key is not null then insert into public.marsh_processed_shipments(account_slug,shipment_id,units,designs) values(p_account_slug,shipment_key,item_units,coalesce(shipment->'designs','[]')) on conflict do nothing; end if;
    end loop;
    return jsonb_build_object('initialized',true,'processedShipments',0,'processedUnits',0);
  end if;
  for shipment in select value from jsonb_array_elements(p_shipments) loop
    shipment_key := nullif(trim(shipment->>'id'),''); item_units := greatest(0,coalesce((shipment->>'units')::integer,0));
    if shipment_key is null or item_units < 1 then continue; end if;
    insert into public.marsh_processed_shipments(account_slug,shipment_id,units,designs) values(p_account_slug,shipment_key,item_units,coalesce(shipment->'designs','[]')) on conflict do nothing;
    get diagnostics inserted_count = row_count; if inserted_count=0 then continue; end if;
    processed_count:=processed_count+1; processed_units:=processed_units+item_units; blank_units:=item_units;
    if jsonb_typeof(shipment->'designs')='array' then
      for design in select value from jsonb_array_elements(shipment->'designs') loop
        design_key:=nullif(trim(design->>'key'),''); design_units:=greatest(0,coalesce((design->>'quantity')::integer,0));
        if design_key is null or design_units<1 then continue; end if;
        select quantity into available_finished from public.marsh_finished_mats where account_slug=p_account_slug and public.marsh_finished_mats.design_key=design_key for update;
        use_finished:=least(design_units,coalesce(available_finished,0));
        if use_finished>0 then update public.marsh_finished_mats set quantity=quantity-use_finished,updated_at=now() where account_slug=p_account_slug and public.marsh_finished_mats.design_key=design_key; blank_units:=greatest(0,blank_units-use_finished); end if;
      end loop;
    end if;
    update public.marsh_inventory set quantity=greatest(0,quantity-case item_key when 'blank_mats' then blank_units when 'shipping_boxes' then 1 when 'thank_you_cards' then 1 when 'poly_bags' then item_units else 0 end),updated_at=now(),updated_by=null where account_slug=p_account_slug and item_key in('blank_mats','shipping_boxes','thank_you_cards','poly_bags');
    select greatest(1,coalesce(quantity,25)::integer) into tape_coverage from public.marsh_inventory where account_slug=p_account_slug and item_key='packing_tape_coverage'; tape_coverage:=coalesce(tape_coverage,25);
    select greatest(0,coalesce(quantity,0)::integer) into tape_usage from public.marsh_inventory where account_slug=p_account_slug and item_key='packing_tape_usage'; tape_usage:=coalesce(tape_usage,0);
    tape_total_usage:=tape_usage+item_units; tape_rolls_used:=floor(tape_total_usage::numeric/tape_coverage)::integer;
    update public.marsh_inventory set quantity=greatest(0,quantity-tape_rolls_used),updated_at=now(),updated_by=null where account_slug=p_account_slug and item_key='packing_tape';
    update public.marsh_inventory set quantity=mod(tape_total_usage,tape_coverage),updated_at=now(),updated_by=null where account_slug=p_account_slug and item_key='packing_tape_usage';
  end loop;
  return jsonb_build_object('initialized',false,'processedShipments',processed_count,'processedUnits',processed_units);
end; $$;

revoke all on function public.sync_marsh_shipment_inventory(text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_marsh_shipment_inventory(text,jsonb) to service_role;
