create table public.marsh_notification_config(key text primary key,value text not null);
create table public.marsh_notification_preferences(
 user_id uuid primary key references public.marsh_portal_users(id) on delete cascade,
 channel text not null default 'none' check(channel in ('none','push','email','both')),
 email text,
 chat boolean not null default true,
 billing boolean not null default false,
 supplies boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.marsh_push_subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.marsh_portal_users(id) on delete cascade,
 endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now()
);
create table public.marsh_notification_queue(
 id uuid primary key default gen_random_uuid(),event_id text not null,event_type text not null,
 recipient_id uuid not null references public.marsh_portal_users(id) on delete cascade,
 channel text not null check(channel in ('email','push')),device_id uuid references public.marsh_push_subscriptions(id) on delete cascade,
 payload jsonb not null,deduplication_key text not null unique,
 status text not null default 'pending' check(status in ('pending','processing','accepted','skipped','failed')),
 attempts integer not null default 0,available_at timestamptz not null default now(),created_at timestamptz not null default now(),last_error text
);
create index marsh_notification_queue_pending_idx on public.marsh_notification_queue(available_at) where status in ('pending','processing');
create table public.marsh_notification_conditions(key text primary key,is_low boolean not null,episode uuid not null default gen_random_uuid());
create table public.marsh_notification_worker_lock(id integer primary key check(id=1),until_at timestamptz not null default now());
insert into public.marsh_notification_worker_lock(id) values(1);

alter table public.marsh_notification_config enable row level security;
alter table public.marsh_notification_preferences enable row level security;
alter table public.marsh_push_subscriptions enable row level security;
alter table public.marsh_notification_queue enable row level security;
alter table public.marsh_notification_conditions enable row level security;
alter table public.marsh_notification_worker_lock enable row level security;
revoke all on public.marsh_notification_config,public.marsh_notification_preferences,public.marsh_push_subscriptions,public.marsh_notification_queue,public.marsh_notification_conditions,public.marsh_notification_worker_lock from anon,authenticated;
grant all on public.marsh_notification_config,public.marsh_notification_preferences,public.marsh_push_subscriptions,public.marsh_notification_queue,public.marsh_notification_conditions,public.marsh_notification_worker_lock to service_role;

create function public.marsh_notification_balance() returns numeric language sql security invoker set search_path='' as $$
 select greatest(0,coalesce((select sum(amount) from public.marsh_charges),0)-coalesce((select sum(amount) from public.marsh_payments where status='confirmed'),0));
