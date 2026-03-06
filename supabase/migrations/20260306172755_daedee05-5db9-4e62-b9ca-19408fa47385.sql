
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'editor', 'viewer', 'client_reviewer');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 4. Organization members table
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 5. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, org_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6. Workspaces table
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 7. Brands table
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  colors JSONB DEFAULT '{}',
  fonts JSONB DEFAULT '{}',
  voice_profile JSONB DEFAULT '{}',
  prohibited_terms TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- 8. Security definer: is_org_member
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

-- 9. Security definer: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role
  )
$$;

-- 10. has_any_role helper
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _org_id UUID, _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND org_id = _org_id AND role = ANY(_roles)
  )
$$;

-- 11. handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NULL);

  org_slug := 'org-' || substr(NEW.id::text, 1, 8);
  INSERT INTO public.organizations (id, name, slug)
  VALUES (gen_random_uuid(), 'My Organization', org_slug)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (org_id, user_id)
  VALUES (new_org_id, NEW.id);

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (NEW.id, new_org_id, 'owner');

  INSERT INTO public.workspaces (org_id, name, description)
  VALUES (new_org_id, 'Default Workspace', 'Your first workspace');

  RETURN NEW;
END;
$$;

-- 12. Trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ====== RLS POLICIES ======

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Members can read their orgs" ON public.organizations FOR SELECT USING (
  public.is_org_member(auth.uid(), id)
);

CREATE POLICY "Members can see co-members" ON public.organization_members FOR SELECT USING (
  public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Owners can insert members" ON public.organization_members FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), org_id, 'owner')
);
CREATE POLICY "Owners can delete members" ON public.organization_members FOR DELETE USING (
  public.has_role(auth.uid(), org_id, 'owner')
);

CREATE POLICY "Org members can read roles" ON public.user_roles FOR SELECT USING (
  public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Owners/admins can manage roles" ON public.user_roles FOR INSERT WITH CHECK (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin']::public.app_role[])
);
CREATE POLICY "Owners/admins can update roles" ON public.user_roles FOR UPDATE USING (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin']::public.app_role[])
);
CREATE POLICY "Owners/admins can delete roles" ON public.user_roles FOR DELETE USING (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin']::public.app_role[])
);

CREATE POLICY "Org members can read workspaces" ON public.workspaces FOR SELECT USING (
  public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Admins+ can create workspaces" ON public.workspaces FOR INSERT WITH CHECK (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin']::public.app_role[])
);
CREATE POLICY "Admins+ can update workspaces" ON public.workspaces FOR UPDATE USING (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin']::public.app_role[])
);

CREATE POLICY "Org members can read brands" ON public.brands FOR SELECT USING (
  public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Editors+ can create brands" ON public.brands FOR INSERT WITH CHECK (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin', 'editor']::public.app_role[])
);
CREATE POLICY "Editors+ can update brands" ON public.brands FOR UPDATE USING (
  public.has_any_role(auth.uid(), org_id, ARRAY['owner', 'admin', 'editor']::public.app_role[])
);
