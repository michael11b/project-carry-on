
CREATE TABLE public.page_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facebook_page_id text NOT NULL,
  page_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  target_audience text NOT NULL DEFAULT '',
  content_tone text NOT NULL DEFAULT 'casual',
  content_topics text[] NOT NULL DEFAULT '{}',
  posting_goals text NOT NULL DEFAULT '',
  hashtag_preferences text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, facebook_page_id)
);

ALTER TABLE public.page_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read page_profiles"
  ON public.page_profiles FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Editors+ can insert page_profiles"
  ON public.page_profiles FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(auth.uid(), org_id, ARRAY['owner','admin','editor']::app_role[]));

CREATE POLICY "Editors+ can update page_profiles"
  ON public.page_profiles FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner','admin','editor']::app_role[]));

CREATE POLICY "Editors+ can delete page_profiles"
  ON public.page_profiles FOR DELETE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner','admin','editor']::app_role[]));
