alter table public.heli_daily_tasks
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending','delivered')),
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references auth.users(id) on delete set null;

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
      or new.delivery_status is distinct from old.delivery_status
      or new.delivered_at is distinct from old.delivered_at
      or new.delivered_by is distinct from old.delivered_by
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