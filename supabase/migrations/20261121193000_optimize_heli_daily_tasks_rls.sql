-- Optimização de políticas e índices do módulo de tarefas diárias.
drop policy if exists heli_daily_tasks_update_admin on public.heli_daily_tasks;
drop policy if exists heli_daily_tasks_update_assignee on public.heli_daily_tasks;

create policy heli_daily_tasks_update on public.heli_daily_tasks
for update to authenticated
using (
  private.has_org_role(organization_id, array['owner','admin'])
  or assigned_user_id = (select auth.uid())
)
with check (
  private.has_org_role(organization_id, array['owner','admin'])
  or assigned_user_id = (select auth.uid())
);

create index if not exists heli_daily_tasks_location_idx
  on public.heli_daily_tasks (location_id);
create index if not exists heli_daily_tasks_assigned_by_idx
  on public.heli_daily_tasks (assigned_by);
