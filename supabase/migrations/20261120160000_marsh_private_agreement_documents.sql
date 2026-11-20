create table if not exists public.marsh_agreement_documents (
  document_key text primary key check (document_key in ('agreement','schedule-c')),
  content_base64 text not null,
  updated_at timestamptz not null default now()
);
alter table public.marsh_agreement_documents enable row level security;
revoke all on public.marsh_agreement_documents from public, anon, authenticated;
grant select, insert, update on public.marsh_agreement_documents to service_role;
