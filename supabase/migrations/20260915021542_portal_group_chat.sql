alter table public.marsh_messages alter column recipient_id drop not null;
create index marsh_messages_group_idx on public.marsh_messages(id desc) where recipient_id is null;
create table public.marsh_group_reads (
 user_id uuid primary key references public.marsh_portal_users(id) on delete cascade,
 last_read_id bigint not null default 0 check (last_read_id >= 0)
);
alter table public.marsh_group_reads enable row level security;
revoke all on public.marsh_group_reads from anon,authenticated;
grant all on public.marsh_group_reads to service_role;
create function public.mark_marsh_group_read(reader_id uuid, through_id bigint)
returns void language sql security invoker set search_path = '' as $$
 insert into public.marsh_group_reads(user_id,last_read_id)
 select reader_id, coalesce(max(id),0) from public.marsh_messages where recipient_id is null and id <= through_id
 on conflict(user_id) do update set last_read_id=greatest(public.marsh_group_reads.last_read_id,excluded.last_read_id);
$$;
revoke all on function public.mark_marsh_group_read(uuid,bigint) from public,anon,authenticated;
grant execute on function public.mark_marsh_group_read(uuid,bigint) to service_role;
