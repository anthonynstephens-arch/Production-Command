update public.marsh_portal_users
set email = case display_name
  when 'Michael' then 'mj.detroit12@gmail.com'
  when 'Vidal' then 'vidalmarsh@gmail.com'
  else email
end
where display_name in ('Michael', 'Vidal');

update public.marsh_notification_preferences p
set email = coalesce(p.email, u.email),
    channel = case
      when coalesce(p.email, u.email) is null then p.channel
      when p.channel in ('push', 'both') then 'both'
      else 'email'
    end,
    chat = true,
    billing = true,
    supplies = true,
    shipping_issues = true,
    updated_at = now()
from public.marsh_portal_users u
where u.id = p.user_id;
