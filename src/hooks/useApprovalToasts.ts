import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Shows toast alerts in real-time when approval records are created or updated.
 * Mount once in a top-level layout component.
 */
export function useApprovalToasts() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve org + user on mount
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id);

      if (memberships?.length) setOrgId(memberships[0].org_id);
    })();
  }, []);

  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase
      .channel("approval-toasts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "content_approvals", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const row = payload.new as any;
          // Don't toast your own submissions
          if (row.submitted_by === userId) return;

          // Fetch post title
          const title = await getPostTitle(row.post_id);
          toast({
            title: "New approval request",
            description: `"${title}" was submitted for review.`,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content_approvals", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const row = payload.new as any;
          const old = payload.old as any;

          // Only fire when status actually changed
          if (row.status === old.status) return;
          // Only notify the submitter
          if (row.submitted_by !== userId) return;

          const title = await getPostTitle(row.post_id);

          if (row.status === "approved") {
            toast({
              title: "Content approved ✓",
              description: `"${title}" has been approved and is ready to publish.`,
            });
          } else if (row.status === "rejected") {
            toast({
              title: "Content rejected",
              description: row.reviewer_comment
                ? `"${title}" was rejected: ${row.reviewer_comment}`
                : `"${title}" was rejected. Check the Approvals page for details.`,
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId, toast]);
}

async function getPostTitle(postId: string): Promise<string> {
  const { data } = await supabase
    .from("scheduled_posts")
    .select("title")
    .eq("id", postId)
    .single();
  return data?.title || "Untitled post";
}
