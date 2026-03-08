import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Save, Loader2, Settings2, Plus, X, FileText, LayoutList } from "lucide-react";
import PostsManager from "@/components/PostsManager";

interface FacebookPage {
  id: string;
  name: string;
}

interface PageProfile {
  id?: string;
  org_id: string;
  facebook_page_id: string;
  page_name: string;
  description: string;
  target_audience: string;
  content_tone: string;
  content_topics: string[];
  posting_goals: string;
  hashtag_preferences: string;
  system_prompt: string;
}

const TONE_OPTIONS = [
  { value: "casual", label: "Casual & Friendly" },
  { value: "professional", label: "Professional" },
  { value: "inspirational", label: "Inspirational" },
  { value: "humorous", label: "Humorous & Fun" },
  { value: "educational", label: "Educational" },
  { value: "authoritative", label: "Authoritative" },
  { value: "empathetic", label: "Empathetic & Warm" },
];

function buildDefaultPrompt(profile: Partial<PageProfile>): string {
  const parts: string[] = [];
  parts.push(`You are creating content for the Facebook page "${profile.page_name || "Untitled"}".`);
  if (profile.description) parts.push(`Page description: ${profile.description}`);
  if (profile.target_audience) parts.push(`Target audience: ${profile.target_audience}`);
  if (profile.content_tone) parts.push(`Tone: ${profile.content_tone}`);
  if (profile.content_topics?.length) parts.push(`Key topics: ${profile.content_topics.join(", ")}`);
  if (profile.posting_goals) parts.push(`Goals: ${profile.posting_goals}`);
  if (profile.hashtag_preferences) parts.push(`Preferred hashtags: ${profile.hashtag_preferences}`);
  parts.push("Generate engaging, on-brand content that resonates with the target audience.");
  return parts.join("\n");
}

