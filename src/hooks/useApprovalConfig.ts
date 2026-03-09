import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseApprovalConfigResult {
  approvalRequired: boolean;
  isOwnerOrAdmin: boolean;
  loading: boolean;
  orgId: string | null;
  toggleApproval: () => Promise<void>;
}

export function useApprovalConfig(): UseApprovalConfigResult {
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const oid = memberships[0].org_id;
    setOrgId(oid);

    const [orgResult, roleResult] = await Promise.all([
      supabase.from("organizations").select("approval_required").eq("id", oid).single(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).eq("org_id", oid),
    ]);

    if (orgResult.data) {
      setApprovalRequired((orgResult.data as any).approval_required ?? false);
    }

    if (roleResult.data) {
      const roles = roleResult.data.map((r) => r.role);
      setIsOwnerOrAdmin(roles.includes("owner") || roles.includes("admin"));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const toggleApproval = async () => {
    if (!orgId) return;
    const newVal = !approvalRequired;
    const { error } = await supabase
      .from("organizations")
      .update({ approval_required: newVal } as any)
      .eq("id", orgId);
    if (!error) setApprovalRequired(newVal);
  };

  return { approvalRequired, isOwnerOrAdmin, loading, orgId, toggleApproval };
}
