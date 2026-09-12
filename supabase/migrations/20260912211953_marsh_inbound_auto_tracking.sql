alter table public.marsh_incoming_deliveries add column if not exists supplier text;
alter table public.marsh_incoming_deliveries add column if not exists tracking_url text;
alter table public.marsh_incoming_deliveries add column if not exists tracking_provider text;
alter table public.marsh_incoming_deliveries add column if not exists last_tracking_check timestamptz;
alter table public.marsh_incoming_deliveries add column if not exists tracking_message text;
