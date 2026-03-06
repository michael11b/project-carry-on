CREATE POLICY "Editors+ can delete brands"
ON public.brands FOR DELETE TO authenticated
USING (has_any_role(auth.uid(), org_id, ARRAY['owner','admin','editor']::app_role[]));