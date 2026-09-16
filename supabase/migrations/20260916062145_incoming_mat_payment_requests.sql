alter table public.marsh_incoming_deliveries
  add column payment_requested_to uuid references public.marsh_portal_users(id),
  add column payment_requested_at timestamptz,
  add column payment_request_amount numeric(12,2);
create index marsh_deliveries_payment_recipient_idx on public.marsh_incoming_deliveries(payment_requested_to) where payment_requested_to is not null;

-- A delivery and its private payment request commit together, or neither is saved.
create function public.marsh_incoming_payment_request() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient_name text;
begin
  if new.payment_requested_to is null then
    new.payment_requested_at := null;
    new.payment_request_amount := null;
    return new;
  end if;
  if new.supply_type <> 'mats' or new.quantity is null or new.quantity <= 0 then
    raise exception 'Payment requests require an incoming blank mat order' using errcode='23514';
  end if;
  select display_name into recipient_name from public.marsh_portal_users
    where id=new.payment_requested_to and active;
  if recipient_name is null or new.submitted_by is null or new.payment_requested_to=new.submitted_by then
    raise exception 'An active payment recipient other than the sender is required' using errcode='23514';
  end if;
  new.payment_requested_at := now();
  new.payment_request_amount := round(new.quantity * 14,2);
  insert into public.marsh_messages(sender_id,recipient_id,client_id,body)
  values(new.submitted_by,new.payment_requested_to,new.id,
    'PAYMENT REQUEST: $'||to_char(new.payment_request_amount,'FM9999999990.00')||E'\n'||
    new.submitted_by_name||' requested prepayment for '||new.quantity::text||' incoming blank coir mats at $14.00 per mat ($12 decoration + $2 fulfillment).'||E'\n'||
    'Shipment: '||new.carrier||' — '||new.tracking_number||E'\n'||
    'Please arrange payment before the mats arrive, then record the payment in the Production Command ledger.'||E'\n'||
    'https://production-command-six.vercel.app/#operations'||E'\n'||
    'Delivery reference: '||new.id::text);
  return new;
end; $$;
revoke all on function public.marsh_incoming_payment_request() from public,anon,authenticated;
grant execute on function public.marsh_incoming_payment_request() to service_role;
create trigger marsh_incoming_payment_request before insert on public.marsh_incoming_deliveries
for each row execute function public.marsh_incoming_payment_request();
