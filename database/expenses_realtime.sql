-- Publica as despesas centrais no Supabase Realtime para actualizar o painel financeiro.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'expenses'
     ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;
