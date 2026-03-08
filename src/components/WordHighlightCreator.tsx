import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sparkles, Loader2, Play, Pause, Download, Volume2, RotateCcw, Type, Wand2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PublishPanel from "@/components/PublishPanel";

// ─── Types & Constants ─────────────────────────────────────────────────────

interface Segment {
  text: string;
  voiceover: string;
  duration: number;
}

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

  // Script generation
  const [prompt, setPrompt] = useState("");
  const [segmentCount, setSegmentCount] = useState(8);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [scriptTitle, setScriptTitle] = useState("");

  // Style
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
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [gradientPhase, setGradientPhase] = useState(0);
  const playStartRef = useRef(0);

  const ratio = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];

  // Compute cumulative timing from segments (memoized to prevent effect restarts)
  const segmentTimings = useMemo(() => segments.map((seg, i) => {
    const startTime = segments.slice(0, i).reduce((sum, s) => sum + s.duration, 0);
    return { ...seg, startTime, words: seg.text.trim().split(/\s+/).filter(Boolean) };
  }), [segments]);
  const totalScriptDuration = useMemo(() => segments.reduce((sum, s) => sum + s.duration, 0), [segments]);
  const fullVoiceover = useMemo(() => segments.map(s => s.voiceover).join(". "), [segments]);

  // ─── Script Generation ──────────────────────────────────────────────────

  const handleGenerateScript = async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a topic", description: "Describe what the video should be about.", variant: "destructive" });
      return;
    }
    setIsGeneratingScript(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-word-highlight-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ prompt: prompt.trim(), segmentCount }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }
      const data = await resp.json();
      setSegments(data.segments || []);
      setScriptTitle(data.title || "");
      if (data.gradient) setGradient(data.gradient);
      setAudioBlob(null);
      setAudioDuration(0);
      toast({ title: "Script generated!", description: `${data.segments?.length || 0} segments created.` });
    } catch (e) {
      toast({ title: "Script generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // ─── Audio Generation ───────────────────────────────────────────────────

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
          setTimeout(() => { resolve(totalScriptDuration); URL.revokeObjectURL(url); }, 5000);
        }
      });
      audio.addEventListener("error", () => { resolve(totalScriptDuration); URL.revokeObjectURL(url); });
    });

  const handleGenerateAudio = async () => {
    if (segments.length === 0) {
      toast({ title: "No script", description: "Generate a script first.", variant: "destructive" });
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
          body: JSON.stringify({ text: fullVoiceover, voiceId }),
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
      toast({ title: "Voiceover generated!", description: `${dur.toFixed(1)}s audio ready.` });
    } catch (e) {
      toast({ title: "Audio generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // ─── Find current segment & word from elapsed time ──────────────────────

  const getSegmentAndWord = useCallback((elapsed: number, duration: number) => {
    if (segmentTimings.length === 0) return { segmentIndex: 0, wordIndex: 0, wordProgress: 0 };

    // Scale elapsed to match segment durations proportionally against actual audio duration
    const scale = duration > 0 ? totalScriptDuration / duration : 1;
    const scaledElapsed = elapsed * scale;

    let segmentIndex = 0;
    for (let i = 0; i < segmentTimings.length; i++) {
      const seg = segmentTimings[i];
      if (scaledElapsed >= seg.startTime && scaledElapsed < seg.startTime + seg.duration) {
        segmentIndex = i;
        break;
      }
      if (i === segmentTimings.length - 1) segmentIndex = i;
    }

    const seg = segmentTimings[segmentIndex];
    const timeInSegment = scaledElapsed - seg.startTime;
    const wordCount = seg.words.length;
    const wordDuration = seg.duration / Math.max(wordCount, 1);
    const wordIndex = Math.min(Math.floor(timeInSegment / wordDuration), wordCount - 1);
    const wordProgress = (timeInSegment % wordDuration) / wordDuration;

    return { segmentIndex, wordIndex: Math.max(wordIndex, 0), wordProgress };
  }, [segmentTimings, totalScriptDuration]);

  // ─── Canvas Rendering (shows only current segment's words) ──────────────

  const drawFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    segWords: string[],
    currentWordIndex: number,
    wordProgress: number,
    phase: number,
    segIdx: number,
    totalSegs: number,
    elapsedRatio: number,
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

    if (segWords.length === 0) return;

    // ── Segment indicator (top) ───────────────────────────────────────
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `${Math.round(width * 0.022)}px ${opts.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${segIdx + 1} / ${totalSegs}`, width / 2, height * 0.05);

    // ── Word Layout (centered, only current segment) ──────────────────
    const baseFontSize = Math.min(width, height) * 0.08;
    const weight = opts.bold ? "bold" : "normal";
    const maxWidth = width * 0.85;
    const lineHeight = baseFontSize * 1.8;

    ctx.font = `${weight} ${baseFontSize}px ${opts.font}`;
    const spaceWidth = ctx.measureText(" ").width;

    type WordMeta = { word: string; idx: number; x: number; w: number };
    type LineMeta = { words: WordMeta[]; y: number };
    const lines: LineMeta[] = [];
    let curLine: WordMeta[] = [];
    let curW = 0;

    for (let i = 0; i < segWords.length; i++) {
      const word = segWords[i];
      const ww = ctx.measureText(word).width;
      const needed = curLine.length > 0 ? spaceWidth + ww : ww;

      if (curW + needed > maxWidth && curLine.length > 0) {
        lines.push({ words: curLine, y: 0 });
        curLine = [{ word, idx: i, x: 0, w: ww }];
        curW = ww;
      } else {
        curLine.push({ word, idx: i, x: 0, w: ww });
        curW += needed;
      }
    }
    if (curLine.length > 0) lines.push({ words: curLine, y: 0 });

    const totalH = lines.length * lineHeight;
    const startY = height / 2 - totalH / 2 + lineHeight / 2;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      line.y = startY + li * lineHeight;
      let lw = 0;
      for (const wm of line.words) lw += wm.w;
      lw += (line.words.length - 1) * spaceWidth;
      let cx = (width - lw) / 2;
      for (const wm of line.words) {
        wm.x = cx;
        cx += wm.w + spaceWidth;
      }
    }

    // ── Draw Words ────────────────────────────────────────────────────
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (const line of lines) {
      for (const wm of line.words) {
        const isHighlighted = wm.idx < currentWordIndex;
        const isCurrent = wm.idx === currentWordIndex;

        let scale = 1;
        let color = opts.baseColor;
        let alpha = 0.45;

        if (isHighlighted) {
          alpha = 0.65;
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
            const growT = Math.min(wordProgress * 3, 1);
            const eased = 1 - Math.pow(1 - growT, 3);
            scale = 1 + (opts.enlargeScale - 1) * eased;
          }
        }

        const fontSize = baseFontSize * scale;
        ctx.font = `${weight} ${fontSize}px ${opts.font}`;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = isCurrent ? opts.highlightColor : "rgba(0,0,0,0.4)";
        ctx.shadowBlur = isCurrent ? 30 : 10;
        ctx.shadowOffsetY = 2;

        const scaledWidth = ctx.measureText(wm.word).width;
        const origCenter = wm.x + wm.w / 2;
        const drawX = origCenter - scaledWidth / 2;

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
    const barH = 6;
    const barX = (width - barW) / 2;

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * elapsedRatio, barH, barH / 2);
    ctx.fill();
  }, []);

  // ─── Static preview ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || segmentTimings.length === 0) return;

    const previewScale = 0.3;
    canvas.width = ratio.width * previewScale;
    canvas.height = ratio.height * previewScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(previewScale, previewScale);
    const virtualCanvas = { width: ratio.width, height: ratio.height } as HTMLCanvasElement;
    Object.defineProperty(ctx, "canvas", { value: virtualCanvas, configurable: true });

    // Show first segment with a simulated highlight
    const seg = segmentTimings[0];
    const previewWordIdx = Math.min(Math.floor(seg.words.length * 0.4), seg.words.length - 1);
    drawFrame(ctx, seg.words, Math.max(previewWordIdx, 0), 0.5, gradientPhase, 0, segments.length, 0.15, {
      gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale,
    });
    ctx.restore();
  }, [segments, gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale, ratio, gradientPhase, drawFrame, segmentTimings]);

  // ─── Playback loop ─────────────────────────────────────────────────────

  const playbackTimeRef = useRef(0);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isPlaying || !audioBlob || segmentTimings.length === 0) return;

    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    playStartRef.current = Date.now();
    let phase = 0;
    let stopped = false;

    audio.play().catch(() => {});

    audio.addEventListener("ended", () => {
      if (!stopped) {
        stopped = true;
        setIsPlaying(false);
        playbackTimeRef.current = 0;
        setPlaybackTime(0);
      }
    });

    const animate = () => {
      if (stopped) return;
      const elapsed = (Date.now() - playStartRef.current) / 1000;
      phase += 1;
      playbackTimeRef.current = elapsed;

      // Update time display directly (no setState to avoid re-renders)
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${elapsed.toFixed(1)}s / ${audioDuration.toFixed(1)}s`;
      }

      const { segmentIndex, wordIndex, wordProgress } = getSegmentAndWord(elapsed, audioDuration);
      const seg = segmentTimings[segmentIndex];

      const canvas = canvasRef.current;
      if (canvas && seg) {
        const previewScale = 0.3;
        canvas.width = ratio.width * previewScale;
        canvas.height = ratio.height * previewScale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(previewScale, previewScale);
          const virtualCanvas = { width: ratio.width, height: ratio.height } as HTMLCanvasElement;
          Object.defineProperty(ctx, "canvas", { value: virtualCanvas, configurable: true });
          drawFrame(ctx, seg.words, wordIndex, wordProgress, phase, segmentIndex, segments.length, elapsed / audioDuration, {
            gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale,
          });
          ctx.restore();
        }
      }

      if (elapsed < audioDuration) {
        animationRef.current = requestAnimationFrame(animate);
      } else if (!stopped) {
        stopped = true;
        setIsPlaying(false);
        playbackTimeRef.current = 0;
        setPlaybackTime(0);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      stopped = true;
      cancelAnimationFrame(animationRef.current);
      audio.pause();
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  // Only re-run when isPlaying or audioBlob/segments change, NOT on style changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, audioBlob, audioDuration, segmentTimings]);

  // ─── Export ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!audioBlob || segments.length === 0) return;
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
      stream.addTrack(destination.stream.getAudioTracks()[0]);

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
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `word-highlight-${Date.now()}.webm`;
        a.click();

        // Upload to storage for publishing
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: memberships } = await supabase.from("organization_members").select("org_id").eq("user_id", user!.id);
          if (memberships?.length) {
            const filePath = `${memberships[0].org_id}/${crypto.randomUUID()}.webm`;
            const { error: uploadErr } = await supabase.storage.from("post-media").upload(filePath, blob, { contentType: "video/webm", upsert: false });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(filePath);
              setExportedVideoUrl(urlData.publicUrl);
            }
          }
        } catch {}

        URL.revokeObjectURL(url);
        setIsRecording(false);
        toast({ title: "Video exported!", description: "Ready to publish to social media." });
      };
      mediaRecorder.start();

      let phase = 0;
      const startTime = Date.now();

      while ((Date.now() - startTime) / 1000 < audioDuration + 0.5) {
        const elapsed = (Date.now() - startTime) / 1000;
        phase += 1;

        const { segmentIndex, wordIndex, wordProgress } = getSegmentAndWord(elapsed, audioDuration);
        const seg = segmentTimings[segmentIndex];

        if (seg) {
          drawFrame(offCtx, seg.words, wordIndex, wordProgress, phase, segmentIndex, segments.length, elapsed / audioDuration, {
            gradient, font, bold, baseColor, highlightColor, highlightStyle, enlargeScale,
          });
        }
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

          {/* Step 1: Script Generation */}
          <div className="space-y-3 border border-border rounded-lg p-3">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Step 1: Generate Script
            </Label>
            <Input
              placeholder="E.g. 5 tips for morning productivity…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGeneratingScript}
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Segments</Label>
                <Slider
                  value={[segmentCount]}
                  min={4} max={15} step={1}
                  onValueChange={([v]) => setSegmentCount(v)}
                  className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground w-4">{segmentCount}</span>
              </div>
              <Button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || !prompt.trim()}
                size="sm"
                className="gap-1.5"
              >
                {isGeneratingScript ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Generate</>
                )}
              </Button>
            </div>
          </div>

          {/* Generated Script */}
          {segments.length > 0 && (
            <div className="space-y-2 border border-border rounded-lg p-3">
              <Label className="text-xs font-medium">
                Script: {scriptTitle} ({segments.length} segments, ~{totalScriptDuration.toFixed(1)}s)
              </Label>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">
                      {segmentTimings[i]?.startTime.toFixed(1)}s
                    </Badge>
                    <Textarea
                      value={seg.text}
                      onChange={(e) => {
                        const updated = [...segments];
                        updated[i] = { ...updated[i], text: e.target.value, voiceover: e.target.value };
                        setSegments(updated);
                        setAudioBlob(null);
                      }}
                      className="min-h-[32px] text-xs p-1.5 resize-none"
                      rows={1}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        value={seg.duration}
                        onChange={(e) => {
                          const updated = [...segments];
                          updated[i] = { ...updated[i], duration: parseFloat(e.target.value) || 2 };
                          setSegments(updated);
                        }}
                        className="w-14 h-7 text-[10px] p-1"
                        step={0.5}
                        min={1}
                        max={6}
                      />
                      <span className="text-[9px] text-muted-foreground">s</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Format / Voice */}
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
                <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} className="w-6 h-6 rounded border border-border cursor-pointer" />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px]">Highlight</Label>
                <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="w-6 h-6 rounded border border-border cursor-pointer" />
              </div>
            </div>
          </div>

          {/* Step 2: Generate Audio */}
          <div className="space-y-2 border border-border rounded-lg p-3">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5" /> Step 2: Generate Voiceover
            </Label>
            <Button
              onClick={handleGenerateAudio}
              disabled={isGeneratingAudio || segments.length === 0}
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
                <Badge variant="secondary" className="text-[10px]">{audioDuration.toFixed(1)}s audio</Badge>
                <Badge variant="outline" className="text-[10px]">{segments.length} segments</Badge>
              </div>
            )}
          </div>

          {/* Step 3: Export */}
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
        </CardContent>
      </Card>

      {/* Right: Preview */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[400px]">
          {segments.length > 0 ? (
            <>
              <div className="relative rounded-lg overflow-hidden shadow-2xl border border-border" style={{ width: previewWidth, maxWidth: "100%" }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>

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
                   <span ref={timeDisplayRef} className="text-xs text-muted-foreground">
                     {isPlaying ? `0.0s / ${audioDuration.toFixed(1)}s` : "Ready to play"}
                   </span>
                  {!isPlaying && playbackTime > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setPlaybackTime(0)} className="gap-1 text-xs">
                      <RotateCcw className="h-3 w-3" /> Reset
                    </Button>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-3 text-center max-w-[300px]">
                Each segment shows only its words — highlighted one by one as the voiceover plays.
              </p>
            </>
          ) : (
            <div className="text-center text-muted-foreground">
              <Type className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-medium">Word Highlight Preview</p>
              <p className="text-sm mt-1">Generate a script to see the preview</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
