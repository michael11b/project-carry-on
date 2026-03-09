import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApprovalConfig } from "@/hooks/useApprovalConfig";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  Send, CalendarDays, Loader2, CalendarIcon, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, Plus, X, Upload, ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FacebookPage {
  id: string;
  name: string;
}

interface InstagramAccount {
  ig_user_id: string;
  ig_username: string;
  facebook_page_id: string;
}

interface PublishPanelProps {
  /** The text content to publish */
  content: string;
  /** Single media URL (legacy compat) */
  mediaUrl?: string;
  /** Multiple media URLs */
  mediaUrls?: string[];
  /** Default title derived from the prompt */
  defaultTitle?: string;
  /** Whether there's content ready to publish */
  hasContent: boolean;
}

function isVideoUrl(url: string) {
  return url.includes(".webm") || url.includes(".mp4");
}

// ─── Media Carousel ────────────────────────────────────────────────────────

function MediaCarousel({
  items,
  onRemove,
  onAdd,
  disabled,
}: {
  items: string[];
  onRemove: (index: number) => void;
  onAdd: (files: FileList) => void;
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Clamp index when items change
  useEffect(() => {
    if (current >= items.length) setCurrent(Math.max(0, items.length - 1));
  }, [items.length, current]);

  if (items.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">Media</Label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="w-full h-24 rounded border-2 border-dashed border-border bg-muted/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Upload className="h-5 w-5" />
          <span className="text-xs">Upload images or videos</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onAdd(e.target.files)}
        />
      </div>
    );
  }

  const url = items[current];
  const video = isVideoUrl(url);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          Media ({current + 1}/{items.length})
        </Label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground"
            title="Add more media"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onAdd(e.target.files)}
          />
        </div>
      </div>

      <div className="relative group">
        {video ? (
          <video
            key={url}
            src={url}
            controls
            className="w-full rounded border border-border bg-secondary max-h-[200px] object-contain"
          />
        ) : (
          <img
            key={url}
            src={url}
            alt={`Media ${current + 1}`}
            className="w-full rounded border border-border bg-secondary max-h-[200px] object-contain"
          />
        )}

        {/* Remove button */}
        {!disabled && (
          <button
            type="button"
            onClick={() => onRemove(current)}
            className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {/* Navigation arrows */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-background/80 border border-border text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={current === items.length - 1}
              onClick={() => setCurrent((c) => c + 1)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-background/80 border border-border text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Dots */}
      {items.length > 1 && (
        <div className="flex justify-center gap-1">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === current ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PublishPanel ──────────────────────────────────────────────────────────

export default function PublishPanel({ content, mediaUrl, mediaUrls, defaultTitle, hasContent }: PublishPanelProps) {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [channel, setChannel] = useState<string>("facebook");
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [igAccounts, setIgAccounts] = useState<InstagramAccount[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedIgId, setSelectedIgId] = useState("");
  const [loadingPages, setLoadingPages] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [allMedia, setAllMedia] = useState<string[]>([]);

  // Merge incoming media props into allMedia
  useEffect(() => {
    const incoming: string[] = [];
    if (mediaUrls?.length) {
      incoming.push(...mediaUrls);
    } else if (mediaUrl) {
      incoming.push(mediaUrl);
    }
    if (incoming.length > 0) {
      setAllMedia((prev) => {
        const merged = [...prev];
        for (const url of incoming) {
          if (!merged.includes(url)) merged.push(url);
        }
        return merged;
      });
    }
  }, [mediaUrl, mediaUrls]);

  // Sync default title and caption from props
  useEffect(() => {
    if (defaultTitle && !title) setTitle(defaultTitle);
    if (defaultTitle && !caption) setCaption(defaultTitle);
  }, [defaultTitle]);

  // Fetch org
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id);
      if (memberships?.length) setOrgId(memberships[0].org_id);
    })();
  }, []);

  // Fetch pages when org is ready
  const fetchPages = useCallback(async () => {
    if (!orgId) return;
    setLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-pages", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      setFbPages(data?.pages || []);
      setIgAccounts(data?.instagram_accounts || []);
    } catch {
      setFbPages([]);
      setIgAccounts([]);
    } finally {
      setLoadingPages(false);
    }
  }, [orgId]);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const primaryMedia = allMedia[0] || null;
  const primaryIsVideo = primaryMedia ? isVideoUrl(primaryMedia) : false;
  const postType = primaryMedia ? (primaryIsVideo ? "video" : "image") : "text";

  const handleRemoveMedia = (index: number) => {
    setAllMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddMedia = async (files: FileList) => {
    if (!orgId) return;
    const newUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop() || "bin";
      const filePath = `${orgId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("post-media")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        continue;
      }
      const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(filePath);
      newUrls.push(urlData.publicUrl);
    }
    if (newUrls.length) setAllMedia((prev) => [...prev, ...newUrls]);
  };

  const resolveMediaUrl = async (url: string): Promise<string> => {
    if (!url.startsWith("data:")) return url;
    const blob = await fetch(url).then((r) => r.blob());
    const ext = url.includes("image/png") ? "png" : "jpg";
    const filePath = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("post-media")
      .upload(filePath, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handlePublish = async () => {
    if (!orgId || publishing) return;

    const postTitle = title.trim() || defaultTitle || "Studio post";

    // Validate
    if (channel === "facebook" && !selectedPageId) {
      toast({ title: "Select a Facebook page", variant: "destructive" });
      return;
    }
    if (channel === "instagram" && !selectedIgId) {
      toast({ title: "Select an Instagram account", variant: "destructive" });
      return;
    }
    if (channel === "instagram" && allMedia.length === 0) {
      toast({ title: "Instagram requires media", description: "Add an image or video first.", variant: "destructive" });
      return;
    }

    setPublishing(true);
    setResult(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Resolve the primary media URL (first item)
      const resolvedMediaUrl = primaryMedia ? await resolveMediaUrl(primaryMedia) : null;

      if (scheduleMode && scheduleDate) {
        const [hours, mins] = scheduleTime.split(":").map(Number);
        const scheduledAt = new Date(scheduleDate);
        scheduledAt.setHours(hours, mins, 0, 0);

        const { error } = await supabase.from("scheduled_posts").insert({
          org_id: orgId,
          created_by: user.id,
          title: postTitle,
          content: caption.trim() || postTitle,
          channel,
          status: "scheduled" as const,
          scheduled_at: scheduledAt.toISOString(),
          facebook_page_id: channel === "facebook" ? selectedPageId : null,
          instagram_account_id: channel === "instagram" ? selectedIgId : null,
          post_type: postType,
          media_url: resolvedMediaUrl,
        });
        if (error) throw error;
        setResult({ success: true, message: `Scheduled for ${format(scheduledAt, "PPP 'at' h:mm a")}` });
        toast({ title: "Post scheduled!", description: `Will be published on ${format(scheduledAt, "PPP")}` });
      } else {
        const { data: newPost, error: insertErr } = await supabase.from("scheduled_posts").insert({
          org_id: orgId,
          created_by: user.id,
          title: postTitle,
          content: caption.trim() || postTitle,
          channel,
          status: "scheduled" as const,
          scheduled_at: new Date().toISOString(),
          facebook_page_id: channel === "facebook" ? selectedPageId : null,
          instagram_account_id: channel === "instagram" ? selectedIgId : null,
          post_type: postType,
          media_url: resolvedMediaUrl,
        }).select("id").single();
        if (insertErr || !newPost) throw insertErr || new Error("Failed to create post");

        const fnName = channel === "instagram" ? "instagram-publish" : "facebook-publish";
        const { data, error: pubErr } = await supabase.functions.invoke(fnName, {
          body: { post_id: newPost.id },
        });
        if (pubErr) {
          let msg = pubErr.message;
          try {
            const ctx = typeof pubErr.context === "string" ? JSON.parse(pubErr.context) : pubErr.context;
            if (ctx?.error) msg = ctx.error;
          } catch {}
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);

        const publishedId = data?.fb_id || data?.ig_id || "unknown";
        setResult({ success: true, message: `Published! ID: ${publishedId}` });
        toast({ title: `Published to ${channel === "facebook" ? "Facebook" : "Instagram"}!` });
      }
    } catch (e) {
      const msg = (e as Error).message || "Publish failed";
      setResult({ success: false, message: msg });
      toast({ title: "Publish failed", description: msg, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  if (!hasContent) return null;

  const noPages = !loadingPages && fbPages.length === 0 && igAccounts.length === 0;

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
      <p className="text-sm font-medium">Publish to Social</p>

      {noPages ? (
        <p className="text-xs text-muted-foreground">
          No connected pages found. Go to Settings → Integrations to connect Facebook.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              className="h-8 text-sm"
              disabled={publishing}
            />
          </div>

          <MediaCarousel
            items={allMedia}
            onRemove={handleRemoveMedia}
            onAdd={handleAddMedia}
            disabled={publishing}
          />

          <div className="space-y-2">
            <Label className="text-xs">Caption / Post Text</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What will be posted as the caption/message"
              className="text-sm min-h-[60px]"
              disabled={publishing}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => { setChannel(v); setResult(null); }} disabled={publishing}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fbPages.length > 0 && <SelectItem value="facebook">Facebook</SelectItem>}
                  {igAccounts.length > 0 && <SelectItem value="instagram">Instagram</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {channel === "facebook" && (
              <div className="space-y-1">
                <Label className="text-xs">Page</Label>
                <Select value={selectedPageId} onValueChange={setSelectedPageId} disabled={publishing || loadingPages}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={loadingPages ? "Loading…" : "Select page"} />
                  </SelectTrigger>
                  <SelectContent>
                    {fbPages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {channel === "instagram" && (
              <div className="space-y-1">
                <Label className="text-xs">Account</Label>
                <Select value={selectedIgId} onValueChange={setSelectedIgId} disabled={publishing || loadingPages}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={loadingPages ? "Loading…" : "Select account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {igAccounts.map((ig) => (
                      <SelectItem key={ig.ig_user_id} value={ig.ig_user_id}>
                        @{ig.ig_username || ig.ig_user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={scheduleMode} onCheckedChange={setScheduleMode} disabled={publishing} />
            <Label className="text-xs">Schedule for later</Label>
          </div>

          {scheduleMode && (
            <div className="grid grid-cols-2 gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("justify-start text-left font-normal text-xs", !scheduleDate && "text-muted-foreground")}
                    disabled={publishing}
                  >
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {scheduleDate ? format(scheduleDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="h-8 text-sm"
                disabled={publishing}
              />
            </div>
          )}

          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={handlePublish}
            disabled={publishing || (scheduleMode && !scheduleDate)}
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : scheduleMode ? (
              <CalendarDays className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {publishing ? "Publishing…" : scheduleMode ? "Schedule" : "Publish Now"}
          </Button>

          {result && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs",
              result.success ? "text-green-600" : "text-destructive"
            )}>
              {result.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {result.message}
            </div>
          )}
        </>
      )}
    </div>
  );
}
