
-- Backfill: create org/membership/role/workspace for existing users who have no org
DO $$
DECLARE
  u RECORD;
  new_org_id UUID;
  org_slug TEXT;
BEGIN
  FOR u IN
    SELECT au.id, au.raw_user_meta_data
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om WHERE om.user_id = au.id
    )
  LOOP
    -- Create profile if missing
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (u.id, COALESCE(u.raw_user_meta_data->>'full_name', ''), NULL)
    ON CONFLICT (id) DO NOTHING;

    -- Create org
    org_slug := 'org-' || substr(u.id::text, 1, 8);
    INSERT INTO public.organizations (id, name, slug)
    VALUES (gen_random_uuid(), 'My Organization', org_slug)
    RETURNING id INTO new_org_id;

    -- Add membership
    INSERT INTO public.organization_members (org_id, user_id)
    VALUES (new_org_id, u.id);

    -- Add owner role
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (u.id, new_org_id, 'owner');

    -- Create default workspace
    INSERT INTO public.workspaces (org_id, name, description)
    VALUES (new_org_id, 'Default Workspace', 'Your first workspace');
  END LOOP;
END;
$$;
