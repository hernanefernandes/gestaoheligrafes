DROP POLICY IF EXISTS expenses_admin_read ON public.expenses;

CREATE POLICY expenses_read_own_or_admin
ON public.expenses FOR SELECT TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR private.has_org_role(organization_id, ARRAY['owner','admin'])
);
