-- pg_net was newly installed for this feature and has no scheduled consumers yet.
drop extension pg_net;
create extension pg_net with schema extensions;
select cron.schedule('production-command-notifications','* * * * *',$job$
 select net.http_post(
 url:='https://production-command-six.vercel.app/api/notifications/dispatch',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select value from public.marsh_notification_config where key='worker_secret')),
 body:='{}'::jsonb,timeout_milliseconds:=55000);
$job$);
-- Enable only after the application deployment is verified.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='production-command-notifications';
