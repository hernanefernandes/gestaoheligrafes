CREATE OR REPLACE FUNCTION private.can_access_location(p_org uuid, p_location uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.has_org_role(p_org, ARRAY['owner','admin'])
     OR EXISTS (
       SELECT 1
       FROM public.user_role_assignments ura
       WHERE ura.user_id = (SELECT auth.uid())
         AND ura.organization_id = p_org
         AND ura.location_id = p_location
         AND p_location IS NOT NULL
     );
$function$;
