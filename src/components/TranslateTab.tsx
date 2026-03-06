import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Languages, Loader2, Copy, Check, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Brand {
  id: string;
  name: string;
  voice_profile: Record<string, unknown> | null;
  prohibited_terms: string[] | null;
  [key: string]: unknown;
}

const SOURCE_LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Italian", label: "Italian" },
  { value: "Japanese", label: "Japanese" },
  { value: "Korean", label: "Korean" },
  { value: "Chinese", label: "Chinese (Simplified)" },
  { value: "Arabic", label: "Arabic" },
  { value: "Hindi", label: "Hindi" },
];

const TARGET_LANGUAGES = [
  { value: "English", label: "🇬🇧 English" },
  { value: "Spanish", label: "🇪🇸 Spanish" },
  { value: "French", label: "🇫🇷 French" },
  { value: "German", label: "🇩🇪 German" },
  { value: "Portuguese", label: "🇧🇷 Portuguese" },
  { value: "Italian", label: "🇮🇹 Italian" },
  { value: "Japanese", label: "🇯🇵 Japanese" },
  { value: "Korean", label: "🇰🇷 Korean" },
  { value: "Chinese (Simplified)", label: "🇨🇳 Chinese (Simplified)" },
  { value: "Arabic", label: "🇸🇦 Arabic" },
  { value: "Hindi", label: "🇮🇳 Hindi" },
  { value: "Dutch", label: "🇳🇱 Dutch" },
  { value: "Russian", label: "🇷🇺 Russian" },
  { value: "Turkish", label: "🇹🇷 Turkish" },
  { value: "Polish", label: "🇵🇱 Polish" },
];

interface Translation {
  language: string;
  text: string;
}

interface TranslateTabProps {
  brands: Brand[];
  generatedText?: string;
}

export default function TranslateTab({ brands, generatedText }: TranslateTabProps) {
  const { toast } = useToast();
  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [translateBrandId, setTranslateBrandId] = useState("");
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleTarget = useCallback((lang: string) => {
    setSelectedTargets((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }, []);

  const handleUseGenerated = useCallback(() => {
    if (generatedText) setSourceText(generatedText);
  }, [generatedText]);

  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim()) {
      toast({ title: "Enter text", description: "Paste or type text to translate.", variant: "destructive" });
      return;
    }
    if (!selectedTargets.length) {
      toast({ title: "Select languages", description: "Pick at least one target language.", variant: "destructive" });
      return;
    }

    setIsTranslating(true);
    setTranslations([]);

    const selectedBrand = brands.find((b) => b.id === translateBrandId);
    const brandVoice = selectedBrand
      ? {
          name: selectedBrand.name,
          tone: (selectedBrand.voice_profile as Record<string, string> | null)?.tone,
          prohibited_terms: selectedBrand.prohibited_terms || undefined,
        }
      : undefined;

    try {
      const { data, error } = await supabase.functions.invoke("translate-content", {
        body: {
          text: sourceText.trim(),
          targetLanguages: selectedTargets,
          sourceLanguage: sourceLanguage !== "auto" ? sourceLanguage : undefined,
          brandVoice,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setTranslations(data.translations || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Translation failed";
      toast({ title: "Translation failed", description: msg, variant: "destructive" });
    } finally {
      setIsTranslating(false);
    }
  }, [sourceText, selectedTargets, sourceLanguage, translateBrandId, brands, toast]);

  const handleCopyTranslation = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input Panel */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-lg">Translate Content</h3>
            {generatedText && (
              <Button variant="outline" size="sm" onClick={handleUseGenerated} className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Use generated text
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Source Text</Label>
            <Textarea
              placeholder="Paste or type the content you want to translate..."
              className="min-h-[120px] resize-none"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              disabled={isTranslating}
            />
          </div>

          <div className="space-y-2">
            <Label>Source Language</Label>
            <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={isTranslating}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Target Languages</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto rounded-md border border-input p-3">
              {TARGET_LANGUAGES.map((lang) => (
                <label
                  key={lang.value}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground transition-colors"
                >
                  <Checkbox
                    checked={selectedTargets.includes(lang.value)}
                    onCheckedChange={() => toggleTarget(lang.value)}
                    disabled={isTranslating}
                  />
                  {lang.label}
                </label>
              ))}
            </div>
            {selectedTargets.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedTargets.length} language{selectedTargets.length > 1 ? "s" : ""} selected</p>
            )}
          </div>

          {brands.length > 0 && (
            <div className="space-y-2">
              <Label>Brand Voice</Label>
              <Select value={translateBrandId} onValueChange={setTranslateBrandId} disabled={isTranslating}>
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

          <Button onClick={handleTranslate} disabled={isTranslating} className="gap-2 w-full sm:w-auto">
            {isTranslating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Translating…
              </>
            ) : (
              <>
                <Languages className="h-4 w-4" />
                Translate
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Output Panel */}
      <Card>
        <CardContent className="p-6 flex flex-col min-h-[360px]">
          {isTranslating ? (
            <div className="flex-1 space-y-4">
              {selectedTargets.map((lang) => (
                <div key={lang} className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-16 w-full rounded-md" />
                </div>
              ))}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Translating into {selectedTargets.length} language{selectedTargets.length > 1 ? "s" : ""}…
              </div>
            </div>
          ) : translations.length > 0 ? (
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-2">
                {translations.map((t, i) => (
                  <div key={i} className="rounded-md border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{t.language}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyTranslation(t.text, i)}
                        className="gap-1.5 h-7"
                      >
                        {copiedIndex === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedIndex === i ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground">{t.text}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Languages className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                <p>Translations will appear here</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
