import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePendingApprovals() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const fetchCount = useCallback(async (oid?: string) => {
    const id = oid || orgId;
    if (!id) return;

    const { count: pendingCount, error } = await supabase
      .from("content_approvals")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id)
      .eq("status", "pending");

    if (!error && pendingCount !== null) setCount(pendingCount);
    setLoading(false);
  }, [orgId]);

  // Initial fetch + get orgId
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id);

      if (!memberships?.length) { setLoading(false); return; }

      const oid = memberships[0].org_id;
      setOrgId(oid);
      fetchCount(oid);
    })();
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("approvals-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_approvals", filter: `org_id=eq.${orgId}` },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, fetchCount]);

  return { count, loading, refetch: () => fetchCount() };
}