export default function PagesConfig() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string>("");
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PageProfile>>({});
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topicInput, setTopicInput] = useState("");

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id);
      if (!memberships?.length) return;

      const oid = memberships[0].org_id;
      setOrgId(oid);

      const { data: pagesData } = await supabase.functions.invoke("facebook-pages", {
        body: { org_id: oid },
      });

      const pages: FacebookPage[] = pagesData?.pages || [];
      setFbPages(pages);

      const { data: existingProfiles } = await supabase
        .from("page_profiles")
        .select("*")
        .eq("org_id", oid);

      const profileMap: Record<string, PageProfile> = {};
      for (const page of pages) {
        const existing = existingProfiles?.find((p: any) => p.facebook_page_id === page.id);
        if (existing) {
          profileMap[page.id] = existing as unknown as PageProfile;
        } else {
          const defaultProfile: PageProfile = {
            org_id: oid,
            facebook_page_id: page.id,
            page_name: page.name,
            description: "",
            target_audience: "",
            content_tone: "casual",
            content_topics: [],
            posting_goals: "",
            hashtag_preferences: "",
            system_prompt: "",
          };
          defaultProfile.system_prompt = buildDefaultPrompt(defaultProfile);
          profileMap[page.id] = defaultProfile;
        }
      }

      setProfiles(profileMap);
      if (pages.length > 0) setSelectedPageId(pages[0].id);
      setLoading(false);
    }
    init();
  }, []);

  const currentProfile = selectedPageId ? profiles[selectedPageId] : null;

  const updateField = useCallback((field: keyof PageProfile, value: any) => {
    if (!selectedPageId) return;
    setProfiles((prev) => ({
      ...prev,
      [selectedPageId]: { ...prev[selectedPageId], [field]: value },
    }));
  }, [selectedPageId]);

  const regeneratePrompt = useCallback(() => {
    if (!selectedPageId || !profiles[selectedPageId]) return;
    const prompt = buildDefaultPrompt(profiles[selectedPageId]);
    setProfiles((prev) => ({
      ...prev,
      [selectedPageId]: { ...prev[selectedPageId], system_prompt: prompt },
    }));
  }, [selectedPageId, profiles]);

  const addTopic = useCallback(() => {
    const trimmed = topicInput.trim();
    if (!trimmed || !selectedPageId) return;
    const current = profiles[selectedPageId]?.content_topics || [];
    if (!current.includes(trimmed)) {
      updateField("content_topics", [...current, trimmed]);
    }
    setTopicInput("");
  }, [topicInput, selectedPageId, profiles, updateField]);

  const removeTopic = useCallback((topic: string) => {
    if (!selectedPageId) return;
    const current = profiles[selectedPageId]?.content_topics || [];
    updateField("content_topics", current.filter((t) => t !== topic));
  }, [selectedPageId, profiles, updateField]);

  const handleSave = useCallback(async () => {
    if (!currentProfile || !orgId) return;
    setSaving(true);
    try {
      if (currentProfile.id) {
        const { error } = await supabase
          .from("page_profiles")
          .update({
            description: currentProfile.description,
            target_audience: currentProfile.target_audience,
            content_tone: currentProfile.content_tone,
            content_topics: currentProfile.content_topics,
            posting_goals: currentProfile.posting_goals,
            hashtag_preferences: currentProfile.hashtag_preferences,
            system_prompt: currentProfile.system_prompt,
            page_name: currentProfile.page_name,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", currentProfile.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("page_profiles")
          .insert({
            org_id: orgId,
            facebook_page_id: currentProfile.facebook_page_id,
            page_name: currentProfile.page_name,
            description: currentProfile.description,
            target_audience: currentProfile.target_audience,
            content_tone: currentProfile.content_tone,
            content_topics: currentProfile.content_topics,
            posting_goals: currentProfile.posting_goals,
            hashtag_preferences: currentProfile.hashtag_preferences,
            system_prompt: currentProfile.system_prompt,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        if (data) {
          setProfiles((prev) => ({
            ...prev,
            [selectedPageId]: { ...prev[selectedPageId], id: (data as any).id },
          }));
        }
      }
      toast({ title: "Profile saved", description: `Settings for "${currentProfile.page_name}" saved successfully.` });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [currentProfile, orgId, selectedPageId, toast]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold tracking-tight">Pages & Posts</h1>
        <p className="text-muted-foreground mt-1">
          Manage your connected pages, configure AI profiles, and view all your posts.
        </p>
      </motion.div>

      <Tabs defaultValue="posts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="posts" className="gap-2">
            <LayoutList className="h-4 w-4" />
            Posts
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Page Profiles
          </TabsTrigger>
        </TabsList>

        {/* Posts Tab */}
        <TabsContent value="posts">
          {orgId ? (
            <PostsManager orgId={orgId} />
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No organization found.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Page Profiles Tab */}
        <TabsContent value="pages">
          {fbPages.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Facebook className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="text-lg font-semibold mb-2">No Pages Connected</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Connect your Facebook account in Settings → Integrations to see your pages here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              {/* Page List */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Connected Pages
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="space-y-1">
                    {fbPages.map((page) => {
                      const hasProfile = !!profiles[page.id]?.id;
                      return (
                        <button
                          key={page.id}
                          onClick={() => setSelectedPageId(page.id)}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            selectedPageId === page.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <Facebook className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">{page.name}</span>
                          {hasProfile && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Configured
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Profile Editor */}
              {currentProfile && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Settings2 className="h-5 w-5" />
                          {currentProfile.page_name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Set up the context and personality for AI-generated content on this page.
                        </CardDescription>
                      </div>
                      <Button onClick={handleSave} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Page Description</Label>
                      <Textarea
                        placeholder="e.g. This page shares daily cryptocurrency trading signals..."
                        value={currentProfile.description}
                        onChange={(e) => updateField("description", e.target.value)}
                        className="min-h-[80px]"
                      />
                      <p className="text-xs text-muted-foreground">
                        What is this page about? This helps AI understand the context.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Target Audience</Label>
                      <Input
                        placeholder="e.g. Young crypto enthusiasts aged 18-35"
                        value={currentProfile.target_audience}
                        onChange={(e) => updateField("target_audience", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Content Tone</Label>
                      <Select value={currentProfile.content_tone} onValueChange={(v) => updateField("content_tone", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Content Topics</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add a topic..."
                          value={topicInput}
                          onChange={(e) => setTopicInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTopic())}
                        />
                        <Button variant="outline" size="icon" onClick={addTopic}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {currentProfile.content_topics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {currentProfile.content_topics.map((topic) => (
                            <Badge key={topic} variant="secondary" className="gap-1 pr-1">
                              {topic}
                              <button onClick={() => removeTopic(topic)} className="ml-1 hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Posting Goals</Label>
                      <Input
                        placeholder="e.g. Drive engagement, build community trust"
                        value={currentProfile.posting_goals}
                        onChange={(e) => updateField("posting_goals", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Hashtag Preferences</Label>
                      <Input
                        placeholder="e.g. #CryptoSignals #Bitcoin #DayTrading"
                        value={currentProfile.hashtag_preferences}
                        onChange={(e) => updateField("hashtag_preferences", e.target.value)}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          AI System Prompt
                        </Label>
                        <Button variant="ghost" size="sm" onClick={regeneratePrompt} className="text-xs">
                          Regenerate from fields
                        </Button>
                      </div>
                      <Textarea
                        placeholder="The system prompt sent to AI when generating content for this page..."
                        value={currentProfile.system_prompt}
                        onChange={(e) => updateField("system_prompt", e.target.value)}
                        className="min-h-[160px] font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        This prompt is injected into every AI generation when this page is selected.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
