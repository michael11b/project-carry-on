import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovalActivity {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer_comment: string | null;
  post_title: string;
  submitter_name: string;
  reviewer_name: string | null;
}

export function useApprovalActivity() {
  const [activities, setActivities] = useState<ApprovalActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const orgId = memberships[0].org_id;

    const { data, error } = await supabase
      .from("content_approvals")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !data) { setLoading(false); return; }

    // Enrich with post titles and user names
    const postIds = [...new Set(data.map((a: any) => a.post_id))];
    const userIds = [...new Set([
      ...data.map((a: any) => a.submitted_by),
      ...data.filter((a: any) => a.reviewed_by).map((a: any) => a.reviewed_by),
    ])];

    const [postsResult, profilesResult] = await Promise.all([
      postIds.length ? supabase.from("scheduled_posts").select("id, title").in("id", postIds) : { data: [] },
      userIds.length ? supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] },
    ]);

    const postsMap = new Map((postsResult.data || []).map((p: any) => [p.id, p.title]));
    const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p.full_name || "Unknown"]));

    const enriched: ApprovalActivity[] = data.map((a: any) => ({
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      reviewed_at: a.reviewed_at,
      reviewer_comment: a.reviewer_comment,
      post_title: postsMap.get(a.post_id) || "Untitled",
      submitter_name: profilesMap.get(a.submitted_by) || "Unknown",
      reviewer_name: a.reviewed_by ? (profilesMap.get(a.reviewed_by) || "Unknown") : null,
    }));

    setActivities(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 30000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  return { activities, loading, refetch: fetchActivity };
}
