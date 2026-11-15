create or replace function private.heli_mark_attendance(p_action text)
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
    v_status := case when (timezone('Africa/Luanda', now()))::time > time '08:30' then 'late' else 'present' end;

    insert into public.attendance_records (
      organization_id, employee_id, location_id, work_date, check_in, check_out, status
    ) values (
      v_org_id, v_employee_id, v_location_id, v_work_date, now(), null, v_status
    )
    on conflict (employee_id, work_date)
    do update set location_id = excluded.location_id, check_in = excluded.check_in,
      check_out = null, status = excluded.status, notes = null
    where public.attendance_records.check_in is null
      and public.attendance_records.check_out is null;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'A entrada já foi registada hoje ou a presença foi encerrada.'; end if;
  else
    if v_check_in is null then raise exception 'Registe a entrada antes de marcar a saída.'; end if;
    if v_check_out is not null then raise exception 'A saída já foi registada hoje.'; end if;
    update public.attendance_records set check_out = now()
    where organization_id = v_org_id and employee_id = v_employee_id
      and work_date = v_work_date and check_in is not null and check_out is null;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'Não foi possível registar a saída. Verifique a marcação de entrada.'; end if;
  end if;
  return private.heli_current_employee_attendance_context();
end;
$$;

revoke all on function private.heli_mark_attendance(text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.heli_current_employee_attendance_context() to authenticated;
grant execute on function private.heli_mark_attendance(text) to authenticated;

create or replace function public.heli_attendance_bootstrap()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.heli_current_employee_attendance_context();
$$;

create or replace function public.heli_mark_attendance(p_action text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.heli_mark_attendance(p_action);
$$;

revoke all on function public.heli_attendance_bootstrap() from public, anon, authenticated;
revoke all on function public.heli_mark_attendance(text) from public, anon, authenticated;
grant execute on function public.heli_attendance_bootstrap() to authenticated;
grant execute on function public.heli_mark_attendance(text) to authenticated;