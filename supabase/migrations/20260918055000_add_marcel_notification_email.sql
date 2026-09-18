update public.marsh_portal_users
set email = 'marcelcm15@gmail.com'
where display_name = 'Marcel Montgomery';

update public.marsh_notification_preferences p
set email = 'marcelcm15@gmail.com',
    channel = case when p.channel in ('push', 'both') then 'both' else 'email' end,
    chat = true,
    billing = true,
    supplies = true,
    shipping_issues = true,
    updated_at = now()
from public.marsh_portal_users u
where p.user_id = u.id and u.display_name = 'Marcel Montgomery';
