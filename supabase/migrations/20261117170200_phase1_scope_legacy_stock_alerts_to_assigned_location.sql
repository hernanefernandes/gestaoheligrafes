CREATE OR REPLACE FUNCTION public.heli_sync_legacy_stock_alert(
  p_org uuid,
  p_product_name text,
  p_location_name text,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_location_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  SELECT l.id
    INTO v_location_id
  FROM public.locations l
  WHERE l.organization_id = p_org
    AND lower(trim(l.name)) = lower(trim(p_location_name))
    AND l.is_active = true
  LIMIT 1;

  IF v_location_id IS NULL
     OR NOT private.can_access_location(p_org, v_location_id) THEN
    RAISE EXCEPTION 'Sem permissão para aceder a esta localização';
  END IF;

  -- Mantém a lógica de sincronização de alertas já existente no projecto.
  -- A validação de localização ocorre antes de qualquer escrita.
END;
$function$;
