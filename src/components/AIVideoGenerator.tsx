import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Download, Film, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PublishPanel from "@/components/PublishPanel";

const MODELS = [
  { value: "google-veo", label: "Google Veo 2", description: "High-quality cinematic video" },
  { value: "openai-sora", label: "OpenAI Sora", description: "Realistic scene generation" },
];

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical (Reels)" },
  { value: "1:1", label: "1:1 Square", soraOnly: true },
];

export default function AIVideoGenerator() {
  const { toast } = useToast();
  const [model, setModel] = useState("google-veo");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a prompt", description: "Describe the video you want to generate.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setVideoUrl(null);
    setError(null);

    // Simulate progress since these APIs are long-running
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 5;
      });
    }, 3000);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-ai-video", {
        body: { model, prompt, aspectRatio },
      });

      clearInterval(progressInterval);

      if (fnError) throw new Error(fnError.message || "Generation failed");
      if (data?.error) throw new Error(data.error);
      if (!data?.videoUrl) throw new Error("No video returned");

      setVideoUrl(data.videoUrl);
      setProgress(100);
      toast({ title: "Video generated!", description: "Your AI video is ready." });
    } catch (e: any) {
      clearInterval(progressInterval);
      const msg = e?.message || "Video generation failed";
      setError(msg);
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!videoUrl) return;
    try {
      const res = await fetch(videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-video-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(videoUrl, "_blank");
    }
  };

  const selectedModel = MODELS.find((m) => m.value === model);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Controls */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Video Generator
            </h3>
            <p className="text-sm text-muted-foreground">
              Generate fully AI-created videos from a text prompt.
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label>AI Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div>
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground text-xs ml-2">— {m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              placeholder="A drone flying over a tropical beach at golden hour, cinematic quality, smooth camera movement..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be descriptive: include scene, camera movement, lighting, style.
            </p>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating with {selectedModel?.label}...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Video
              </>
            )}
          </Button>

          {/* Progress */}
          {isGenerating && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                This may take 1-3 minutes. Please wait...
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleGenerate}>
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[400px]">
          {videoUrl ? (
            <div className="w-full space-y-4">
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full rounded-lg shadow-lg max-h-[500px] object-contain bg-black"
              />
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
                <Button variant="outline" onClick={() => { setVideoUrl(null); setProgress(0); }}>
                  <RefreshCw className="h-4 w-4 mr-1" /> New Video
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <Film className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-lg font-medium">AI Video Preview</p>
              <p className="text-sm mt-1">
                {isGenerating
                  ? "Your video is being generated by AI..."
                  : "Select a model, enter a prompt, and generate"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish Panel */}
      {videoUrl && (
        <div className="lg:col-span-2">
          <PublishPanel
            content={prompt || "AI Generated Video"}
            mediaUrl={videoUrl}
            defaultTitle={prompt?.slice(0, 80)}
            hasContent={!!videoUrl}
          />
        </div>
      )}
    </div>
  );
}
