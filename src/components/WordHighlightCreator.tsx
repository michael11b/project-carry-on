import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sparkles, Loader2, Play, Pause, Download, Volume2, RotateCcw, Type,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

// ─── Types & Constants ─────────────────────────────────────────────────────

const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16 Vertical", width: 1080, height: 1920 },
  { value: "1:1", label: "1:1 Square", width: 1080, height: 1080 },
  { value: "16:9", label: "16:9 Landscape", width: 1920, height: 1080 },
];

const VOICES = [
  { value: "JBFqnCBsd6RMkjVDRZzb", label: "George (Male)" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (Female)" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel (Male)" },
  { value: "pFZP5JQG7iQjIQuC4Bku", label: "Lily (Female)" },
  { value: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam (Male)" },
  { value: "cgSgspJ2msm6clMCkdW9", label: "Jessica (Female)" },
];

const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)",
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
];

const FONT_OPTIONS = [
  { value: "system-ui, -apple-system, sans-serif", label: "System" },
  { value: "'Georgia', serif", label: "Georgia" },
  { value: "'Courier New', monospace", label: "Mono" },
  { value: "'Impact', sans-serif", label: "Impact" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
];

type HighlightStyle = "enlarge" | "color" | "both";

// ─── Component ──────────────────────────────────────────────────────────────

export default function WordHighlightCreator() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Input
  const [text, setText] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [voiceId, setVoiceId] = useState(VOICES[0].value);
  const [gradient, setGradient] = useState(GRADIENT_PRESETS[0]);
  const [font, setFont] = useState(FONT_OPTIONS[0].value);
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>("both");
  const [highlightColor, setHighlightColor] = useState("#facc15");
  const [baseColor, setBaseColor] = useState("#ffffff");
  const [enlargeScale, setEnlargeScale] = useState(1.4);
  const [bold, setBold] = useState(true);

  // Audio
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [gradientPhase, setGradientPhase] = useState(0);
  const playStartRef = useRef(0);

  const ratio = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];
  const words = text.trim().split(/\s+/).filter(Boolean);

  // ─── Audio Helpers ──────────────────────────────────────────────────────

  const getAudioBlobDuration = (blob: Blob): Promise<number> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration)) { resolve(audio.duration); URL.revokeObjectURL(url); }
        else {
          audio.addEventListener("durationchange", () => {
            if (isFinite(audio.duration)) { resolve(audio.duration); URL.revokeObjectURL(url); }
          });
          setTimeout(() => { resolve(5); URL.revokeObjectURL(url); }, 5000);
        }
      });
      audio.addEventListener("error", () => { resolve(5); URL.revokeObjectURL(url); });
    });

  // ─── Generate Audio ─────────────────────────────────────────────────────

  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      toast({ title: "Enter text", description: "Write the text for the video.", variant: "destructive" });
      return;
    }
    setIsGeneratingAudio(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: text.trim(), voiceId }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "TTS failed" }));
        throw new Error(err.error || "TTS failed");
      }
      const blob = await response.blob();
      const dur = await getAudioBlobDuration(blob);
      setAudioBlob(blob);
      setAudioDuration(dur);
      toast({ title: "Audio generated!", description: `${dur.toFixed(1)}s voiceover ready.` });
    } catch (e) {
      toast({ title: "Audio generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // ─── Canvas Rendering ───────────────────────────────────────────────────

  const drawFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    wordList: string[],
    currentWordIndex: number,
    wordProgress: number,
    phase: number,
    opts: {
      gradient: string;
      font: string;
      bold: boolean;
      baseColor: string;
      highlightColor: string;
      highlightStyle: HighlightStyle;
      enlargeScale: number;
    }
  ) => {
    const { width, height } = ctx.canvas;

    // ── Background ────────────────────────────────────────────────────
    const angle = 135 + Math.sin(phase * 0.02) * 20;
    const rad = (angle * Math.PI) / 180;
    const x1 = width / 2 - Math.cos(rad) * width;
    const y1 = height / 2 - Math.sin(rad) * height;
    const x2 = width / 2 + Math.cos(rad) * width;
    const y2 = height / 2 + Math.sin(rad) * height;
    const colorMatches = opts.gradient.match(/#[0-9a-fA-F]{6}/g) || ["#667eea", "#764ba2"];
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, colorMatches[0]);
    grad.addColorStop(1, colorMatches[1] || colorMatches[0]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle particles
    for (let i = 0; i < 5; i++) {
      const px = (width * (i + 1)) / 6 + Math.sin(phase * 0.015 + i) * 30;
      const py = (height * (i + 1)) / 6 + Math.cos(phase * 0.02 + i * 2) * 30;
      ctx.beginPath();
      ctx.arc(px, py, 20 + Math.sin(phase * 0.03 + i) * 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.sin(phase * 0.02 + i) * 0.02})`;
      ctx.fill();
    }

    if (wordList.length === 0) return;

    // ── Word Layout ───────────────────────────────────────────────────
    const baseFontSize = Math.min(width, height) * 0.055;
    const weight = opts.bold ? "bold" : "normal";
    const maxWidth = width * 0.85;
    const lineHeight = baseFontSize * 1.6;

    // Measure words at base size
    ctx.font = `${weight} ${baseFontSize}px ${opts.font}`;
    const spaceWidth = ctx.measureText(" ").width;

    // Build lines
    type WordMeta = { word: string; globalIndex: number; x: number; width: number };
    type LineMeta = { words: WordMeta[]; y: number; totalWidth: number };
    const lines: LineMeta[] = [];
    let curLine: WordMeta[] = [];
    let curWidth = 0;

    for (let i = 0; i < wordList.length; i++) {
      const w = wordList[i];
      const ww = ctx.measureText(w).width;
      const neededWidth = curLine.length > 0 ? spaceWidth + ww : ww;

      if (curWidth + neededWidth > maxWidth && curLine.length > 0) {
        lines.push({ words: curLine, y: 0, totalWidth: curWidth });
        curLine = [{ word: w, globalIndex: i, x: 0, width: ww }];
        curWidth = ww;
      } else {
        curLine.push({ word: w, globalIndex: i, x: 0, width: ww });
        curWidth += neededWidth;
      }
    }
    if (curLine.length > 0) lines.push({ words: curLine, y: 0, totalWidth: curWidth });

    // Position lines centered vertically
    const totalH = lines.length * lineHeight;
    const startY = height / 2 - totalH / 2 + lineHeight / 2;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      line.y = startY + li * lineHeight;
      // Position words within line (centered)
      let lw = 0;
      for (const wm of line.words) lw += wm.width;
      lw += (line.words.length - 1) * spaceWidth;
      let cx = (width - lw) / 2;
      for (const wm of line.words) {
        wm.x = cx;
        cx += wm.width + spaceWidth;
      }
    }

    // ── Draw Words ────────────────────────────────────────────────────
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (const line of lines) {
      for (const wm of line.words) {
        const isHighlighted = wm.globalIndex < currentWordIndex;
        const isCurrent = wm.globalIndex === currentWordIndex;

        let scale = 1;
        let color = opts.baseColor;
        let alpha = 0.5;

        if (isHighlighted) {
          alpha = 0.7;
          if (opts.highlightStyle === "color" || opts.highlightStyle === "both") {
            color = opts.highlightColor;
          }
        }

        if (isCurrent) {
          alpha = 1;
          if (opts.highlightStyle === "color" || opts.highlightStyle === "both") {
            color = opts.highlightColor;
          }
          if (opts.highlightStyle === "enlarge" || opts.highlightStyle === "both") {
            // Smooth scale animation: grow quickly then settle
            const growT = Math.min(wordProgress * 3, 1);
            const eased = 1 - Math.pow(1 - growT, 3);
            scale = 1 + (opts.enlargeScale - 1) * eased;
          }
        }

        const fontSize = baseFontSize * scale;
        ctx.font = `${weight} ${fontSize}px ${opts.font}`;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = isCurrent ? 25 : 10;
        ctx.shadowOffsetY = 2;

        // Center the scaled word around its original position
        const scaledWidth = ctx.measureText(wm.word).width;
        const origCenter = wm.x + wm.width / 2;
        const drawX = origCenter - scaledWidth / 2;

        // If current word, add a subtle glow
        if (isCurrent) {
          ctx.shadowColor = opts.highlightColor;
          ctx.shadowBlur = 30;
        }

        ctx.fillStyle = color;
        ctx.fillText(wm.word, drawX, line.y);
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // ── Progress bar at bottom ────────────────────────────────────────
    const barY = height * 0.92;
    const barW = width * 0.7;
    const barH = 4;
    const barX = (width - barW) / 2;
    const totalProgress = wordList.length > 0 ? (currentWordIndex + wordProgress) / wordList.length : 0;

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * totalProgress, barH, barH / 2);
    ctx.fill();
  }, []);

  // ─── Static preview ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const previewScale = 0.3;
    canvas.width = ratio.width * previewScale;
    canvas.height = ratio.height * previewScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(previewScale, previewScale);
    const virtualCanvas = { width: ratio.width, height: ratio.height } as HTMLCanvasElement;
    Object.defineProperty(ctx, "canvas", { value: virtualCanvas, configurable: true });

    // For static preview, show the text with a simulated current word
    const wordIdx = Math.min(Math.floor(words.length * 0.3), words.length - 1);
    drawFrame(ctx, words, Math.max(wordIdx, 0), 0.5, gradientPhase, {
      gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale,
    });
    ctx.restore();
  }, [text, gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale, ratio, gradientPhase, drawFrame, words]);

  // ─── Playback loop ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying || !audioBlob) return;

    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    playStartRef.current = Date.now();
    let phase = gradientPhase;

    audio.play().catch(() => {});

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setPlaybackTime(0);
    });

    const animate = () => {
      const elapsed = (Date.now() - playStartRef.current) / 1000;
      phase += 1;
      setPlaybackTime(elapsed);
      setGradientPhase(phase);

      // Calculate current word index based on elapsed time
      // Distribute words evenly across the audio duration
      const totalWords = words.length;
      const wordDuration = audioDuration / totalWords;
      const currentWordIdx = Math.min(Math.floor(elapsed / wordDuration), totalWords - 1);
      const wordProgress = (elapsed % wordDuration) / wordDuration;

      const canvas = canvasRef.current;
      if (canvas) {
        const previewScale = 0.3;
        canvas.width = ratio.width * previewScale;
        canvas.height = ratio.height * previewScale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(previewScale, previewScale);
          const virtualCanvas = { width: ratio.width, height: ratio.height } as HTMLCanvasElement;
          Object.defineProperty(ctx, "canvas", { value: virtualCanvas, configurable: true });
          drawFrame(ctx, words, currentWordIdx, wordProgress, phase, {
            gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale,
          });
          ctx.restore();
        }
      }

      if (elapsed < audioDuration) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      audio.pause();
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [isPlaying, audioBlob, audioDuration, words, drawFrame, gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale, ratio]);

  // ─── Export ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!audioBlob || words.length === 0) return;
    setIsRecording(true);
    toast({ title: "Recording video…", description: "Please wait." });

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = ratio.width;
      offscreen.height = ratio.height;
      const offCtx = offscreen.getContext("2d")!;
      const stream = offscreen.captureStream(30);
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      stream.addTrack(destination.stream.getAudioTracks()[0] || stream.getVideoTracks()[0]);

      // Decode and play audio into the stream
      const ab = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(ab);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(destination);
      source.start();

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
      });
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `word-highlight-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        toast({ title: "Video exported!" });
      };
      mediaRecorder.start();

      let phase = 0;
      const totalWords = words.length;
      const wordDuration = audioDuration / totalWords;
      const startTime = Date.now();

      while ((Date.now() - startTime) / 1000 < audioDuration + 0.5) {
        const elapsed = (Date.now() - startTime) / 1000;
        phase += 1;
        const currentWordIdx = Math.min(Math.floor(elapsed / wordDuration), totalWords - 1);
        const wordProgress = (elapsed % wordDuration) / wordDuration;

        drawFrame(offCtx, words, currentWordIdx, wordProgress, phase, {
          gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale,
        });
        await new Promise(r => setTimeout(r, 33));
      }

      mediaRecorder.stop();
      audioContext.close();
    } catch (e) {
      setIsRecording(false);
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  // ─── Preview dimensions ───────────────────────────────────────────────

  const previewMaxHeight = 480;
  const previewWidth = (ratio.width / ratio.height) * previewMaxHeight;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Controls */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Type className="h-5 w-5" />
            Word Highlight Video
          </h3>

          <div className="space-y-2">
            <Label>Script Text</Label>
            <Textarea
              placeholder="Type or paste the full script here. Each word will be highlighted as the voiceover narrates…"
              className="min-h-[120px] resize-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isPlaying}
            />
            {words.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{words.length} words</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Format</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Voice</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VOICES.map(v => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <Label className="text-xs">Background</Label>
            <div className="flex gap-2 flex-wrap">
              {GRADIENT_PRESETS.map((g, i) => (
                <button
                  key={i}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${
                    gradient === g ? "border-primary scale-110" : "border-transparent"
                  }`}
                  style={{ background: g }}
                  onClick={() => setGradient(g)}
                />
              ))}
            </div>
          </div>

          {/* Styling */}
          <div className="space-y-3 border border-border rounded-lg p-3">
            <Label className="text-xs font-medium">Text Styling</Label>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Font</Label>
                <Select value={font} onValueChange={setFont}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Highlight Mode</Label>
                <Select value={highlightStyle} onValueChange={(v) => setHighlightStyle(v as HighlightStyle)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Color + Enlarge</SelectItem>
                    <SelectItem value="color">Color Only</SelectItem>
                    <SelectItem value="enlarge">Enlarge Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(highlightStyle === "enlarge" || highlightStyle === "both") && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Enlarge Scale ({Math.round(enlargeScale * 100)}%)</Label>
                <Slider
                  value={[enlargeScale]}
                  min={1.1} max={2.0} step={0.1}
                  onValueChange={([v]) => setEnlargeScale(v)}
                  className="py-1"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Switch checked={bold} onCheckedChange={setBold} />
                <Label className="text-[10px]">Bold</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px]">Base</Label>
                <input
                  type="color" value={baseColor}
                  onChange={(e) => setBaseColor(e.target.value)}
                  className="w-6 h-6 rounded border border-border cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px]">Highlight</Label>
                <input
                  type="color" value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
                  className="w-6 h-6 rounded border border-border cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleGenerateAudio}
              disabled={isGeneratingAudio || !text.trim()}
              variant="secondary"
              className="w-full gap-2"
            >
              {isGeneratingAudio ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating Voiceover…</>
              ) : (
                <><Volume2 className="h-4 w-4" /> {audioBlob ? "Regenerate" : "Generate"} Voiceover</>
              )}
            </Button>

            {audioBlob && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {audioDuration.toFixed(1)}s audio ready
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  ~{(audioDuration / Math.max(words.length, 1)).toFixed(2)}s per word
                </Badge>
              </div>
            )}

            <Button
              onClick={handleExport}
              disabled={isRecording || !audioBlob}
              className="w-full gap-2"
            >
              {isRecording ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</>
              ) : (
                <><Download className="h-4 w-4" /> Export Video</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right: Preview */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[400px]">
          {text.trim() ? (
            <>
              <div className="relative rounded-lg overflow-hidden shadow-2xl border border-border" style={{ width: previewWidth, maxWidth: "100%" }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>

              {/* Playback controls */}
              {audioBlob && (
                <div className="flex items-center gap-3 mt-4">
                  <Button
                    variant="outline" size="icon"
                    onClick={() => {
                      if (isPlaying) {
                        setIsPlaying(false);
                      } else {
                        setPlaybackTime(0);
                        setIsPlaying(true);
                      }
                    }}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {isPlaying ? `${playbackTime.toFixed(1)}s / ${audioDuration.toFixed(1)}s` : "Ready to play"}
                  </span>
                  {!isPlaying && playbackTime > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setPlaybackTime(0)} className="gap-1 text-xs">
                      <RotateCcw className="h-3 w-3" /> Reset
                    </Button>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-3 text-center max-w-[300px]">
                Words will highlight and enlarge one by one as the voiceover plays.
              </p>
            </>
          ) : (
            <div className="text-center text-muted-foreground">
              <Type className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-medium">Word Highlight Preview</p>
              <p className="text-sm mt-1">Enter your script text to see the preview</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
