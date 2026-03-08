import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Pencil, Trash2, Eye, Image, FileText, Video, ExternalLink, Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

interface Post {
  id: string;
  title: string;
  content: string | null;
  channel: string | null;
  status: "draft" | "scheduled" | "published";
  post_type: string;
  media_url: string | null;
  facebook_page_id: string | null;
  instagram_account_id: string | null;
  published_fb_id: string | null;
  publish_error: string | null;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
}

interface PostsManagerProps {
  orgId: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const POST_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <FileText className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  reel: <Video className="h-4 w-4" />,
};

export default function PostsManager({ orgId }: PostsManagerProps) {
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;

  // Edit dialog
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStatus, setEditStatus] = useState<string>("draft");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Delete dialog
  const [deletePost, setDeletePost] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFromFb, setDeleteFromFb] = useState(false);

  // View dialog
  const [viewPost, setViewPost] = useState<Post | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("scheduled_posts")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPosts((data as unknown as Post[]) || []);
    } catch (e) {
      toast({ title: "Failed to load posts", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, toast]);

  useEffect(() => {
    if (orgId) fetchPosts();
  }, [fetchPosts, orgId]);

  const filteredPosts = posts.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.content?.toLowerCase().includes(q) ?? false);
  });

  // Open edit dialog
  const openEdit = (post: Post) => {
    setEditPost(post);
    setEditTitle(post.title);
    setEditContent(post.content || "");
    setEditStatus(post.status);
  };

  const handleSave = async () => {
    if (!editPost) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("scheduled_posts")
        .update({
          title: editTitle.trim(),
          content: editContent.trim(),
          status: editStatus as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editPost.id);
      if (error) throw error;
      toast({ title: "Post updated" });
      setEditPost(null);
      fetchPosts();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToFacebook = async () => {
    if (!editPost?.published_fb_id) return;
    setSyncing(true);
    try {
      // Save first
      await supabase
        .from("scheduled_posts")
        .update({
          title: editTitle.trim(),
          content: editContent.trim(),
          status: editStatus as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editPost.id);

      const { data, error } = await supabase.functions.invoke("facebook-update", {
        body: { post_id: editPost.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Updated on Facebook" });
      setEditPost(null);
      fetchPosts();
    } catch (e) {
      toast({ title: "Facebook update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePost) return;
    setDeleting(true);
    try {
      // Attempt Facebook deletion if requested
      if (deleteFromFb && deletePost.published_fb_id && deletePost.channel === "facebook") {
        const { data, error: fbErr } = await supabase.functions.invoke("facebook-delete", {
          body: { post_id: deletePost.id },
        });
        if (fbErr) {
          toast({ title: "Facebook delete failed", description: (fbErr as Error).message, variant: "destructive" });
        } else if (data?.fb_error) {
          toast({ title: "Could not delete from Facebook", description: data.fb_error + " The post will be removed locally.", variant: "destructive" });
        } else if (data?.success) {
          toast({ title: "Deleted from Facebook" });
        }
      }

      const { error } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("id", deletePost.id);
      if (error) throw error;
      toast({ title: "Post deleted" });
      setDeletePost(null);
      setDeleteFromFb(false);
      fetchPosts();
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Posts table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No posts found</p>
              <p className="text-sm mt-1">Create posts from the Studio to see them here.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[100px]">Channel</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[140px]">Scheduled</TableHead>
                    <TableHead className="w-[140px]">Created</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {POST_TYPE_ICONS[post.post_type] || POST_TYPE_ICONS.text}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="font-medium truncate text-sm">{post.title}</p>
                          {post.publish_error && (
                            <p className="text-xs text-destructive truncate mt-0.5">{post.publish_error}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm capitalize">{post.channel || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[post.status] || ""}`}>
                          {post.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(post.scheduled_at), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(post.created_at), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {post.published_fb_id && post.facebook_page_id && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="View on Facebook">
                              <a href={`https://facebook.com/${post.published_fb_id}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewPost(post)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(post)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeletePost(post)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Showing {filteredPosts.length} of {posts.length} posts
      </p>

      {/* View Dialog */}
      <Dialog open={!!viewPost} onOpenChange={() => setViewPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewPost?.title}</DialogTitle>
            <DialogDescription>
              {viewPost?.channel} · {viewPost?.post_type} · {viewPost?.status}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewPost?.media_url && viewPost.media_url.startsWith("http") && (
              <img
                src={viewPost.media_url}
                alt="Post media"
                className="rounded-lg max-h-[300px] w-full object-contain bg-muted"
              />
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Content</Label>
              <p className="text-sm mt-1 whitespace-pre-wrap">{viewPost?.content || "—"}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Scheduled At</Label>
                <p>{viewPost ? format(new Date(viewPost.scheduled_at), "PPP p") : ""}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Created</Label>
                <p>{viewPost ? format(new Date(viewPost.created_at), "PPP p") : ""}</p>
              </div>
            </div>
            {viewPost?.published_fb_id && (
              <div>
                <Label className="text-xs text-muted-foreground">Published on Facebook</Label>
                <a
                  href={`https://facebook.com/${viewPost.published_fb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1"
                >
                  View on Facebook <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {viewPost?.publish_error && (
              <div>
                <Label className="text-xs text-destructive">Error</Label>
                <p className="text-sm text-destructive">{viewPost.publish_error}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editPost} onOpenChange={() => setEditPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription>Update the post title, content, or status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Content / Caption</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setEditPost(null)}>Cancel</Button>
            {editPost?.published_fb_id && editPost?.channel === "facebook" && (
              <Button variant="secondary" onClick={handleSyncToFacebook} disabled={syncing || saving}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Update on Facebook
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || syncing}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletePost} onOpenChange={() => { setDeletePost(null); setDeleteFromFb(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The post will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletePost?.published_fb_id && deletePost?.channel === "facebook" && (
            <div className="flex items-center space-x-2 px-1">
              <input
                type="checkbox"
                id="delete-from-fb"
                checked={deleteFromFb}
                onChange={(e) => setDeleteFromFb(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <label htmlFor="delete-from-fb" className="text-sm text-muted-foreground">
                Also delete from Facebook
              </label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
