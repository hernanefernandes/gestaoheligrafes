alter table public.employees
  add column if not exists legacy_employee_id text,
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_org_legacy_employee_id_key'
  ) then
    alter table public.employees
      add constraint employees_org_legacy_employee_id_key
      unique (organization_id, legacy_employee_id);
  end if;
end
$$;

create unique index if not exists employees_linked_user_id_uidx
  on public.employees(linked_user_id)
  where linked_user_id is not null;

drop policy if exists attendance_delete_admin on public.attendance_records;
create policy attendance_delete_admin
  on public.attendance_records
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','hr']));

grant delete on public.attendance_records to authenticated;

create or replace function private.heli_current_employee_attendance_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_employee public.employees%rowtype;
  v_location_id uuid;
  v_location_count integer;
  v_work_date date;
  v_record public.attendance_records%rowtype;
begin
  if v_user_id is null then raise exception 'Sessão não autenticada.'; end if;

  select up.organization_id into v_org_id
  from public.user_profiles up
  where up.user_id = v_user_id and up.is_active = true;

  if v_org_id is null then
    raise exception 'Perfil activo não encontrado. Contacte o administrador.';
  end if;

  select count(*) into v_location_count
  from public.employees e
  where e.organization_id = v_org_id
    and e.linked_user_id = v_user_id
    and e.is_active = true;

  if v_location_count <> 1 then
    raise exception 'A conta ainda não está associada a um único colaborador activo no RH. Contacte o administrador.';
  end if;

  select e.* into v_employee
  from public.employees e
  where e.organization_id = v_org_id
    and e.linked_user_id = v_user_id
    and e.is_active = true
  limit 1;

  select count(distinct a.location_id) into v_location_count
  from public.user_role_assignments a
  join public.locations l
    on l.id = a.location_id
   and l.organization_id = a.organization_id
   and l.is_active = true
  where a.user_id = v_user_id
    and a.organization_id = v_org_id
    and a.location_id is not null;

  if v_location_count <> 1 then
    raise exception 'A conta deve ter exactamente um local activo atribuído. Contacte o administrador.';
  end if;

  select a.location_id into v_location_id
  from public.user_role_assignments a
  join public.locations l
    on l.id = a.location_id
   and l.organization_id = a.organization_id
   and l.is_active = true
  where a.user_id = v_user_id
    and a.organization_id = v_org_id
    and a.location_id is not null
  limit 1;

  if not exists (
    select 1 from public.employee_locations el
    where el.organization_id = v_org_id
      and el.employee_id = v_employee.id
      and el.location_id = v_location_id
  ) then
    raise exception 'O local do colaborador não está associado ao seu cadastro RH. Contacte o administrador.';
  end if;

  v_work_date := (timezone('Africa/Luanda', now()))::date;

  select ar.* into v_record
  from public.attendance_records ar
  where ar.organization_id = v_org_id
    and ar.employee_id = v_employee.id
    and ar.work_date = v_work_date
  limit 1;

  return jsonb_build_object(
    'employee_id', v_employee.id,
    'employee_name', v_employee.full_name,
    'organization_id', v_org_id,
    'location_id', v_location_id,
    'work_date', v_work_date,
    'check_in', v_record.check_in,
    'check_out', v_record.check_out,
    'status', coalesce(v_record.status, 'pending'),
    'closed', v_record.check_out is not null
  );
end;
$$;

revoke all on function private.heli_current_employee_attendance_context() from public, anon, authenticated;

create or replace function public.heli_attendance_bootstrap()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.heli_current_employee_attendance_context();
$$;

create or replace function public.heli_mark_attendance(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_employee_id uuid;
  v_org_id uuid;
  v_location_id uuid;
  v_work_date date;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_status text;
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'Sessão não autenticada.'; end if;
  if v_action not in ('IN', 'OUT') then raise exception 'Acção de presença inválida.'; end if;

  v_context := private.heli_current_employee_attendance_context();
  v_employee_id := (v_context ->> 'employee_id')::uuid;
  v_org_id := (v_context ->> 'organization_id')::uuid;
  v_location_id := (v_context ->> 'location_id')::uuid;
  v_work_date := (v_context ->> 'work_date')::date;
  v_check_in := nullif(v_context ->> 'check_in', '')::timestamptz;
  v_check_out := nullif(v_context ->> 'check_out', '')::timestamptz;

  if v_action = 'IN' then
    if v_check_in is not null then raise exception 'A entrada já foi registada hoje.'; end if;
    if v_check_out is not null then raise exception 'A saída já foi registada hoje. O acesso operacional está encerrado.'; end if;

    v_status := case
      when (timezone('Africa/Luanda', now()))::time > time '08:30' then 'late'
      else 'present'
    end;

    insert into public.attendance_records (
      organization_id, employee_id, location_id, work_date, check_in, check_out, status
    ) values (
      v_org_id, v_employee_id, v_location_id, v_work_date, now(), null, v_status
    )
    on conflict (employee_id, work_date)
    do update set
      location_id = excluded.location_id,
      check_in = excluded.check_in,
      check_out = null,
      status = excluded.status,
      notes = null
    where public.attendance_records.check_in is null
      and public.attendance_records.check_out is null;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'A entrada já foi registada hoje ou a presença foi encerrada.'; end if;
  else
    if v_check_in is null then raise exception 'Registe a entrada antes de marcar a saída.'; end if;
    if v_check_out is not null then raise exception 'A saída já foi registada hoje.'; end if;

    update public.attendance_records set check_out = now()
    where organization_id = v_org_id
      and employee_id = v_employee_id
      and work_date = v_work_date
      and check_in is not null
      and check_out is null;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'Não foi possível registar a saída. Verifique a marcação de entrada.'; end if;
  end if;

  return private.heli_current_employee_attendance_context();
end;
$$;

revoke all on function public.heli_attendance_bootstrap() from public, anon, authenticated;
revoke all on function public.heli_mark_attendance(text) from public, anon, authenticated;
grant execute on function public.heli_attendance_bootstrap() to authenticated;
grant execute on function public.heli_mark_attendance(text) to authenticated;

comment on function public.heli_attendance_bootstrap() is
  'Returns only the authenticated employee attendance status for the current Luanda work date; no payroll data.';
comment on function public.heli_mark_attendance(text) is
  'Marks authenticated employee check-in or check-out; check-in after 08:30 is classified as late.';