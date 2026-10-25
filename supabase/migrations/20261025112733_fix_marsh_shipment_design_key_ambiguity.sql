-- Rename the PL/pgSQL variable to distinguish it from the finished-mat column.
CREATE OR REPLACE FUNCTION public.sync_marsh_shipment_inventory(p_account_slug text, p_shipments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  shipment jsonb; design jsonb; shipment_key text; v_design_key text;
  item_units integer; design_units integer; available_finished integer; use_finished integer;
  inserted_count integer; processed_count integer := 0; processed_units integer := 0; blank_units integer;
  tape_coverage integer; tape_usage integer; tape_total_usage integer; tape_rolls_used integer;
  box_units integer;
begin
  if jsonb_typeof(p_shipments) <> 'array' then raise exception 'Shipments must be a JSON array'; end if;
  perform pg_advisory_xact_lock(hashtext('marsh-shipment-inventory:' || p_account_slug));

  if not exists (
    select 1 from public.marsh_processed_shipments
    where account_slug=p_account_slug and shipment_id='__initialized__'
  ) then
    insert into public.marsh_processed_shipments(account_slug,shipment_id,units,designs)
    values(p_account_slug,'__initialized__',0,'[]') on conflict do nothing;

    for shipment in select value from jsonb_array_elements(p_shipments) loop
      shipment_key := nullif(trim(shipment->>'id'),'');
      item_units := greatest(0,coalesce((shipment->>'units')::integer,0));
      if shipment_key is not null then
        insert into public.marsh_processed_shipments(account_slug,shipment_id,units,designs)
        values(p_account_slug,shipment_key,item_units,coalesce(shipment->'designs','[]'))
        on conflict do nothing;
      end if;
    end loop;

    return jsonb_build_object('initialized',true,'processedShipments',0,'processedUnits',0);
  end if;

  for shipment in select value from jsonb_array_elements(p_shipments) loop
    shipment_key := nullif(trim(shipment->>'id'),'');
    item_units := greatest(0,coalesce((shipment->>'units')::integer,0));
    if shipment_key is null or item_units < 1 then continue; end if;

    insert into public.marsh_processed_shipments(account_slug,shipment_id,units,designs)
    values(p_account_slug,shipment_key,item_units,coalesce(shipment->'designs','[]'))
    on conflict do nothing;

    get diagnostics inserted_count = row_count;
    if inserted_count=0 then continue; end if;

    processed_count := processed_count + 1;
    processed_units := processed_units + item_units;
    blank_units := item_units;
    box_units := ceil(item_units::numeric / 2.0)::integer;

    if jsonb_typeof(shipment->'designs')='array' then
      for design in select value from jsonb_array_elements(shipment->'designs') loop
        v_design_key := nullif(trim(design->>'key'),'');
        design_units := greatest(0,coalesce((design->>'quantity')::integer,0));
        if v_design_key is null or design_units<1 then continue; end if;

        select quantity into available_finished
        from public.marsh_finished_mats
        where account_slug=p_account_slug and public.marsh_finished_mats.design_key=v_design_key
        for update;

        use_finished := least(design_units,coalesce(available_finished,0));

        if use_finished>0 then
          update public.marsh_finished_mats
          set quantity=quantity-use_finished,updated_at=now()
          where account_slug=p_account_slug and public.marsh_finished_mats.design_key=v_design_key;

          blank_units := greatest(0,blank_units-use_finished);
        end if;
      end loop;
    end if;

    update public.marsh_inventory
    set quantity=greatest(
          0,
          quantity - case item_key
            when 'blank_mats' then blank_units
            when 'shipping_boxes' then box_units
            when 'thank_you_cards' then 1
            when 'poly_bags' then item_units
            else 0
          end
        ),
        updated_at=now(),
        updated_by=null
    where account_slug=p_account_slug
      and item_key in('blank_mats','shipping_boxes','thank_you_cards','poly_bags');

    select greatest(1,coalesce(quantity,25)::integer)
      into tape_coverage
    from public.marsh_inventory
    where account_slug=p_account_slug and item_key='packing_tape_coverage';

    tape_coverage := coalesce(tape_coverage,25);

    select greatest(0,coalesce(quantity,0)::integer)
      into tape_usage
    from public.marsh_inventory
    where account_slug=p_account_slug and item_key='packing_tape_usage';

    tape_usage := coalesce(tape_usage,0);
    tape_total_usage := tape_usage + item_units;
    tape_rolls_used := floor(tape_total_usage::numeric/tape_coverage)::integer;

    update public.marsh_inventory
    set quantity=greatest(0,quantity-tape_rolls_used),updated_at=now(),updated_by=null
    where account_slug=p_account_slug and item_key='packing_tape';

    update public.marsh_inventory
    set quantity=mod(tape_total_usage,tape_coverage),updated_at=now(),updated_by=null
    where account_slug=p_account_slug and item_key='packing_tape_usage';
  end loop;

  return jsonb_build_object('initialized',false,'processedShipments',processed_count,'processedUnits',processed_units);
end;
$function$
