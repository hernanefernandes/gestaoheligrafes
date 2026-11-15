-- Corrige a reposição duplicada: stock_movements é a única origem da alteração
-- de stock_balances através do trigger private.apply_stock_movement().

create or replace function public.heli_admin_restock(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'A quantidade deve ser superior a zero.';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'O custo unitário não pode ser negativo.';
  end if;

  select organization_id into v_org
  from public.products
  where id = p_product_id and is_active = true;
  if v_org is null then
    raise exception 'Produto não encontrado ou inactivo.';
  end if;
  if not public.has_org_role(v_org, ARRAY['owner','admin','manager']::text[])
     or not public.can_access_location(v_org, p_location_id) then
    raise exception 'Sem permissão para repor stock neste local.';
  end if;

  -- O trigger aplica este movimento ao saldo uma única vez.
  insert into public.stock_movements(
    organization_id, location_id, product_id, movement_type,
    quantity, unit_cost, reference_type, notes, created_by
  )
  values(
    v_org, p_location_id, p_product_id, 'entry',
    p_quantity, p_unit_cost, 'admin_restock',
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  );

  select quantity into v_balance
  from public.stock_balances
  where organization_id = v_org
    and location_id = p_location_id
    and product_id = p_product_id;

  return jsonb_build_object('success', true, 'new_quantity', v_balance);
end;
$function$;

create or replace function public.heli_admin_restock_all(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_location record;
  v_total integer := 0;
  v_new_quantity numeric;
  v_results jsonb := '[]'::jsonb;
  v_location_count integer;
  v_accessible_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'A quantidade deve ser superior a zero.';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'O custo unitário não pode ser negativo.';
  end if;

  select organization_id into v_org
  from public.products
  where id = p_product_id and is_active = true;
  if v_org is null then
    raise exception 'Produto não encontrado ou inactivo.';
  end if;
  if not public.has_org_role(v_org, ARRAY['owner','admin','manager']::text[]) then
    raise exception 'Sem permissão para repor stock.';
  end if;

  select count(*) into v_location_count
  from public.locations
  where organization_id = v_org and is_active = true;
  select count(*) into v_accessible_count
  from public.locations
  where organization_id = v_org and is_active = true
    and public.can_access_location(v_org, id);
  if v_location_count = 0 or v_accessible_count <> v_location_count then
    raise exception 'Não tem acesso a todos os locais. Escolha um local individual ou solicite autorização.';
  end if;

  for v_location in
    select id from public.locations
    where organization_id = v_org and is_active = true
    order by code
  loop
    -- Cada local recebe p_quantity uma única vez pelo trigger.
    insert into public.stock_movements(
      organization_id, location_id, product_id, movement_type,
      quantity, unit_cost, reference_type, notes, created_by
    )
    values(
      v_org, v_location.id, p_product_id, 'entry',
      p_quantity, p_unit_cost, 'admin_restock_all',
      nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
    );

    select quantity into v_new_quantity
    from public.stock_balances
    where organization_id = v_org
      and location_id = v_location.id
      and product_id = p_product_id;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('location_id', v_location.id, 'new_quantity', v_new_quantity)
    );
    v_total := v_total + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'locations_updated', v_total,
    'balances', v_results
  );
end;
$function$;
