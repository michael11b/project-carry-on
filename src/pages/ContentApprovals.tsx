import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, Clock, Loader2, MessageSquare, Send, Eye,
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useApprovalConfig } from "@/hooks/useApprovalConfig";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Approval {
  id: string;
  org_id: string;
  post_id: string;
  submitted_by: string;
  reviewed_by: string | null;
  status: string;
  reviewer_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  post_title?: string;
  post_content?: string;
  post_channel?: string;
  post_media_url?: string;
  submitter_name?: string;
}

export default function ContentApprovals() {
  const { toast } = useToast();
  const { isOwnerOrAdmin, orgId, loading: configLoading } = useApprovalConfig();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewDialog, setReviewDialog] = useState<Approval | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchApprovals = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    let query = supabase
      .from("content_approvals")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load approvals", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Enrich with post and profile data
    const postIds = [...new Set((data || []).map((a: any) => a.post_id))];
    const userIds = [...new Set((data || []).map((a: any) => a.submitted_by))];

    const [postsResult, profilesResult] = await Promise.all([
      postIds.length ? supabase.from("scheduled_posts").select("id, title, content, channel, media_url").in("id", postIds) : { data: [] },
      userIds.length ? supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] },
    ]);

    const postsMap = new Map((postsResult.data || []).map((p: any) => [p.id, p]));
    const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p]));

    const enriched: Approval[] = (data || []).map((a: any) => {
      const post = postsMap.get(a.post_id);
      const profile = profilesMap.get(a.submitted_by);
      return {
        ...a,
        post_title: post?.title,
        post_content: post?.content,
        post_channel: post?.channel,
        post_media_url: post?.media_url,
        submitter_name: profile?.full_name || "Unknown user",
      };
    });

    setApprovals(enriched);
    setLoading(false);
  }, [orgId, filter, toast]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const handleReview = async (approval: Approval, decision: "approved" | "rejected") => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("content_approvals")
        .update({
          status: decision,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewer_comment: comment.trim() || null,
        })
        .eq("id", approval.id);

      if (error) throw error;

      // If approved, update the scheduled_posts status to 'scheduled' so cron can pick it up
      if (decision === "approved") {
        await supabase
          .from("scheduled_posts")
          .update({ status: "scheduled" as const })
          .eq("id", approval.post_id);
      }

      toast({ title: decision === "approved" ? "Content approved!" : "Content rejected" });
      setReviewDialog(null);
      setComment("");
      fetchApprovals();
    } catch (e) {
      toast({ title: "Review failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusIcon = (s: string) => {
    if (s === "approved") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (s === "rejected") return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-amber-500" />;
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</Badge>;
    if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold tracking-tight">Content Approvals</h1>
        <p className="text-muted-foreground mt-1">Review and approve content before it's published.</p>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No {filter !== "all" ? filter : ""} approvals found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(a.status)}
                      <span className="font-medium text-sm truncate">{a.post_title || "Untitled post"}</span>
                      {statusBadge(a.status)}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {a.post_content || "No content"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>By {a.submitter_name}</span>
                      <span>·</span>
                      <span>{format(new Date(a.created_at), "PPP")}</span>
                      {a.post_channel && (
                        <>
                          <span>·</span>
                          <Badge variant="outline" className="text-xs capitalize">{a.post_channel}</Badge>
                        </>
                      )}
                    </div>
                    {a.reviewer_comment && (
                      <div className="mt-2 p-2 rounded bg-muted text-xs flex items-start gap-1.5">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        {a.reviewer_comment}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {a.post_media_url && (
                      <div className="h-12 w-12 rounded border border-border overflow-hidden bg-secondary">
                        {a.post_media_url.includes(".webm") || a.post_media_url.includes(".mp4") ? (
                          <video src={a.post_media_url} className="h-full w-full object-cover" />
                        ) : (
                          <img src={a.post_media_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                    )}
                    {isOwnerOrAdmin && a.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReviewDialog(a); setComment(""); }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Review
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={(o) => !o && setReviewDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Review Content</DialogTitle>
          </DialogHeader>

          {reviewDialog && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{reviewDialog.post_title}</p>
                <p className="text-sm text-muted-foreground mt-1">{reviewDialog.post_content}</p>
              </div>

              {reviewDialog.post_media_url && (
                <div className="rounded border border-border overflow-hidden bg-secondary">
                  {reviewDialog.post_media_url.includes(".webm") || reviewDialog.post_media_url.includes(".mp4") ? (
                    <video src={reviewDialog.post_media_url} controls className="w-full max-h-[200px] object-contain" />
                  ) : (
                    <img src={reviewDialog.post_media_url} alt="" className="w-full max-h-[200px] object-contain" />
                  )}
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium">Comment (optional)</p>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add feedback or notes for the creator…"
                  rows={3}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={submitting}
              onClick={() => reviewDialog && handleReview(reviewDialog, "rejected")}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
              Reject
            </Button>
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => reviewDialog && handleReview(reviewDialog, "approved")}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
