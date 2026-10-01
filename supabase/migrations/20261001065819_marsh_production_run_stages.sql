alter table public.marsh_production_plan
  add column run_id uuid not null default gen_random_uuid(),
  add column stage text not null default 'scheduled' check (stage in ('scheduled','printing','drying','packaging','completed')),
  add column printing_started_at timestamptz,
  add column drying_started_at timestamptz,
  add column drying_ends_at timestamptz,
  add column packaging_started_at timestamptz,
  add column completed_at timestamptz,
  add constraint marsh_run_drying_times check (
    (drying_started_at is null and drying_ends_at is null) or
    (drying_started_at is not null and drying_ends_at = drying_started_at + interval '24 hours')
  ),
  add constraint marsh_run_stage_times check (
    (stage <> 'printing' or printing_started_at is not null) and
    (stage <> 'drying' or drying_ends_at is not null) and
    (stage <> 'packaging' or packaging_started_at is not null) and
    (stage <> 'completed' or completed_at is not null)
  );

create or replace function public.marsh_advance_production_drying()
returns void language sql security invoker set search_path = '' as $$
  update public.marsh_production_plan
  set stage = 'packaging', packaging_started_at = drying_ends_at, updated_at = clock_timestamp()
  where account_slug = 'marsh-supply' and stage = 'drying' and drying_ends_at <= clock_timestamp();
$$;
revoke all on function public.marsh_advance_production_drying() from public, anon, authenticated;
grant execute on function public.marsh_advance_production_drying() to service_role;

create or replace function public.marsh_set_production_stage(expected_run uuid, requested_stage text, actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.marsh_production_plan%rowtype; transition_time timestamptz := clock_timestamp();
begin
  perform public.marsh_advance_production_drying();
  select * into p from public.marsh_production_plan where account_slug = 'marsh-supply' for update;
  if not found or p.run_id <> expected_run then raise exception 'The production run changed. Refresh and try again.'; end if;
  if requested_stage = p.stage then return to_jsonb(p); end if;
  if not ((p.stage = 'scheduled' and requested_stage = 'printing') or
          (p.stage = 'printing' and requested_stage = 'drying') or
          (p.stage = 'drying' and requested_stage = 'packaging' and p.drying_ends_at <= transition_time) or
          (p.stage = 'packaging' and requested_stage = 'completed')) then
    raise exception 'This stage is not available yet. Refresh the run and follow the production stages in order.';
  end if;
  update public.marsh_production_plan set
    stage = requested_stage,
    printing_started_at = case when requested_stage = 'printing' then transition_time else printing_started_at end,
    drying_started_at = case when requested_stage = 'drying' then transition_time else drying_started_at end,
    drying_ends_at = case when requested_stage = 'drying' then transition_time + interval '24 hours' else drying_ends_at end,
    packaging_started_at = case when requested_stage = 'packaging' then drying_ends_at else packaging_started_at end,
    completed_at = case when requested_stage = 'completed' then transition_time else completed_at end,
    updated_at = transition_time, updated_by = actor
  where account_slug = 'marsh-supply' returning * into p;
  return to_jsonb(p);
end; $$;
revoke all on function public.marsh_set_production_stage(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.marsh_set_production_stage(uuid,text,uuid) to service_role;

select cron.schedule('marsh-production-drying-progress', '10 seconds',
  'select public.marsh_advance_production_drying()');
