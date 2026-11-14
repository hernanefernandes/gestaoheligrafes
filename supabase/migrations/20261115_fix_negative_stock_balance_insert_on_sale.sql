-- Fix: a negative stock movement must UPDATE an existing balance.
-- INSERT ... ON CONFLICT still validates the proposed negative row against
-- stock_balances_quantity_check before resolving the conflict.
create or replace function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delta numeric(14,3);
begin
  v_delta := case
    when new.movement_type in ('entry','adjustment_in','transfer_in','return') then new.quantity
    when new.movement_type in ('sale','adjustment_out','transfer_out','loss') then -new.quantity
    else 0
  end;

  if v_delta > 0 then
    insert into public.stock_balances(
      organization_id, location_id, product_id, quantity
    )
    values (
      new.organization_id, new.location_id, new.product_id, v_delta
    )
    on conflict (location_id, product_id)
    do update set
      quantity = public.stock_balances.quantity + excluded.quantity,
      updated_at = now();

  elsif v_delta < 0 then
    update public.stock_balances
       set quantity = quantity + v_delta,
           updated_at = now()
     where organization_id = new.organization_id
       and location_id = new.location_id
       and product_id = new.product_id
       and quantity >= -v_delta;

    if not found then
      raise exception 'Stock insuficiente ou não registado para este produto neste local.';
    end if;
  end if;

  return new;
end;
$function$;
