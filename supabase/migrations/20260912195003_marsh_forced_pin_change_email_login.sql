alter table public.marsh_portal_users
  add column if not exists email text,
  add column if not exists password_salt text,
  add column if not exists password_hash text,
  add column if not exists must_change_pin boolean not null default true;

create unique index if not exists marsh_portal_users_email_unique
  on public.marsh_portal_users (lower(email)) where email is not null;
