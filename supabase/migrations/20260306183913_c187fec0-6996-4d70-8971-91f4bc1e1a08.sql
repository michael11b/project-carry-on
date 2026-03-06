
-- Allow owners/admins to update their org
CREATE POLICY "Admins+ can update org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  has_any_role(auth.uid(), id, ARRAY['owner'::app_role, 'admin'::app_role])
);
