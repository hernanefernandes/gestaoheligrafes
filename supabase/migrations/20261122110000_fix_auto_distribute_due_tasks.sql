-- Distribui automaticamente encomendas académicas e T-Shirts
-- quando passaram 24 horas sem distribuição manual e a entrega é hoje ou amanhã.
create unique index if not exists heli_daily_tasks_org_order_unique
  on public.heli_daily_tasks (organization_id, order_reference)
  where order_reference is not null;

create or replace function public.heli_auto_distribute_due_tasks()
returns integer
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_sale record;
  v_staff record;
  v_admin uuid;
  v_department text;
  v_title text;
  v_description text;
  v_due_date date;
  v_count integer := 0;
begin
  for v_sale in
    select s.*
    from public.pos_sales_events s
    where upper(coalesce(s.category,'')) in ('ACADEMICO','ACADÉMICO','TSHIRTS','T-SHIRTS')
      and s.occurred_at <= now() - interval '24 hours'
      and (
        case
          when coalesce(s.sale_payload->>'deliveryDate','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then (s.sale_payload->>'deliveryDate')::date
          else null
        end
      ) <= (now() at time zone 'Africa/Luanda')::date + 1
      and not exists (
        select 1
        from public.heli_daily_tasks t
        where t.organization_id=s.organization_id
          and t.order_reference=s.local_sale_id
      )
    order by
      (s.sale_payload->>'deliveryDate')::date asc,
      s.occurred_at asc
  loop
    v_due_date := (v_sale.sale_payload->>'deliveryDate')::date;
    v_department := case
      when upper(v_sale.category) in ('ACADEMICO','ACADÉMICO') then 'Académico'
      else 'T-Shirts'
    end;
    v_title := left(
      coalesce(
        nullif(v_sale.sale_payload->>'desc',''),
        nullif(v_sale.sale_payload->>'description',''),
        v_department||': encomenda'
      ), 140
    );
    v_description := concat_ws(' · ',
      nullif(v_sale.sale_payload->>'client',''),
      nullif(v_sale.sale_payload->>'phone',''),
      nullif(v_sale.sale_payload->>'size',''),
      case
        when nullif(v_sale.sale_payload->>'qty','') is not null
        then 'Quantidade: ' || (v_sale.sale_payload->>'qty')
      end
    );

    select ura.user_id into v_admin
    from public.user_role_assignments ura
    join public.roles r on r.id=ura.role_id
    where ura.organization_id=v_sale.organization_id
      and r.code in ('owner','admin')
    order by case when r.code='owner' then 0 else 1 end
    limit 1;

    if v_admin is null then
      continue;
    end if;

    select
      p.user_id,
      p.full_name,
      p.email,
      ura.location_id,
      coalesce(r.name,'Produção') as team_name
    into v_staff
    from public.user_profiles p
    join public.user_role_assignments ura
      on ura.user_id=p.user_id
     and ura.organization_id=p.organization_id
    join public.roles r on r.id=ura.role_id
    where p.organization_id=v_sale.organization_id
      and p.is_active=true
      and r.code not in ('owner','admin')
    order by (
      select count(*)
      from public.heli_daily_tasks t
      where t.organization_id=v_sale.organization_id
        and t.assigned_user_id=p.user_id
        and t.status='pending'
    ) asc, p.full_name asc
    limit 1;

    if v_staff.user_id is null then
      continue;
    end if;

    insert into public.heli_daily_tasks (
      organization_id,location_id,task_date,order_reference,order_description,
      department,title,description,team_name,assigned_user_id,assignee_name,assigned_by
    ) values (
      v_sale.organization_id,
      v_sale.location_id,
      v_due_date,
      v_sale.local_sale_id,
      concat_ws(' · ',v_sale.seller_name,v_sale.sale_payload->>'client',v_sale.sale_payload->>'desc'),
      v_department,
      v_title,
      nullif(v_description,''),
      v_staff.team_name,
      v_staff.user_id,
      coalesce(v_staff.full_name,v_staff.email),
      v_admin
    )
    on conflict (organization_id,order_reference)
      where order_reference is not null
      do nothing;

    if found then
      v_count := v_count + 1;
    end if;
    v_admin := null;
    v_staff := null;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.heli_auto_distribute_due_tasks() from public, anon, authenticated;
grant execute on function public.heli_auto_distribute_due_tasks() to service_role;

-- Verifica a cada 15 minutos; só distribui depois de completar 24 horas.
select cron.schedule(
  'heli-auto-distribute-due-tasks',
  '*/15 * * * *',
  'select public.heli_auto_distribute_due_tasks();'
);
