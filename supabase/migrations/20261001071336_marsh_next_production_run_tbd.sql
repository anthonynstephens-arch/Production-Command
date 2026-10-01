create table public.marsh_next_production_run (
  account_slug text primary key check (account_slug='marsh-supply'),
  is_tbd boolean not null default true,
  scheduled_date date,
  scheduled_time time without time zone,
  whatupdoe integer not null check (whatupdoe>=0),
  did_you_call_first integer not null check (did_you_call_first>=0),
  upside_down_welcome integer not null check (upside_down_welcome>=0),
  marsh_supply integer not null check (marsh_supply>=0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.marsh_portal_users(id) on delete set null,
  constraint marsh_next_schedule check ((is_tbd and scheduled_date is null and scheduled_time is null)
    or (not is_tbd and scheduled_date is not null and scheduled_time is not null)),
  constraint marsh_next_batch check (whatupdoe+did_you_call_first+upside_down_welcome+marsh_supply=40)
);
alter table public.marsh_next_production_run enable row level security;
revoke all on public.marsh_next_production_run from anon,authenticated;
grant all on public.marsh_next_production_run to service_role;

create function public.marsh_start_next_production_run(expected_version timestamptz, expected_active uuid, actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.marsh_next_production_run%rowtype; p public.marsh_production_plan%rowtype; started timestamptz:=clock_timestamp();
begin
  select * into n from public.marsh_next_production_run where account_slug='marsh-supply' for update;
  if not found or n.updated_at<>expected_version then raise exception 'The next run changed. Refresh and try again.'; end if;
  select * into p from public.marsh_production_plan where account_slug='marsh-supply' for update;
  if p.run_id is distinct from expected_active then raise exception 'The current run changed. Refresh and try again.'; end if;
  if p.run_id is not null and p.stage<>'completed' then raise exception 'Complete the current run before starting the next.'; end if;
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
