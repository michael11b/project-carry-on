
-- Post status enum
CREATE TYPE public.post_status AS ENUM ('draft', 'scheduled', 'published');

-- Scheduled posts table
CREATE TABLE public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  content text DEFAULT '',
  channel text DEFAULT '',
  status post_status NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read scheduled posts"
ON public.scheduled_posts FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Editors+ can create scheduled posts"
ON public.scheduled_posts FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role])
);

CREATE POLICY "Editors+ can update scheduled posts"
ON public.scheduled_posts FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role])
);

CREATE POLICY "Editors+ can delete scheduled posts"
ON public.scheduled_posts FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role])
);

CREATE INDEX idx_scheduled_posts_org ON public.scheduled_posts(org_id);
CREATE INDEX idx_scheduled_posts_date ON public.scheduled_posts(scheduled_at);
