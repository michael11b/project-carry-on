
CREATE TABLE public.instagram_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facebook_page_id TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  ig_username TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, ig_user_id)
);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read instagram_accounts"
  ON public.instagram_accounts FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Editors+ can insert instagram_accounts"
  ON public.instagram_accounts FOR INSERT
  WITH CHECK (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role]));

CREATE POLICY "Editors+ can delete instagram_accounts"
  ON public.instagram_accounts FOR DELETE
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role]));

-- Add instagram_account_id column to scheduled_posts
ALTER TABLE public.scheduled_posts ADD COLUMN instagram_account_id TEXT;
