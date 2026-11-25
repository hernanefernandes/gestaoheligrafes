drop policy if exists company_financial_entries_staff_insert on public.company_financial_entries;
create policy company_financial_entries_staff_insert
on public.company_financial_entries
for insert to authenticated
with check (
  not has_org_role(organization_id, array['owner','admin']::text[])
  and created_by = auth.uid()
  and location_id is not null
  and exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()
      and ura.organization_id = company_financial_entries.organization_id
      and ura.location_id = company_financial_entries.location_id
  )
);

drop policy if exists company_financial_entries_staff_select on public.company_financial_entries;
create policy company_financial_entries_staff_select
on public.company_financial_entries
for select to authenticated
using (
  not has_org_role(organization_id, array['owner','admin']::text[])
  and location_id is not null
  and exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()
      and ura.organization_id = company_financial_entries.organization_id
      and ura.location_id = company_financial_entries.location_id
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'company_financial_entries'
     ) then
    alter publication supabase_realtime add table public.company_financial_entries;
  end if;
end $$;