$$;
create function public.enqueue_marsh_notification(event_key text,event_kind text,category text,event_payload jsonb,target_user uuid default null,exclude_user uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare u record; d record; p jsonb; k text;
begin
 for u in select usr.id,usr.display_name,pref.* from public.marsh_portal_users usr join public.marsh_notification_preferences pref on pref.user_id=usr.id
 where usr.active and not usr.must_change_pin and (target_user is null or usr.id=target_user) and (exclude_user is null or usr.id<>exclude_user)
 and case category when 'chat' then pref.chat when 'billing' then pref.billing when 'supplies' then pref.supplies else false end
 loop
  p:=event_payload || jsonb_build_object('event_id',event_key,'event_type',event_kind,'occurred_at',now(),'recipient_id',u.id,'recipient_name',u.display_name,'recipient_email',u.email,'recipient_active',true,'notification_preference',u.channel,'category_enabled',true,'category',category,'notification_settings_url','https://production-command-six.vercel.app/?notifications=1');
  if u.channel in ('email','both') and u.email is not null then
   k:=event_key||':'||u.id||':email';
   insert into public.marsh_notification_queue(event_id,event_type,recipient_id,channel,payload,deduplication_key)
   values(event_key,event_kind,u.id,'email',p||jsonb_build_object('deduplication_key',k),k) on conflict(deduplication_key) do nothing;
  end if;
  if u.channel in ('push','both') then
   for d in select id from public.marsh_push_subscriptions where user_id=u.id loop
    k:=event_key||':'||u.id||':push:'||d.id;
    insert into public.marsh_notification_queue(event_id,event_type,recipient_id,channel,device_id,payload,deduplication_key)
    values(event_key,event_kind,u.id,'push',d.id,p||jsonb_build_object('deduplication_key',k),k) on conflict(deduplication_key) do nothing;
   end loop;
  end if;
 end loop;
end; $$;
create function public.marsh_chat_notification() returns trigger language plpgsql security invoker set search_path='' as $$
declare sender_name text; kind text;
begin
 select display_name into sender_name from public.marsh_portal_users where id=new.sender_id;
 kind:=case when new.recipient_id is null then 'group_message' else 'direct_message' end;
 perform public.enqueue_marsh_notification('message:'||new.id,kind,'chat',jsonb_build_object('sender_id',new.sender_id,'sender_name',sender_name,'message_preview',left(new.body,160),'target_url','https://production-command-six.vercel.app/?chat='||coalesce(new.sender_id::text,'group'),'title',case when new.recipient_id is null then 'New group message' else 'New private message' end,'body',sender_name||': '||left(new.body,160)) || jsonb_build_object('target_url','https://production-command-six.vercel.app/?chat='||case when new.recipient_id is null then 'group' else new.sender_id::text end),new.recipient_id,new.sender_id);
 return new;
end; $$;
create trigger marsh_chat_notification after insert on public.marsh_messages for each row execute function public.marsh_chat_notification();
create function public.marsh_charge_notification() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.enqueue_marsh_notification('charge:'||new.id,'ledger_charge_added','billing',jsonb_build_object('charge_description',new.description,'amount_formatted','$'||to_char(new.amount,'FM9999999990.00'),'balance_amount',public.marsh_notification_balance(),'balance_formatted','$'||to_char(public.marsh_notification_balance(),'FM9999999990.00'),'target_url','https://production-command-six.vercel.app/#operations','title','New ledger charge','body','$'||to_char(new.amount,'FM9999999990.00')||' — '||new.description));
 return new;
end; $$;
create trigger marsh_charge_notification after insert on public.marsh_charges for each row execute function public.marsh_charge_notification();
create function public.marsh_check_supply(supply_key text,low_now boolean,details jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare s record;
begin
 insert into public.marsh_notification_conditions(key,is_low) values(supply_key,false) on conflict(key) do nothing;
 select * into s from public.marsh_notification_conditions where key=supply_key for update;
 if low_now and not s.is_low then
  update public.marsh_notification_conditions set is_low=true,episode=gen_random_uuid() where key=supply_key returning * into s;
  perform public.enqueue_marsh_notification('supply:'||supply_key||':'||s.episode,'supplies_low','supplies',details);
 elsif not low_now then update public.marsh_notification_conditions set is_low=false where key=supply_key;
 end if;
end; $$;
create function public.marsh_daily_balance() returns void language plpgsql security invoker set search_path='' as $$
declare b numeric; d text;
begin
 -- One reminder event per Detroit business day, starting at 10 AM Eastern.
 if extract(hour from now() at time zone 'America/Detroit') < 10 then return; end if;
 b:=public.marsh_notification_balance(); d:=to_char(now() at time zone 'America/Detroit','YYYY-MM-DD');
 if b>0 then perform public.enqueue_marsh_notification('balance:'||d,'balance_due','billing',jsonb_build_object('balance_amount',b,'balance_formatted','$'||to_char(b,'FM9999999990.00'),'title','Balance owed to Detroit Decal','body','$'||to_char(b,'FM9999999990.00')||' remains outstanding.','target_url','https://production-command-six.vercel.app/#operations')); end if;
end; $$;
create function public.marsh_claim_notifications() returns setof public.marsh_notification_queue language sql security invoker set search_path='' as $$
 with chosen as (select id from public.marsh_notification_queue where status in ('pending','processing') and available_at<=now() and attempts<5 order by created_at for update skip locked limit 30)
 update public.marsh_notification_queue q set status='processing',attempts=attempts+1,available_at=now()+interval '5 minutes' from chosen where q.id=chosen.id returning q.*;
$$;
create function public.marsh_acquire_notification_worker() returns boolean language sql security invoker set search_path='' as $$
 with locked as (update public.marsh_notification_worker_lock set until_at=now()+interval '2 minutes' where id=1 and until_at<now() returning id) select exists(select 1 from locked);
$$;
revoke all on function public.marsh_notification_balance(),public.enqueue_marsh_notification(text,text,text,jsonb,uuid,uuid),public.marsh_chat_notification(),public.marsh_charge_notification(),public.marsh_check_supply(text,boolean,jsonb),public.marsh_daily_balance(),public.marsh_claim_notifications(),public.marsh_acquire_notification_worker() from public,anon,authenticated;
grant execute on function public.marsh_notification_balance(),public.enqueue_marsh_notification(text,text,text,jsonb,uuid,uuid),public.marsh_chat_notification(),public.marsh_charge_notification(),public.marsh_check_supply(text,boolean,jsonb),public.marsh_daily_balance(),public.marsh_claim_notifications(),public.marsh_acquire_notification_worker() to service_role;
create extension if not exists pg_cron;
create extension if not exists pg_net;
