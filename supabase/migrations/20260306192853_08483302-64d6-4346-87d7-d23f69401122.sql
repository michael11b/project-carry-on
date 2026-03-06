-- Add Facebook-related columns to scheduled_posts
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS facebook_page_id text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS published_fb_id text,
  ADD COLUMN IF NOT EXISTS publish_error text;

-- Create facebook_pages table
CREATE TABLE IF NOT EXISTS public.facebook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  page_name text,
  access_token_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, page_id)
);

ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read
CREATE POLICY "Org members can read facebook_pages"
  ON public.facebook_pages FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- RLS: editors+ can insert
CREATE POLICY "Editors+ can insert facebook_pages"
  ON public.facebook_pages FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role]));

-- RLS: editors+ can delete
CREATE POLICY "Editors+ can delete facebook_pages"
  ON public.facebook_pages FOR DELETE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role]));

-- Create post-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;