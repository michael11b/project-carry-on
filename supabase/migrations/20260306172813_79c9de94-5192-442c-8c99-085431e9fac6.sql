
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-logos', 'brand-logos', true);

CREATE POLICY "Authenticated users can upload brand logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-logos');

CREATE POLICY "Public can read brand logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated users can update brand logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated users can delete brand logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-logos');
