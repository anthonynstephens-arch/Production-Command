create function public.marsh_cancel_next_production_run(expected_version timestamptz, why text, replacement date, replacement_time time, actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.marsh_next_production_run%rowtype; changed timestamptz:=clock_timestamp(); original_date date;
begin
 select * into n from public.marsh_next_production_run where account_slug='marsh-supply' for update;
 if not found or n.updated_at<>expected_version or n.is_tbd or n.scheduled_date is null then raise exception 'The next run changed. Refresh and try again.'; end if;
 if length(trim(coalesce(why,''))) not between 1 and 1000 then raise exception 'Enter a cancellation reason.'; end if;
 if replacement is null or replacement_time is null or replacement < (changed at time zone 'America/Detroit')::date or extract(isodow from replacement) not in (1,3,5) then raise exception 'Choose a future Monday, Wednesday, or Friday for the next run.'; end if;
 if replacement = (changed at time zone 'America/Detroit')::date and replacement_time <= (changed at time zone 'America/Detroit')::time then raise exception 'Choose a future start time.'; end if;
 original_date:=n.scheduled_date;
 update public.marsh_production_cancellations set active=false where active;
 insert into public.marsh_production_cancellations(run_id,scheduled_date,reason,replacement_date,cancelled_by) values(gen_random_uuid(),original_date,trim(why),replacement,actor);
 update public.marsh_next_production_run set is_tbd=false,scheduled_date=replacement,scheduled_time=replacement_time,updated_at=changed,updated_by=actor where account_slug='marsh-supply' returning * into n;
 return jsonb_build_object('next',to_jsonb(n));
end;$$;
revoke all on function public.marsh_cancel_next_production_run(timestamptz,text,date,time,uuid) from public,anon,authenticated;
grant execute on function public.marsh_cancel_next_production_run(timestamptz,text,date,time,uuid) to service_role;
