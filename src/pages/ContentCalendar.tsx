import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Loader2, Trash2, Pencil, Clock,
  CalendarIcon, Send, AlertCircle, CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ScheduledPost {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  content: string;
  channel: string;
  status: "draft" | "scheduled" | "published";
  scheduled_at: string;
  created_at: string;
  facebook_page_id?: string | null;
  media_url?: string | null;
  post_type?: string | null;
  published_fb_id?: string | null;
  publish_error?: string | null;
}

interface FacebookPage {
  id: string;
  name: string;
  category?: string;
}

const CHANNELS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "Twitter / X" },
  { value: "blog", label: "Blog" },
  { value: "ad_copy", label: "Ad Copy" },
];

const POST_TYPES = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "reel", label: "Reel" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const CHANNEL_COLORS: Record<string, string> = {
  facebook: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  linkedin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  tiktok: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  twitter: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  blog: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  ad_copy: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ContentCalendar() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formChannel, setFormChannel] = useState("");
  const [formStatus, setFormStatus] = useState<"draft" | "scheduled">("draft");
  const [formDate, setFormDate] = useState<Date | undefined>(undefined);
  const [formTime, setFormTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  // Facebook-specific form state
  const [formPostType, setFormPostType] = useState("text");
  const [formFbPageId, setFormFbPageId] = useState("");
  const [formMediaUrl, setFormMediaUrl] = useState("");
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  // Day detail popover
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const fetchPosts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const firstOrgId = memberships[0].org_id;
    setOrgId(firstOrgId);

    const rangeStart = startOfMonth(subMonths(currentMonth, 1)).toISOString();
    const rangeEnd = endOfMonth(addMonths(currentMonth, 1)).toISOString();

    const { data } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("org_id", firstOrgId)
      .gte("scheduled_at", rangeStart)
      .lte("scheduled_at", rangeEnd)
      .order("scheduled_at", { ascending: true });

    setPosts((data as ScheduledPost[]) || []);
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Fetch Facebook pages when channel is facebook
  const fetchFbPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-pages");
      if (error) throw error;
      setFbPages(data?.pages || []);
    } catch (e) {
      console.error("Failed to fetch FB pages:", e);
      setFbPages([]);
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    if (formChannel === "facebook" && dialogOpen) {
      fetchFbPages();
    }
  }, [formChannel, dialogOpen, fetchFbPages]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start);
    return { days, startPad };
  }, [currentMonth]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    posts.forEach((p) => {
      const key = format(new Date(p.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [posts]);

  const openCreate = (day?: Date) => {
    setEditingPost(null);
    setFormTitle("");
    setFormContent("");
    setFormChannel("");
    setFormStatus("draft");
    setFormDate(day || new Date());
    setFormTime("09:00");
    setFormPostType("text");
    setFormFbPageId("");
    setFormMediaUrl("");
    setDialogOpen(true);
  };

  const openEdit = (post: ScheduledPost) => {
    setEditingPost(post);
    const d = new Date(post.scheduled_at);
    setFormTitle(post.title);
    setFormContent(post.content);
    setFormChannel(post.channel);
    setFormStatus(post.status === "published" ? "scheduled" : post.status);
    setFormDate(d);
    setFormTime(format(d, "HH:mm"));
    setFormPostType(post.post_type || "text");
    setFormFbPageId(post.facebook_page_id || "");
    setFormMediaUrl(post.media_url || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formDate || !orgId) return;
    setSaving(true);

    const [hours, mins] = formTime.split(":").map(Number);
    const scheduledAt = new Date(formDate);
    scheduledAt.setHours(hours, mins, 0, 0);

    const fbFields = formChannel === "facebook"
      ? {
          facebook_page_id: formFbPageId || null,
          post_type: formPostType,
          media_url: formMediaUrl || null,
        }
      : {
          facebook_page_id: null,
          post_type: "text",
          media_url: null,
        };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingPost) {
        const { error } = await supabase
          .from("scheduled_posts")
          .update({
            title: formTitle.trim(),
            content: formContent.trim(),
            channel: formChannel,
            status: formStatus,
            scheduled_at: scheduledAt.toISOString(),
            updated_at: new Date().toISOString(),
            ...fbFields,
          })
          .eq("id", editingPost.id);
        if (error) throw error;
        toast({ title: "Post updated" });
      } else {
        const { error } = await supabase
          .from("scheduled_posts")
          .insert({
            org_id: orgId,
            created_by: user.id,
            title: formTitle.trim(),
            content: formContent.trim(),
            channel: formChannel,
            status: formStatus,
            scheduled_at: scheduledAt.toISOString(),
            ...fbFields,
          });
        if (error) throw error;
        toast({ title: "Post created" });
      }

      setDialogOpen(false);
      fetchPosts();
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: ScheduledPost) => {
    if (!confirm(`Delete "${post.title}"?`)) return;
    try {
      const { error } = await supabase.from("scheduled_posts").delete().eq("id", post.id);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      toast({ title: "Post deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handlePublishNow = async (post: ScheduledPost) => {
    if (publishing) return;
    setPublishing(post.id);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-publish", {
        body: { post_id: post.id },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = typeof error.context === "string" ? JSON.parse(error.context) : error.context;
          if (ctx?.error) msg = ctx.error;
        } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast({ title: "Published to Facebook!", description: `Post ID: ${data?.fb_id}` });
      fetchPosts();
    } catch (e) {
      toast({ title: "Publish failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPublishing(null);
    }
  };

  const dayPosts = selectedDay
    ? postsByDay.get(format(selectedDay, "yyyy-MM-dd")) || []
    : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Content Calendar</h1>
          <p className="text-muted-foreground mt-1">Schedule and visualize content by date and channel.</p>
        </div>
        <Button className="gap-2" onClick={() => openCreate()}>
          <Plus className="h-4 w-4" />
          Schedule Post
        </Button>
      </motion.div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-display font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-border">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: calendarDays.startPad }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[100px] border-b border-r border-border bg-muted/20" />
              ))}

              {calendarDays.days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayPostsList = postsByDay.get(key) || [];
                const today = isToday(day);

                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer hover:bg-accent/30 transition-colors",
                      today && "bg-primary/5"
                    )}
                    onClick={() => { setSelectedDay(day); }}
                    onDoubleClick={() => openCreate(day)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                          today && "bg-primary text-primary-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {dayPostsList.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {dayPostsList.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayPostsList.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded truncate font-medium",
                            p.channel ? CHANNEL_COLORS[p.channel] || "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"
                          )}
                          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                        >
                          {p.title}
                        </div>
                      ))}
                      {dayPostsList.length > 3 && (
                        <span className="text-[10px] text-muted-foreground px-1.5">
                          +{dayPostsList.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day detail sidebar */}
      {selectedDay && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold">
                {format(selectedDay, "EEEE, MMMM d")}
              </h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openCreate(selectedDay)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>
                  Close
                </Button>
              </div>
            </div>
            {dayPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No posts scheduled for this day.</p>
            ) : (
              <div className="space-y-2">
                {dayPosts.map((post) => (
                  <div key={post.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-card">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{post.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={cn("text-[10px]", STATUS_COLORS[post.status])}>
                          {post.status}
                        </Badge>
                        {post.channel && (
                          <Badge variant="secondary" className={cn("text-[10px] capitalize", CHANNEL_COLORS[post.channel])}>
                            {CHANNELS.find((c) => c.value === post.channel)?.label || post.channel}
                          </Badge>
                        )}
                        {post.channel === "facebook" && post.post_type && post.post_type !== "text" && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {post.post_type}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(post.scheduled_at), "h:mm a")}
                        </span>
                      </div>
                      {post.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{post.content}</p>
                      )}
                      {/* Facebook publish status */}
                      {post.channel === "facebook" && post.published_fb_id && (
                        <div className="flex items-center gap-1 text-[10px] text-green-600 mt-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Published (ID: {post.published_fb_id.substring(0, 20)}…)
                        </div>
                      )}
                      {post.channel === "facebook" && post.publish_error && !post.published_fb_id && (
                        <div className="flex items-center gap-1 text-[10px] text-destructive mt-1">
                          <AlertCircle className="h-3 w-3" />
                          {post.publish_error}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {/* Publish Now for Facebook posts */}
                      {post.channel === "facebook" && !post.published_fb_id && post.facebook_page_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-600 hover:text-blue-700"
                          onClick={() => handlePublishNow(post)}
                          disabled={publishing === post.id}
                          title="Publish now to Facebook"
                        >
                          {publishing === post.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(post)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(post)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPost ? "Edit Post" : "Schedule a Post"}</DialogTitle>
            <DialogDescription>
              {editingPost ? "Update the post details." : "Plan content for a specific date and channel."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g. Summer launch announcement"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Content (optional)</Label>
              <Textarea
                placeholder="Write your post content or notes…"
                className="resize-none min-h-[80px]"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={formChannel} onValueChange={setFormChannel} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "draft" | "scheduled")} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Facebook-specific fields */}
            {formChannel === "facebook" && (
              <div className="space-y-4 p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Facebook Settings</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Facebook Page</Label>
                    <Select value={formFbPageId} onValueChange={setFormFbPageId} disabled={saving || loadingPages}>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingPages ? "Loading pages…" : "Select page"} />
                      </SelectTrigger>
                      <SelectContent>
                        {fbPages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                        {!loadingPages && fbPages.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            No pages found. Check your token in Settings.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Post Type</Label>
                    <Select value={formPostType} onValueChange={setFormPostType} disabled={saving}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POST_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formPostType !== "text" && (
                  <div className="space-y-2">
                    <Label>Media URL</Label>
                    <Input
                      placeholder={formPostType === "image" ? "https://example.com/photo.jpg" : "https://example.com/video.mp4"}
                      value={formMediaUrl}
                      onChange={(e) => setFormMediaUrl(e.target.value)}
                      disabled={saving}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Provide a publicly accessible URL for the {formPostType}.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}
                      disabled={saving}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formDate ? format(formDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formDate}
                      onSelect={setFormDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formTitle.trim() || !formDate} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
              {saving ? "Saving…" : editingPost ? "Update" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
