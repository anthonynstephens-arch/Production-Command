alter table public.marsh_portal_users add column if not exists can_create_charges boolean not null default false;
create table public.marsh_messages (
 id bigint generated always as identity primary key,
 client_id uuid not null,
 sender_id uuid not null references public.marsh_portal_users(id),
 recipient_id uuid not null references public.marsh_portal_users(id),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 constraint marsh_messages_different_users check (sender_id <> recipient_id),
 constraint marsh_messages_retry_unique unique(sender_id,client_id)
);
create index marsh_messages_conversation_idx on public.marsh_messages(sender_id,recipient_id,id desc);
create index marsh_messages_unread_idx on public.marsh_messages(recipient_id,sender_id) where read_at is null;
alter table public.marsh_messages enable row level security;
revoke all on public.marsh_messages from anon,authenticated;
grant all on public.marsh_messages to service_role;
grant usage,select on sequence public.marsh_messages_id_seq to service_role;
