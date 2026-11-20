alter table public.marsh_production_plan drop constraint marsh_production_plan_stage_check;
alter table public.marsh_production_plan add constraint marsh_production_plan_stage_check check (stage in ('scheduled','printing','drying','packaging','completed','cancelled'));
create table public.marsh_production_cancellations (
  run_id uuid primary key, scheduled_date date not null, reason text not null check (length(trim(reason)) between 1 and 1000),
  replacement_date date not null, cancelled_at timestamptz not null default clock_timestamp(),
  cancelled_by uuid references public.marsh_portal_users(id), active boolean not null default true
);
alter table public.marsh_production_cancellations enable row level security;
revoke all on public.marsh_production_cancellations from public,anon,authenticated;
grant all on public.marsh_production_cancellations to service_role;
create function public.marsh_cancel_production_run(expected_run uuid, expected_version timestamptz, why text, replacement date, replacement_time time, actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.marsh_production_plan%rowtype; n public.marsh_next_production_run%rowtype; changed timestamptz:=clock_timestamp();
begin
 select * into p from public.marsh_production_plan where account_slug='marsh-supply' for update;
 if not found or p.run_id<>expected_run or p.updated_at<>expected_version or p.stage<>'scheduled' then raise exception 'The scheduled run changed. Refresh and try again.'; end if;
 if length(trim(coalesce(why,''))) not between 1 and 1000 then raise exception 'Enter a cancellation reason.'; end if;
 if replacement is null or replacement_time is null or replacement < (changed at time zone 'America/Detroit')::date or extract(isodow from replacement) not in (1,3,5) then raise exception 'Choose a future Monday, Wednesday, or Friday for the next run.'; end if;
 if replacement = (changed at time zone 'America/Detroit')::date and replacement_time <= (changed at time zone 'America/Detroit')::time then raise exception 'Choose a future start time.'; end if;
 update public.marsh_production_cancellations set active=false where active;
 insert into public.marsh_production_cancellations(run_id,scheduled_date,reason,replacement_date,cancelled_by) values(p.run_id,p.scheduled_date,trim(why),replacement,actor);
 update public.marsh_production_plan set stage='cancelled',updated_at=changed,updated_by=actor where account_slug='marsh-supply' returning * into p;
 insert into public.marsh_next_production_run(account_slug,is_tbd,scheduled_date,scheduled_time,whatupdoe,did_you_call_first,upside_down_welcome,marsh_supply,updated_at,updated_by)
 values('marsh-supply',false,replacement,replacement_time,p.whatupdoe,p.did_you_call_first,p.upside_down_welcome,p.marsh_supply,changed,actor)
 on conflict(account_slug) do update set is_tbd=false,scheduled_date=excluded.scheduled_date,scheduled_time=excluded.scheduled_time,updated_at=changed,updated_by=actor returning * into n;
 return jsonb_build_object('plan',to_jsonb(p),'next',to_jsonb(n));
end;$$;
revoke all on function public.marsh_cancel_production_run(uuid,timestamptz,text,date,time,uuid) from public,anon,authenticated;
grant execute on function public.marsh_cancel_production_run(uuid,timestamptz,text,date,time,uuid) to service_role;
create or replace function public.marsh_start_next_production_run(expected_version timestamptz, expected_active uuid, actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.marsh_next_production_run%rowtype; p public.marsh_production_plan%rowtype; started timestamptz:=clock_timestamp();
begin
  select * into n from public.marsh_next_production_run where account_slug='marsh-supply' for update;
  if not found or n.updated_at<>expected_version then raise exception 'The next run changed. Refresh and try again.'; end if;
  select * into p from public.marsh_production_plan where account_slug='marsh-supply' for update;
  if p.run_id is distinct from expected_active then raise exception 'The current run changed. Refresh and try again.'; end if;
  if p.run_id is not null and p.stage not in ('completed','cancelled') then raise exception 'Complete the current run before starting the next.'; end if;
  insert into public.marsh_production_plan(account_slug,run_id,stage,scheduled_date,scheduled_time,whatupdoe,
    did_you_call_first,upside_down_welcome,marsh_supply,printing_started_at,updated_at,updated_by)
  values ('marsh-supply',gen_random_uuid(),'printing',
    coalesce(n.scheduled_date,(started at time zone 'America/Detroit')::date),
    coalesce(n.scheduled_time,(started at time zone 'America/Detroit')::time),
    n.whatupdoe,n.did_you_call_first,n.upside_down_welcome,n.marsh_supply,started,started,actor)
  on conflict(account_slug) do update set run_id=excluded.run_id,stage='printing',
    scheduled_date=excluded.scheduled_date,scheduled_time=excluded.scheduled_time,
    whatupdoe=excluded.whatupdoe,did_you_call_first=excluded.did_you_call_first,
    upside_down_welcome=excluded.upside_down_welcome,marsh_supply=excluded.marsh_supply,
    printing_started_at=started,drying_started_at=null,drying_ends_at=null,
    packaging_started_at=null,completed_at=null,updated_at=started,updated_by=actor
  returning * into p;
  delete from public.marsh_next_production_run where account_slug='marsh-supply';
  return to_jsonb(p);
end;$$;
revoke all on function public.marsh_start_next_production_run(timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marsh_start_next_production_run(timestamptz,uuid,uuid) to service_role;
create function public.marsh_sync_cancelled_replacement() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.marsh_production_cancellations where active) then
  if new.is_tbd then raise exception 'Choose a replacement date or clear the cancellation notice first.'; end if;
  update public.marsh_production_cancellations set replacement_date=new.scheduled_date where active;
 end if;
 return new;
end;$$;
create trigger marsh_sync_cancelled_replacement after update on public.marsh_next_production_run for each row execute function public.marsh_sync_cancelled_replacement();
revoke all on function public.marsh_sync_cancelled_replacement() from public,anon,authenticated;
