
CREATE POLICY "Authenticated users can upload to post-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'post-media');

CREATE POLICY "Authenticated users can read post-media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'post-media');
