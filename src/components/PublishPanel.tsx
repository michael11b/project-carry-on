import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  /** The media URL (for image posts) */
  mediaUrl?: string;
  /** Default title derived from the prompt */
  defaultTitle?: string;
  /** Whether there's content ready to publish */
  hasContent: boolean;
}

export default function PublishPanel({ content, mediaUrl, defaultTitle, hasContent }: PublishPanelProps) {
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
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync default title from prop
  useEffect(() => {
    if (defaultTitle && !title) setTitle(defaultTitle);
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

  const postType = mediaUrl ? "image" : "text";

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
    if (channel === "instagram" && !mediaUrl) {
      toast({ title: "Instagram requires a media URL", description: "Generate an image first.", variant: "destructive" });
      return;
    }

    setPublishing(true);
    setResult(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (scheduleMode && scheduleDate) {
        // Create a scheduled post
        const [hours, mins] = scheduleTime.split(":").map(Number);
        const scheduledAt = new Date(scheduleDate);
        scheduledAt.setHours(hours, mins, 0, 0);

        const { error } = await supabase.from("scheduled_posts").insert({
          org_id: orgId,
          created_by: user.id,
          title: postTitle,
          content,
          channel,
          status: "scheduled" as const,
          scheduled_at: scheduledAt.toISOString(),
          facebook_page_id: channel === "facebook" ? selectedPageId : null,
          instagram_account_id: channel === "instagram" ? selectedIgId : null,
          post_type: postType,
          media_url: mediaUrl || null,
        });
        if (error) throw error;
        setResult({ success: true, message: `Scheduled for ${format(scheduledAt, "PPP 'at' h:mm a")}` });
        toast({ title: "Post scheduled!", description: `Will be published on ${format(scheduledAt, "PPP")}` });
      } else {
        // Create post then publish immediately
        const { data: newPost, error: insertErr } = await supabase.from("scheduled_posts").insert({
          org_id: orgId,
          created_by: user.id,
          title: postTitle,
          content,
          channel,
          status: "scheduled" as const,
          scheduled_at: new Date().toISOString(),
          facebook_page_id: channel === "facebook" ? selectedPageId : null,
          instagram_account_id: channel === "instagram" ? selectedIgId : null,
          post_type: postType,
          media_url: mediaUrl || null,
        }).select("id").single();
        if (insertErr || !newPost) throw insertErr || new Error("Failed to create post");

        // Publish now
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
