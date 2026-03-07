
-- Create facebook_credentials table
CREATE TABLE public.facebook_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id_encrypted text NOT NULL,
  app_secret_encrypted text NOT NULL,
  user_token_encrypted text NOT NULL,
  iv text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

ALTER TABLE public.facebook_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins+ can read facebook_credentials"
  ON public.facebook_credentials FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "Admins+ can insert facebook_credentials"
  ON public.facebook_credentials FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "Admins+ can update facebook_credentials"
  ON public.facebook_credentials FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "Admins+ can delete facebook_credentials"
  ON public.facebook_credentials FOR DELETE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

-- Add encryption columns to facebook_pages
ALTER TABLE public.facebook_pages
  ADD COLUMN IF NOT EXISTS page_token_encrypted text,
  ADD COLUMN IF NOT EXISTS page_token_iv text,
  ADD COLUMN IF NOT EXISTS page_token_salt text;

-- Allow update on facebook_pages for editors+
CREATE POLICY "Editors+ can update facebook_pages"
  ON public.facebook_pages FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role]));
