CREATE OR REPLACE FUNCTION public.heli_sync_legacy_stock_alert(p_org uuid, p_product_name text, p_location_name text, p_quantity numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_product_name, '')), '');
  v_location text := nullif(trim(coalesce(p_location_name, '')), '');
  v_location_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF v_name IS NULL OR v_location IS NULL OR p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'Dados de stock inválidos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.user_id = v_user
      AND up.organization_id = p_org
      AND up.is_active = true
  ) THEN
    RAISE EXCEPTION 'Utilizador sem acesso a esta organização.';
  END IF;

  SELECT l.id
    INTO v_location_id
  FROM public.locations l
  WHERE l.organization_id = p_org
    AND l.is_active = true
    AND upper(l.name) = upper(v_location)
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Local inválido para esta organização.';
  END IF;

  IF NOT private.can_access_location(p_org, v_location_id) THEN
    RAISE EXCEPTION 'Não tem permissão para actualizar alertas deste local.';
  END IF;

  IF p_quantity <= 0 THEN
    INSERT INTO public.stock_admin_alerts
      (organization_id, product_name, location_name, alert_type, message)
    VALUES
      (p_org, v_name, v_location, 'stock_zero',
       'Produto sem stock. Reposição urgente necessária.')
    ON CONFLICT (organization_id, product_name, location_name)
      WHERE resolved_at IS NULL AND product_name IS NOT NULL AND location_name IS NOT NULL
    DO NOTHING;

    RETURN jsonb_build_object('success', true, 'alert', 'stock_zero');
  ELSE
    UPDATE public.stock_admin_alerts
       SET resolved_at = coalesce(resolved_at, now())
     WHERE organization_id = p_org
       AND upper(product_name) = upper(v_name)
       AND upper(location_name) = upper(v_location)
       AND resolved_at IS NULL;

    RETURN jsonb_build_object('success', true, 'alert', 'resolved');
  END IF;
END;
$function$;
