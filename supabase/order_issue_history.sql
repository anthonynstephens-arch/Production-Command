create table public.marsh_order_issue_history (
 id uuid primary key default gen_random_uuid(),
 account_slug text not null,
 order_id text not null,
 order_number text not null,
 event_type text not null check (event_type in ('flagged','resolved')),
 reason text not null,
 note text,
 actor_name text,
 occurred_at timestamptz not null
);
create index marsh_order_issue_history_order on public.marsh_order_issue_history(account_slug,order_id,occurred_at);
alter table public.marsh_order_issue_history enable row level security;
revoke all on public.marsh_order_issue_history from public,anon,authenticated;
grant select,insert on public.marsh_order_issue_history to service_role;
insert into public.marsh_order_issue_history(account_slug,order_id,order_number,event_type,reason,note,actor_name,occurred_at)
select account_slug,order_id,order_number,'flagged',reason,note,created_by_name,created_at from public.marsh_order_issues;
insert into public.marsh_order_issue_history(account_slug,order_id,order_number,event_type,reason,note,actor_name,occurred_at)
select account_slug,order_id,order_number,'resolved',reason,note,resolved_by_name,resolved_at from public.marsh_order_issues where resolved_at is not null;
create function public.record_marsh_order_issue_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'INSERT' or (NEW.resolved_at is null and (OLD.created_at is distinct from NEW.created_at or OLD.resolved_at is not null or OLD.reason is distinct from NEW.reason or OLD.note is distinct from NEW.note)) then
  insert into public.marsh_order_issue_history(account_slug,order_id,order_number,event_type,reason,note,actor_name,occurred_at)
  values(NEW.account_slug,NEW.order_id,NEW.order_number,'flagged',NEW.reason,NEW.note,NEW.created_by_name,NEW.created_at);
 end if;
 if NEW.resolved_at is not null and (TG_OP = 'INSERT' or OLD.resolved_at is null) then
  insert into public.marsh_order_issue_history(account_slug,order_id,order_number,event_type,reason,note,actor_name,occurred_at)
  values(NEW.account_slug,NEW.order_id,NEW.order_number,'resolved',NEW.reason,NEW.note,NEW.resolved_by_name,NEW.resolved_at);
 end if;
 return NEW;
end;
$$;
revoke all on function public.record_marsh_order_issue_history() from public,anon,authenticated;
grant execute on function public.record_marsh_order_issue_history() to service_role;
create trigger marsh_order_issue_history_capture after insert or update on public.marsh_order_issues
for each row execute function public.record_marsh_order_issue_history();
