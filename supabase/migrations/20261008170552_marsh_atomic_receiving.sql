-- Save receipt and stock together; a retry returns the existing receipt.
create or replace function public.receive_marsh_delivery(p_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  d public.marsh_incoming_deliveries%rowtype;
  stock_key text;
  stock_unit text;
begin
  if not exists(select 1 from public.marsh_portal_users where id=p_actor and active and role='admin') then
    raise exception 'Admin access required';
  end if;
  select * into d from public.marsh_incoming_deliveries where id=p_id for update;
  if not found then raise exception 'Delivery not found'; end if;
  if d.inventory_applied then
    return jsonb_build_object('alreadyReceived',true,'inventoryAddition',jsonb_build_object('key',d.supply_type,'quantity',0));
  end if;
  stock_key:=case d.supply_type when 'mats' then 'blank_mats' when 'boxes' then 'shipping_boxes' when 'tape' then 'packing_tape' when 'thankYouCards' then 'thank_you_cards' when 'polyBags' then 'poly_bags' when 'ink' then 'ink' end;
  stock_unit:=case d.supply_type when 'mats' then 'mats' when 'boxes' then 'boxes' when 'tape' then 'rolls' when 'thankYouCards' then 'cards' when 'polyBags' then 'bags' when 'ink' then 'percent' end;
  if stock_key is null or d.quantity is null or d.quantity<=0 then raise exception 'Invalid delivery quantity or supply type'; end if;
  insert into public.marsh_inventory(account_slug,item_key,quantity,unit,updated_at)
  values('marsh-supply',stock_key,case when stock_key='ink' then least(100,d.quantity) else d.quantity end,stock_unit,now())
  on conflict(account_slug,item_key) do update set quantity=case when stock_key='ink' then least(100,marsh_inventory.quantity+excluded.quantity) else marsh_inventory.quantity+excluded.quantity end,updated_at=now();
  update public.marsh_incoming_deliveries set status='delivered',delivered_at=now(),inventory_applied=true where id=p_id;
  return jsonb_build_object('alreadyReceived',false,'inventoryAddition',jsonb_build_object('key',d.supply_type,'quantity',d.quantity));
end $$;
revoke all on function public.receive_marsh_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.receive_marsh_delivery(uuid,uuid) to service_role;
