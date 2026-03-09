
-- Add approval_required flag to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false;

-- Create content_approvals table
CREATE TABLE public.content_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.content_approvals ENABLE ROW LEVEL SECURITY;

-- Org members can read approvals
CREATE POLICY "Org members can read approvals"
  ON public.content_approvals FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- Editors+ can submit approvals (insert)
CREATE POLICY "Editors+ can submit approvals"
  ON public.content_approvals FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(auth.uid(), org_id, ARRAY['owner','admin','editor']::app_role[]));

-- Owners/admins can update approvals (approve/reject)
CREATE POLICY "Owners admins can update approvals"
  ON public.content_approvals FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), org_id, ARRAY['owner','admin']::app_role[]));

-- Editors+ can delete their own approval requests
CREATE POLICY "Submitters can delete own approvals"
  ON public.content_approvals FOR DELETE
  TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending');
