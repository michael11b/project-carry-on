import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Send, Save, Download, Layers, ChevronDown, Image, Sparkles, Settings2, RotateCcw, CalendarDays, ImagePlus, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import PublishPanel from "@/components/PublishPanel";

type Brand = Tables<"brands">;

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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  variations?: Array<{ imageUrl: string; description: string }>;
  isLoading?: boolean;
  timestamp: number;
}

interface ImageChatProps {
  brands: Brand[];
  pageContext?: {
    page_name?: string;
    description?: string;
    content_tone?: string;
  };
  contentType?: string;
}

export default function ImageChat({ brands, pageContext, contentType }: ImageChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [platform, setPlatform] = useState("");
  const [brandId, setBrandId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [publishImageUrl, setPublishImageUrl] = useState<string | null>(null);
  const [publishPromptText, setPublishPromptText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buildConversationMessages = useCallback(() => {
    // Build conversation history for the AI, including image references for editing
    return messages
      .filter((m) => !m.isLoading)
      .map((m) => {
        if (m.role === "user") {
          // If the previous assistant message has an image, include it as multi-modal
          const prevAssistant = messages
            .filter((pm) => pm.role === "assistant" && pm.timestamp < m.timestamp && pm.imageUrl)
            .pop();

          if (prevAssistant?.imageUrl) {
            return {
              role: "user" as const,
              content: [
                { type: "text", text: m.text },
                { type: "image_url", image_url: { url: prevAssistant.imageUrl } },
              ],
            };
          }
          return { role: "user" as const, content: m.text };
        }
        return { role: "assistant" as const, content: m.text || "Image generated." };
      });
  }, [messages]);

  const handleSend = useCallback(async (variationCount?: number) => {
    const text = input.trim();
    if (!text && messages.length === 0) {
      toast({ title: "Enter a prompt", description: "Describe the image you want to generate.", variant: "destructive" });
      return;
    }

    const isVariationRequest = variationCount && variationCount > 1;
    const userText = text || (isVariationRequest ? "Generate variations of this image" : "");
    if (!userText) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: userText,
      timestamp: Date.now(),
    };

    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: isVariationRequest ? "Generating variations…" : "Generating image…",
      isLoading: true,
      timestamp: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setIsGenerating(true);

    const selectedBrand = brands.find((b) => b.id === brandId);
    const brandStyle = selectedBrand
      ? {
          name: selectedBrand.name,
          colors: selectedBrand.colors as Record<string, string> | undefined,
          tone: (selectedBrand.voice_profile as Record<string, string> | null)?.tone,
        }
      : undefined;

    // Build conversation history including the new user message
    const prevMessages = messages.filter((m) => !m.isLoading);
    const allForAI = [
      ...prevMessages.map((m) => {
        if (m.role === "user") {
          const prevAssistant = prevMessages
            .filter((pm) => pm.role === "assistant" && pm.timestamp < m.timestamp && pm.imageUrl)
            .pop();
          if (prevAssistant?.imageUrl) {
            return {
              role: "user" as const,
              content: [
                { type: "text", text: m.text },
                { type: "image_url", image_url: { url: prevAssistant.imageUrl } },
              ],
            };
          }
          return { role: "user" as const, content: m.text };
        }
        return { role: "assistant" as const, content: m.text || "Image generated." };
      }),
      // Add the new user message
      (() => {
        const lastImage = prevMessages
          .filter((m) => m.role === "assistant" && m.imageUrl)
          .pop();
        if (lastImage?.imageUrl) {
          return {
            role: "user" as const,
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: lastImage.imageUrl } },
            ],
          };
        }
        return { role: "user" as const, content: userText };
      })(),
    ];

    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: {
          messages: allForAI,
          brandStyle,
          platform: platform || undefined,
          contentType,
          pageContext,
          variationCount: isVariationRequest ? variationCount : undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const assistantMsg: ChatMessage = {
        id: loadingMsg.id,
        role: "assistant",
        text: data.description || "",
        imageUrl: data.imageUrl,
        variations: data.variations,
        timestamp: Date.now(),
      };

      setMessages((prev) => prev.map((m) => (m.id === loadingMsg.id ? assistantMsg : m)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Image generation failed";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));
    } finally {
      setIsGenerating(false);
      inputRef.current?.focus();
    }
  }, [input, messages, brands, brandId, platform, contentType, pageContext, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVariations = useCallback((count: number) => {
    handleSend(count);
  }, [handleSend]);

  const handleDownload = useCallback((url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `generated-image-${Date.now()}.png`;
    a.click();
  }, []);

  const handleSaveImage = useCallback(async (imageUrl: string, promptText: string, msgId: string) => {
    setSavingId(msgId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: memberships } = await supabase.from("organization_members").select("org_id").eq("user_id", user.id);
      if (!memberships?.length) throw new Error("No organization");
      const title = promptText.slice(0, 80) || "Untitled image";
      const platformLabel = IMAGE_PLATFORMS.find((p) => p.value === platform)?.label || "";
      const selectedBrand = brands.find((b) => b.id === brandId);
      const { error } = await supabase.from("assets").insert({
        org_id: memberships[0].org_id,
        created_by: user.id,
        type: "image" as const,
        title,
        content: imageUrl,
        metadata: { platform: platformLabel, brand: selectedBrand?.name || "" },
      });
      if (error) throw error;
      toast({ title: "Saved to library", description: "Image saved to your Asset Library." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }, [platform, brandId, brands, toast]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput("");
  }, []);

  // Find the latest user prompt text for saving context
  const lastUserPrompt = messages.filter((m) => m.role === "user").pop()?.text || "";

  return (
    <div className="flex flex-col h-[calc(100vh-300px)] min-h-[500px]">
      {/* Settings bar */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <div className="flex items-center justify-between mb-3">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 text-muted-foreground">
              <Settings2 className="h-4 w-4" />
              Image Settings
              <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
              {(platform || brandId) && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">Active</Badge>}
            </Button>
          </CollapsibleTrigger>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleNewChat} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              New Chat
            </Button>
          )}
        </div>
        <CollapsibleContent>
          <div className="flex gap-4 mb-4 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Platform / Size</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="text-xs">
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
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Brand Style</Label>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger className="text-xs">
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
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Chat messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-lg border border-border bg-card p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Image Generation Chat</p>
              <p className="text-sm mt-1">Describe an image, then refine it through conversation.</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}>
              {/* Message text */}
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>

              {/* Loading indicator */}
              {msg.isLoading && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Working on it…</span>
                </div>
              )}

              {/* Single image */}
              {msg.imageUrl && !msg.isLoading && (
                <div className="mt-3">
                  <img
                    src={msg.imageUrl}
                    alt={msg.text || "Generated image"}
                    className="max-w-full max-h-[400px] rounded-lg border border-border object-contain"
                  />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSaveImage(msg.imageUrl!, lastUserPrompt, msg.id)}
                      disabled={savingId === msg.id}
                      className="gap-1 h-7 text-xs"
                    >
                      {savingId === msg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(msg.imageUrl!)} className="gap-1 h-7 text-xs">
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPublishImageUrl(msg.imageUrl!); setPublishPromptText(msg.text || lastUserPrompt); }}
                      className="gap-1 h-7 text-xs"
                    >
                      <CalendarDays className="h-3 w-3" />
                      Schedule
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleVariations(3)}
                      disabled={isGenerating}
                      className="gap-1 h-7 text-xs"
                    >
                      <Layers className="h-3 w-3" />
                      3 Variations
                    </Button>
                  </div>
                </div>
              )}

              {/* Variations grid */}
              {msg.variations && msg.variations.length > 1 && !msg.isLoading && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">{msg.variations.length} variations generated</p>
                  <div className="grid grid-cols-2 gap-2">
                    {msg.variations.map((v, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={v.imageUrl}
                          alt={v.description || `Variation ${i + 1}`}
                          className="w-full rounded-md border border-border object-contain aspect-square"
                        />
                        <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSaveImage(v.imageUrl, lastUserPrompt, `${msg.id}-${i}`)}
                            disabled={savingId === `${msg.id}-${i}`}
                            className="h-6 w-6 p-0"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownload(v.imageUrl)}
                            className="h-6 w-6 p-0"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { setPublishImageUrl(v.imageUrl); setPublishPromptText(v.description || lastUserPrompt); }}
                            className="h-6 w-6 p-0"
                          >
                            <CalendarDays className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className="flex items-end gap-2 mt-3">
        <Textarea
          ref={inputRef}
          placeholder={messages.length === 0 ? "Describe the image you want to generate…" : "Refine, adjust, or describe a new image…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          className="min-h-[44px] max-h-[120px] resize-none text-sm"
          rows={1}
        />
        <Button
          onClick={() => handleSend()}
          disabled={isGenerating || !input.trim()}
          size="icon"
          className="h-[44px] w-[44px] shrink-0"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* Publish/Schedule Dialog */}
      <Dialog open={!!publishImageUrl} onOpenChange={(open) => { if (!open) setPublishImageUrl(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {publishImageUrl && (
            <PublishPanel
              content={publishPromptText}
              mediaUrl={publishImageUrl}
              hasContent={true}
              defaultTitle={publishPromptText.slice(0, 80)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
