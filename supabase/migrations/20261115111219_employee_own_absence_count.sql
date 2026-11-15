-- Exibe ao colaborador apenas a sua própria contagem de faltas.
-- Não expõe salários, registos ou contagens de outros colaboradores.
create or replace function private.heli_current_employee_absence_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.attendance_records ar
  join public.employees e
    on e.id = ar.employee_id
   and e.organization_id = ar.organization_id
  where e.linked_user_id = auth.uid()
    and e.is_active = true
    and ar.status = 'absent';
$$;

revoke all on function private.heli_current_employee_absence_count() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.heli_current_employee_absence_count() to authenticated;

create or replace function public.heli_attendance_bootstrap()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.heli_current_employee_attendance_context()
      || jsonb_build_object('absence_count', private.heli_current_employee_absence_count());
$$;

revoke all on function public.heli_attendance_bootstrap() from public, anon, authenticated;
grant execute on function public.heli_attendance_bootstrap() to authenticated;

comment on function private.heli_current_employee_absence_count() is
  'Returns only the authenticated active employee total of recorded absences; no other employee data.';
