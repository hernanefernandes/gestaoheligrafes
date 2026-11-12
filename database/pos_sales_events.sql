-- Estrutura aplicada no projecto Supabase Gestão Heligrafes v52.
-- Tabela de eventos de vendas POS: idempotência, fila offline e Realtime.
create table if not exists public.pos_sales_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  location_id uuid not null,
  local_sale_id text not null,
  sale_payload jsonb not null,
  total numeric(14,2) not null default 0 check (total >= 0),
  paid numeric(14,2) not null default 0 check (paid >= 0),
  category text not null default 'OTHER',
  seller_name text not null default 'Sem utilizador',
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint pos_sales_events_location_org_fk
    foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete restrict,
  constraint pos_sales_events_local_id_unique unique (organization_id, local_sale_id)
);
create index if not exists pos_sales_events_org_time_idx
  on public.pos_sales_events (organization_id, occurred_at desc);
create index if not exists pos_sales_events_location_time_idx
  on public.pos_sales_events (location_id, occurred_at desc);
create index if not exists pos_sales_events_created_by_idx
  on public.pos_sales_events(created_by);
create index if not exists pos_sales_events_location_org_fk_idx
  on public.pos_sales_events(location_id, organization_id);
alter table public.pos_sales_events enable row level security;
drop policy if exists pos_sales_events_read on public.pos_sales_events;
create policy pos_sales_events_read on public.pos_sales_events
  for select to authenticated
  using (public.can_access_location(organization_id, location_id));
drop policy if exists pos_sales_events_insert on public.pos_sales_events;
create policy pos_sales_events_insert on public.pos_sales_events
  for insert to authenticated
  with check (
    public.can_access_location(organization_id, location_id)
    and created_by = (select auth.uid())
  );
revoke all on table public.pos_sales_events from anon;\nrevoke all on table public.pos_sales_events from authenticated;\ngrant select, insert on table public.pos_sales_events to authenticated;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'pos_sales_events'
     ) then
    alter publication supabase_realtime add table public.pos_sales_events;
  end if;
end $$;
