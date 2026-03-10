import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, Image, Volume2, Languages, Sparkles, Copy, Check, Loader2, Download, Save, Facebook, ChevronDown, Settings2, Film, Type } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamGenerate } from "@/lib/streamChat";
import TranslateTab from "@/components/TranslateTab";
import PublishPanel from "@/components/PublishPanel";
import VideoCreator from "@/components/VideoCreator";
import WordHighlightCreator from "@/components/WordHighlightCreator";
import ImageChat from "@/components/ImageChat";
import type { Tables } from "@/integrations/supabase/types";

type Brand = Tables<"brands">;

interface PageProfile {
  id: string;
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

const CHANNELS = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "Twitter / X" },
  { value: "blog", label: "Blog" },
  { value: "ad_copy", label: "Ad Copy" },
];

const VARIANT_COUNTS = [
  { value: "1", label: "1 variant" },
  { value: "3", label: "3 variants" },
  { value: "5", label: "5 variants" },
  { value: "10", label: "10 variants" },
];


export default function Studio() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [channel, setChannel] = useState<string>("");
  const [variantCount, setVariantCount] = useState("1");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [output, setOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [usedChannel, setUsedChannel] = useState<string>("");
  const [usedBrand, setUsedBrand] = useState<string>("");
  const [savingText, setSavingText] = useState(false);
  

  // Page profile state
  const [pageProfiles, setPageProfiles] = useState<PageProfile[]>([]);
  const [selectedPageProfileId, setSelectedPageProfileId] = useState<string>("");
  const [contextOpen, setContextOpen] = useState(false);

  // Editable page context overrides (pre-populated from selected page)
  const [ctxDescription, setCtxDescription] = useState("");
  const [ctxAudience, setCtxAudience] = useState("");
  const [ctxTone, setCtxTone] = useState("");
  const [ctxTopics, setCtxTopics] = useState("");
  const [ctxGoals, setCtxGoals] = useState("");
  const [ctxHashtags, setCtxHashtags] = useState("");

  // Sync overrides when page selection changes
  useEffect(() => {
    const page = pageProfiles.find((p) => p.id === selectedPageProfileId);
    if (page) {
      setCtxDescription(page.description || "");
      setCtxAudience(page.target_audience || "");
      setCtxTone(page.content_tone || "");
      setCtxTopics(page.content_topics?.join(", ") || "");
      setCtxGoals(page.posting_goals || "");
      setCtxHashtags(page.hashtag_preferences || "");
      setContextOpen(true);
    } else {
      setCtxDescription("");
      setCtxAudience("");
      setCtxTone("");
      setCtxTopics("");
      setCtxGoals("");
      setCtxHashtags("");
      setContextOpen(false);
    }
  }, [selectedPageProfileId, pageProfiles]);

  // Image chat gets brands, page context, and content type as props
  const selectedPage = pageProfiles.find((p) => p.id === selectedPageProfileId);
  const imagePageContext = (selectedPage || ctxDescription || ctxTone) ? {
    page_name: selectedPage?.page_name || "",
    description: ctxDescription,
    content_tone: ctxTone,
  } : undefined;
  const imageContentType = selectedPage ? "facebook_post_image" : undefined;

  // Fetch brands and page profiles for the current user's org
  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id);

      if (!memberships?.length) return;

      const orgIds = memberships.map((m) => m.org_id);
      const { data } = await supabase
        .from("brands")
        .select("*")
        .in("org_id", orgIds);

      if (data) setBrands(data);

      // Fetch page profiles
      const { data: profiles } = await supabase
        .from("page_profiles")
        .select("*")
        .in("org_id", orgIds);

      if (profiles) setPageProfiles(profiles as unknown as PageProfile[]);
    }
    fetchData();
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a prompt", description: "Describe the content you want to generate.", variant: "destructive" });
      return;
    }

    setIsStreaming(true);
    setOutput("");
    setUsedChannel(channel);

    const selectedBrand = brands.find((b) => b.id === selectedBrandId);
    setUsedBrand(selectedBrand?.name || "");

    const brandVoice = selectedBrand
      ? {
          name: selectedBrand.name,
          voice_profile: selectedBrand.voice_profile as Record<string, unknown> | undefined,
          prohibited_terms: selectedBrand.prohibited_terms || undefined,
        }
      : undefined;

    // Determine content type based on page selection
    const selectedPage = pageProfiles.find((p) => p.id === selectedPageProfileId);
    const hasPageContext = selectedPage || ctxDescription || ctxAudience || ctxTone || ctxTopics || ctxGoals || ctxHashtags;
    let contentType: string | undefined;
    if (selectedPage) {
      contentType = "facebook_post";
    }

    // Build page context from editable overrides
    const pageContext = hasPageContext ? {
      page_name: selectedPage?.page_name || "",
      description: ctxDescription,
      target_audience: ctxAudience,
      content_tone: ctxTone,
      content_topics: ctxTopics ? ctxTopics.split(",").map((t) => t.trim()).filter(Boolean) : [],
      posting_goals: ctxGoals,
      hashtag_preferences: ctxHashtags,
      custom_system_prompt: selectedPage?.system_prompt || "",
    } : undefined;

    await streamGenerate({
      prompt: prompt.trim(),
      brandVoice,
      channel: channel || undefined,
      variantCount: parseInt(variantCount),
      contentType,
      pageContext,
      onDelta: (text) => setOutput((prev) => prev + text),
      onDone: () => setIsStreaming(false),
      onError: (error) => {
        setIsStreaming(false);
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      },
    });
  }, [prompt, channel, variantCount, selectedBrandId, selectedPageProfileId, brands, pageProfiles, toast]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleSaveText = useCallback(async () => {
    if (!output) return;
    setSavingText(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: memberships } = await supabase.from("organization_members").select("org_id").eq("user_id", user.id);
      if (!memberships?.length) throw new Error("No organization");
      const title = prompt.trim().slice(0, 80) || "Untitled text";
      const { error } = await supabase.from("assets").insert({
        org_id: memberships[0].org_id,
        created_by: user.id,
        type: "text" as const,
        title,
        content: output,
        metadata: { channel: usedChannel || "", brand: usedBrand || "" },
      });
      if (error) throw error;
      toast({ title: "Saved to library", description: "Text content saved to your Asset Library." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingText(false);
    }
  }, [output, prompt, usedChannel, usedBrand, toast]);

  // Image generation is now handled by ImageChat component

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Content Studio</h1>
            <p className="text-muted-foreground mt-1">Generate multi-modal content powered by AI.</p>
          </div>
          {pageProfiles.length > 0 && (
            <div className="flex items-center gap-2">
              <Facebook className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedPageProfileId} onValueChange={setSelectedPageProfileId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="No page selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No page (general)</SelectItem>
                  {pageProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.page_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </motion.div>

      {/* Editable Page Context */}
      <Collapsible open={contextOpen} onOpenChange={setContextOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            Content Context
            <ChevronDown className={`h-4 w-4 transition-transform ${contextOpen ? "rotate-180" : ""}`} />
            {(ctxDescription || ctxAudience || ctxTone) && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">Active</Badge>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-3">
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  placeholder="What is this content about?"
                  value={ctxDescription}
                  onChange={(e) => setCtxDescription(e.target.value)}
                  className="min-h-[60px] text-xs resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Target Audience</Label>
                <Input
                  placeholder="e.g. Young crypto traders aged 18-35"
                  value={ctxAudience}
                  onChange={(e) => setCtxAudience(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tone</Label>
                <Select value={ctxTone} onValueChange={setCtxTone}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Casual & Friendly</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="inspirational">Inspirational</SelectItem>
                    <SelectItem value="humorous">Humorous & Fun</SelectItem>
                    <SelectItem value="educational">Educational</SelectItem>
                    <SelectItem value="authoritative">Authoritative</SelectItem>
                    <SelectItem value="empathetic">Empathetic & Warm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Topics (comma-separated)</Label>
                <Input
                  placeholder="e.g. Bitcoin, Trading signals, Market analysis"
                  value={ctxTopics}
                  onChange={(e) => setCtxTopics(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Goals</Label>
                <Input
                  placeholder="e.g. Drive engagement, build trust"
                  value={ctxGoals}
                  onChange={(e) => setCtxGoals(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Hashtags</Label>
                <Input
                  placeholder="e.g. #Bitcoin #CryptoSignals"
                  value={ctxHashtags}
                  onChange={(e) => setCtxHashtags(e.target.value)}
                  className="text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Tabs defaultValue="text" className="space-y-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="text" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Text</span>
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-2">
            <Image className="h-4 w-4" />
            <span className="hidden sm:inline">Image</span>
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-2">
            <Film className="h-4 w-4" />
            <span className="hidden sm:inline">Video</span>
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-2">
            <Volume2 className="h-4 w-4" />
            <span className="hidden sm:inline">Audio</span>
          </TabsTrigger>
          <TabsTrigger value="translate" className="gap-2">
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">Translate</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Panel */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-display font-semibold text-lg">Generate Text Content</h3>

                <div className="space-y-2">
                  <Label>Prompt</Label>
                  <Textarea
                    placeholder="Describe the content you want to generate... e.g. 'Write 3 Instagram captions for a summer product launch, playful tone, include CTAs'"
                    className="min-h-[120px] resize-none"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isStreaming}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel} disabled={isStreaming}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Variants</Label>
                    <Select value={variantCount} onValueChange={setVariantCount} disabled={isStreaming}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIANT_COUNTS.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {brands.length > 0 && (
                  <div className="space-y-2">
                    <Label>Brand Voice</Label>
                    <Select value={selectedBrandId} onValueChange={setSelectedBrandId} disabled={isStreaming}>
                      <SelectTrigger>
                        <SelectValue placeholder="No brand voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={handleGenerate} disabled={isStreaming} className="gap-2 w-full sm:w-auto">
                  {isStreaming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Output Panel */}
            <Card>
              <CardContent className="p-6 flex flex-col min-h-[360px]">
                {output ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {usedChannel && (
                          <Badge variant="secondary" className="capitalize">
                            {CHANNELS.find((c) => c.value === usedChannel)?.label || usedChannel}
                          </Badge>
                        )}
                        {usedBrand && (
                          <Badge variant="outline">{usedBrand}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={handleSaveText} disabled={savingText || isStreaming} className="gap-1.5">
                          {savingText ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                        {output}
                        {isStreaming && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom rounded-sm" />}
                      </div>
                    </ScrollArea>
                    <PublishPanel
                      content={output}
                      defaultTitle={prompt.trim().slice(0, 80)}
                      hasContent={!!output && !isStreaming}
                    />
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                      <p>Generated content will appear here</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="image">
          <ImageChat
            brands={brands}
            pageContext={imagePageContext}
            contentType={imageContentType}
          />
        </TabsContent>

        <TabsContent value="video">
          <Tabs defaultValue="slides" className="space-y-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="slides" className="gap-2">
                <Film className="h-4 w-4" />
                <span>Slides</span>
              </TabsTrigger>
              <TabsTrigger value="word-highlight" className="gap-2">
                <Type className="h-4 w-4" />
                <span>Word Highlight</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="slides">
              <VideoCreator />
            </TabsContent>
            <TabsContent value="word-highlight">
              <WordHighlightCreator />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="audio">
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <Volume2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-medium">Text-to-Speech</p>
              <p className="text-sm mt-1">Convert scripts to voiceovers with ElevenLabs.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="translate">
          <TranslateTab brands={brands} generatedText={output || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
