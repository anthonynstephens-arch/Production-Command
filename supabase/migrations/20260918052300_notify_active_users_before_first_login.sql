create or replace function public.enqueue_marsh_notification(event_key text,event_kind text,category text,event_payload jsonb,target_user uuid default null,exclude_user uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare u record; d record; p jsonb; k text;
begin
 for u in select usr.id,usr.display_name,pref.* from public.marsh_portal_users usr join public.marsh_notification_preferences pref on pref.user_id=usr.id
 where usr.active and (target_user is null or usr.id=target_user) and (exclude_user is null or usr.id<>exclude_user)
 and case category when 'chat' then pref.chat when 'billing' then pref.billing when 'supplies' then pref.supplies when 'shipping_issues' then pref.shipping_issues else false end
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
