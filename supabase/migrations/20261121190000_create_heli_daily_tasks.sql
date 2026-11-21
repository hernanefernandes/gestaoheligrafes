-- Gestão de tarefas diárias por funcionário/equipa — Grupo Heligrafes
create table if not exists public.heli_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  task_date date not null default (now() at time zone 'Africa/Luanda')::date,
  order_reference text,
  order_description text,
  department text not null default 'Geral',
  title text not null,
  description text,
  team_name text not null default 'Geral',
  assigned_user_id uuid not null references auth.users(id) on delete restrict,
  assignee_name text not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','done')),
  completion_reaction text,
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists heli_daily_tasks_org_date_idx
  on public.heli_daily_tasks (organization_id, task_date desc);
create index if not exists heli_daily_tasks_assignee_date_idx
  on public.heli_daily_tasks (assigned_user_id, task_date desc);
create index if not exists heli_daily_tasks_team_date_idx
  on public.heli_daily_tasks (organization_id, team_name, task_date desc);

alter table public.heli_daily_tasks enable row level security;
grant select, insert, update, delete on public.heli_daily_tasks to authenticated;

drop policy if exists heli_daily_tasks_read on public.heli_daily_tasks;
create policy heli_daily_tasks_read on public.heli_daily_tasks
for select to authenticated
using (
  assigned_user_id = (select auth.uid())
  or private.has_org_role(organization_id, array['owner','admin'])
);

drop policy if exists heli_daily_tasks_insert_admin on public.heli_daily_tasks;
create policy heli_daily_tasks_insert_admin on public.heli_daily_tasks
for insert to authenticated
with check (
  assigned_by = (select auth.uid())
  and private.has_org_role(organization_id, array['owner','admin'])
);

drop policy if exists heli_daily_tasks_update_admin on public.heli_daily_tasks;
create policy heli_daily_tasks_update_admin on public.heli_daily_tasks
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists heli_daily_tasks_update_assignee on public.heli_daily_tasks;
create policy heli_daily_tasks_update_assignee on public.heli_daily_tasks
for update to authenticated
using (assigned_user_id = (select auth.uid()))
with check (assigned_user_id = (select auth.uid()));

-- Impede que o funcionário altere a atribuição, o texto ou o valor da tarefa.
create or replace function public.heli_guard_daily_task_update()
returns trigger language plpgsql security invoker set search_path = public, private
as $$
begin
  if not private.has_org_role(old.organization_id, array['owner','admin']) then
    if new.organization_id is distinct from old.organization_id
      or new.location_id is distinct from old.location_id
      or new.task_date is distinct from old.task_date
      or new.order_reference is distinct from old.order_reference
      or new.order_description is distinct from old.order_description
      or new.department is distinct from old.department
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.team_name is distinct from old.team_name
      or new.assigned_user_id is distinct from old.assigned_user_id
      or new.assignee_name is distinct from old.assignee_name
      or new.assigned_by is distinct from old.assigned_by
      or new.created_at is distinct from old.created_at
      or new.status <> 'done'
    then
      raise exception 'Funcionário só pode marcar a sua própria tarefa como concluída.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists heli_daily_tasks_guard_update on public.heli_daily_tasks;
create trigger heli_daily_tasks_guard_update
before update on public.heli_daily_tasks
for each row execute function public.heli_guard_daily_task_update();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'heli_daily_tasks'
     ) then
    alter publication supabase_realtime add table public.heli_daily_tasks;
  end if;
end $$;
