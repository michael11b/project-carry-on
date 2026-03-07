import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Image, Volume2, Languages, Sparkles, Copy, Check, Loader2, Download, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamGenerate } from "@/lib/streamChat";
import TranslateTab from "@/components/TranslateTab";
import PublishPanel from "@/components/PublishPanel";
import type { Tables } from "@/integrations/supabase/types";

type Brand = Tables<"brands">;

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

const IMAGE_PLATFORMS = [
  { value: "instagram_post", label: "Instagram Post (1:1)" },
  { value: "instagram_story", label: "Instagram Story (9:16)" },
  { value: "facebook_post", label: "Facebook Post (landscape)" },
  { value: "linkedin_post", label: "LinkedIn Post (landscape)" },
  { value: "twitter_post", label: "Twitter/X Post (16:9)" },
  { value: "tiktok_cover", label: "TikTok Cover (9:16)" },
  { value: "blog_header", label: "Blog Header (2:1)" },
  { value: "ad_banner", label: "Ad Banner (landscape)" },
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
  const [savingImage, setSavingImage] = useState(false);

  // Image tab state
  const [imagePrompt, setImagePrompt] = useState("");
  const [imagePlatform, setImagePlatform] = useState<string>("");
  const [imageBrandId, setImageBrandId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [imageDescription, setImageDescription] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [usedImagePlatform, setUsedImagePlatform] = useState<string>("");
  const [usedImageBrand, setUsedImageBrand] = useState<string>("");

  // Fetch brands for the current user's org
  useEffect(() => {
    async function fetchBrands() {
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
    }
    fetchBrands();
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

    await streamGenerate({
      prompt: prompt.trim(),
      brandVoice,
      channel: channel || undefined,
      variantCount: parseInt(variantCount),
      onDelta: (text) => setOutput((prev) => prev + text),
      onDone: () => setIsStreaming(false),
      onError: (error) => {
        setIsStreaming(false);
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      },
    });
  }, [prompt, channel, variantCount, selectedBrandId, brands, toast]);

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

  const handleSaveImage = useCallback(async () => {
    if (!imageUrl) return;
    setSavingImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: memberships } = await supabase.from("organization_members").select("org_id").eq("user_id", user.id);
      if (!memberships?.length) throw new Error("No organization");
      const title = imagePrompt.trim().slice(0, 80) || "Untitled image";
      const platformLabel = IMAGE_PLATFORMS.find((p) => p.value === usedImagePlatform)?.label || "";
      const { error } = await supabase.from("assets").insert({
        org_id: memberships[0].org_id,
        created_by: user.id,
        type: "image" as const,
        title,
        content: imageUrl,
        metadata: { platform: platformLabel, brand: usedImageBrand || "" },
      });
      if (error) throw error;
      toast({ title: "Saved to library", description: "Image saved to your Asset Library." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingImage(false);
    }
  }, [imageUrl, imagePrompt, usedImagePlatform, usedImageBrand, toast]);

  const handleGenerateImage = useCallback(async () => {
    if (!imagePrompt.trim()) {
      toast({ title: "Enter a prompt", description: "Describe the image you want to generate.", variant: "destructive" });
      return;
    }

    setIsGeneratingImage(true);
    setImageUrl("");
    setImageDescription("");
    setUsedImagePlatform(imagePlatform);

    const selectedBrand = brands.find((b) => b.id === imageBrandId);
    setUsedImageBrand(selectedBrand?.name || "");

    const brandStyle = selectedBrand
      ? {
          name: selectedBrand.name,
          colors: selectedBrand.colors as Record<string, string> | undefined,
          tone: (selectedBrand.voice_profile as Record<string, string> | null)?.tone,
        }
      : undefined;

    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: {
          prompt: imagePrompt.trim(),
          brandStyle,
          platform: imagePlatform || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setImageUrl(data.imageUrl);
      setImageDescription(data.description || "");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Image generation failed";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    } finally {
      setIsGeneratingImage(false);
    }
  }, [imagePrompt, imagePlatform, imageBrandId, brands, toast]);

  const handleDownloadImage = useCallback(() => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `generated-image-${Date.now()}.png`;
    a.click();
  }, [imageUrl]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold tracking-tight">Content Studio</h1>
        <p className="text-muted-foreground mt-1">Generate multi-modal content powered by AI.</p>
      </motion.div>

      <Tabs defaultValue="text" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="text" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Text</span>
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-2">
            <Image className="h-4 w-4" />
            <span className="hidden sm:inline">Image</span>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Image Input Panel */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-display font-semibold text-lg">Generate Image</h3>

                <div className="space-y-2">
                  <Label>Image Description</Label>
                  <Textarea
                    placeholder="Describe the image you want... e.g. 'A minimalist product photo of a skincare bottle on a marble surface with soft natural lighting'"
                    className="min-h-[120px] resize-none"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    disabled={isGeneratingImage}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Platform / Size</Label>
                  <Select value={imagePlatform} onValueChange={setImagePlatform} disabled={isGeneratingImage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any size" />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAGE_PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {brands.length > 0 && (
                  <div className="space-y-2">
                    <Label>Brand Style</Label>
                    <Select value={imageBrandId} onValueChange={setImageBrandId} disabled={isGeneratingImage}>
                      <SelectTrigger>
                        <SelectValue placeholder="No brand style" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={handleGenerateImage} disabled={isGeneratingImage} className="gap-2 w-full sm:w-auto">
                  {isGeneratingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Image className="h-4 w-4" />
                      Generate Image
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Image Output Panel */}
            <Card>
              <CardContent className="p-6 flex flex-col min-h-[360px]">
                {isGeneratingImage ? (
                  <div className="flex-1 flex flex-col gap-4">
                    <Skeleton className="w-full aspect-square rounded-md" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-auto">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating image…
                    </div>
                  </div>
                ) : imageUrl ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {usedImagePlatform && (
                          <Badge variant="secondary">
                            {IMAGE_PLATFORMS.find((p) => p.value === usedImagePlatform)?.label || usedImagePlatform}
                          </Badge>
                        )}
                        {usedImageBrand && (
                          <Badge variant="outline">{usedImageBrand}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={handleSaveImage} disabled={savingImage} className="gap-1.5">
                          {savingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDownloadImage} className="gap-1.5">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <img
                        src={imageUrl}
                        alt={imageDescription || "Generated image"}
                        className="max-w-full max-h-[500px] rounded-md border border-border object-contain"
                      />
                    </div>
                    {imageDescription && (
                      <p className="text-sm text-muted-foreground mt-3">{imageDescription}</p>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Image className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                      <p>Generated image will appear here</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
