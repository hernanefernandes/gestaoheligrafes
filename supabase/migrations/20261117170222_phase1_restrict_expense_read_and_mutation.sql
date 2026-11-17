DROP POLICY IF EXISTS expenses_access ON public.expenses;

CREATE POLICY expenses_admin_read
ON public.expenses FOR SELECT TO authenticated
USING (has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY expenses_local_insert
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  can_access_location(organization_id, location_id)
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY expenses_admin_update
ON public.expenses FOR UPDATE TO authenticated
USING (has_org_role(organization_id, ARRAY['owner','admin']))
WITH CHECK (has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY expenses_admin_delete
ON public.expenses FOR DELETE TO authenticated
USING (has_org_role(organization_id, ARRAY['owner','admin']));
