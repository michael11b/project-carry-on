
-- Asset type enum
CREATE TYPE public.asset_type AS ENUM ('text', 'image');

-- Assets table
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  type asset_type NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Org members can read assets
CREATE POLICY "Org members can read assets"
ON public.assets FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), org_id));

-- Editors+ can create assets
CREATE POLICY "Editors+ can create assets"
ON public.assets FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role])
);

-- Editors+ can delete assets
CREATE POLICY "Editors+ can delete assets"
ON public.assets FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role])
);

-- Index for fast org queries
CREATE INDEX idx_assets_org_id ON public.assets(org_id);
CREATE INDEX idx_assets_type ON public.assets(type);
CREATE INDEX idx_assets_created_at ON public.assets(created_at DESC);
