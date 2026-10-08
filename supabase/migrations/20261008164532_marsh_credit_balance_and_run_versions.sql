create or replace function public.marsh_notification_balance() returns numeric language sql security invoker set search_path='' as $$
 select greatest(0,coalesce((select sum(amount) from public.marsh_charges),0)-coalesce((select sum(amount) from public.marsh_payments where status='confirmed'),0)-coalesce((select sum(credit_amount) from public.marsh_defective_mats where credited_at is not null),0));
$$;
revoke all on function public.marsh_notification_balance() from public,anon,authenticated;
grant execute on function public.marsh_notification_balance() to service_role;

create or replace function public.archive_marsh_run_breakdown() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into marsh_run_breakdowns(run_id,scheduled_date,stage,forecast)
 values(new.run_id,new.scheduled_date,new.stage,jsonb_build_object('whatupdoe',new.whatupdoe,'did_you_call_first',new.did_you_call_first,'upside_down_welcome',new.upside_down_welcome,'marsh_supply',new.marsh_supply))
 on conflict(run_id) do update set stage=excluded.stage,scheduled_date=excluded.scheduled_date,
 forecast=case when new.stage='scheduled' then excluded.forecast else marsh_run_breakdowns.forecast end,
 updated_at=clock_timestamp();
 return new;
end $$;
