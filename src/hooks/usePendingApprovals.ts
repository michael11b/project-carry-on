import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePendingApprovals() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const orgId = memberships[0].org_id;

    const { count: pendingCount, error } = await supabase
      .from("content_approvals")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending");

    if (!error && pendingCount !== null) setCount(pendingCount);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCount();
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, loading, refetch: fetchCount };
}
