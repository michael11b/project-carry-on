
-- Allow admins to insert org members (currently only owners can)
CREATE POLICY "Admins can insert members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role])
);

-- Allow admins to delete org members
CREATE POLICY "Admins can delete members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role])
);

-- Allow org members to read co-member profiles (for displaying names/avatars)
CREATE POLICY "Org members can read co-member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om1
    JOIN public.organization_members om2 ON om1.org_id = om2.org_id
    WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id
  )
);
