import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sparkles, Loader2, Play, Pause, Download, Film,
  ChevronLeft, ChevronRight, RotateCcw, Volume2, AudioWaveform,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Slide {
  text: string;
  voiceover: string;
  duration: number;
}

interface VideoScript {
  title: string;
  gradient: string;
  slides: Slide[];
}

const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16 Vertical (Reels)", width: 1080, height: 1920 },
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
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)",
];

export default function VideoCreator() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Input state
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [voiceId, setVoiceId] = useState(VOICES[0].value);
  const [slideCount, setSlideCount] = useState("5");

  // Script state
  const [script, setScript] = useState<VideoScript | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Audio state
  const [audioBlobs, setAudioBlobs] = useState<Map<number, Blob>>(new Map());
  const [audioDurations, setAudioDurations] = useState<Map<number, number>>(new Map());
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  // Preview state
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [textOpacity, setTextOpacity] = useState(1);
  const [gradientPhase, setGradientPhase] = useState(0);
  const [showWaveform, setShowWaveform] = useState(false);
  const [waveformStyle, setWaveformStyle] = useState<"bars" | "circular" | "line">("bars");
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0-1 progress within current slide
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playbackAudioCtxRef = useRef<AudioContext | null>(null);

  // Recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  const ratio = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];

  // Measure actual duration of an audio blob
  const getAudioBlobDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => {
        // Some browsers return Infinity for streaming audio, handle that
        if (isFinite(audio.duration)) {
          resolve(audio.duration);
        } else {
          // Fallback: listen for durationchange
          audio.addEventListener("durationchange", () => {
            if (isFinite(audio.duration)) {
              resolve(audio.duration);
              URL.revokeObjectURL(url);
            }
          });
          // If still can't get it, use a reasonable default after timeout
          setTimeout(() => resolve(3), 5000);
        }
        URL.revokeObjectURL(url);
      });
      audio.addEventListener("error", () => {
        resolve(3); // fallback
        URL.revokeObjectURL(url);
      });
    });
  };

  // Get effective slide duration: use audio duration if available, otherwise fallback to script duration + padding
  const getSlideDuration = useCallback((slideIndex: number): number => {
    const audioDur = audioDurations.get(slideIndex);
    const scriptDur = script?.slides[slideIndex]?.duration || 3;
    if (audioDur && audioDur > 0) {
      // Use audio duration + 0.5s padding for breathing room
      return Math.max(audioDur + 0.5, scriptDur);
    }
    return scriptDur;
  }, [audioDurations, script]);

  // Canvas rendering
  const drawFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    slide: Slide,
    phase: number,
    opacity: number,
    waveform?: Float32Array | null,
    progress?: number,
    renderWaveform?: boolean,
  ) => {
    const { width, height } = ctx.canvas;

    // Animated gradient background
    const angle = 135 + Math.sin(phase * 0.02) * 30;
    const rad = (angle * Math.PI) / 180;
    const x1 = width / 2 - Math.cos(rad) * width;
    const y1 = height / 2 - Math.sin(rad) * height;
    const x2 = width / 2 + Math.cos(rad) * width;
    const y2 = height / 2 + Math.sin(rad) * height;

    // Parse gradient colors from script
    const gradientStr = script?.gradient || GRADIENT_PRESETS[0];
    const colorMatches = gradientStr.match(/#[0-9a-fA-F]{6}/g) || ["#667eea", "#764ba2"];
    
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    
    const hueShift = Math.sin(phase * 0.01) * 0.1;
    gradient.addColorStop(0, colorMatches[0]);
    gradient.addColorStop(0.5 + hueShift, colorMatches[1] || colorMatches[0]);
    if (colorMatches[2]) gradient.addColorStop(1, colorMatches[2]);
    else gradient.addColorStop(1, colorMatches[0]);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Animated particles/circles
    for (let i = 0; i < 6; i++) {
      const x = (width * (i + 1)) / 7 + Math.sin(phase * 0.015 + i) * 40;
      const y = (height * (i + 1)) / 7 + Math.cos(phase * 0.02 + i * 2) * 40;
      const r = 30 + Math.sin(phase * 0.03 + i) * 15;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.sin(phase * 0.02 + i) * 0.03})`;
      ctx.fill();
    }

    // Text rendering
    ctx.globalAlpha = opacity;
    const text = slide.text;
    const fontSize = Math.min(width, height) * 0.06;
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Word wrap
    const maxWidth = width * 0.8;
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = height / 2 - totalHeight / 2 + lineHeight / 2;

    ctx.fillStyle = "#ffffff";
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + i * lineHeight);
    });

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Waveform visualizer
    if (renderWaveform && waveform && waveform.length > 0) {
      const barCount = 40;
      const barWidth = (width * 0.6) / barCount;
      const barGap = barWidth * 0.3;
      const waveformY = height * 0.78;
      const maxBarHeight = height * 0.08;
      const waveformStartX = width * 0.2;

      ctx.globalAlpha = 0.85;

      for (let i = 0; i < barCount; i++) {
        // Sample from the waveform data
        const dataIndex = Math.floor((i / barCount) * waveform.length);
        // Normalize: waveform values are typically -1 to 1 or 0-255 depending on type
        const value = Math.abs(waveform[dataIndex] || 0);
        const normalizedValue = Math.min(value / 128, 1); // For byte frequency data (0-255)
        const barHeight = Math.max(2, normalizedValue * maxBarHeight);

        const x = waveformStartX + i * (barWidth + barGap);

        // Color: bars before progress are brighter, after are dimmer
        const progressX = (progress || 0);
        const barProgress = i / barCount;
        
        if (barProgress <= progressX) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        }

        // Rounded bars
        const radius = Math.min(barWidth / 2, 3);
        const bx = x;
        const by = waveformY - barHeight / 2;
        const bw = barWidth;
        const bh = barHeight;
        
        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + bw - radius, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
        ctx.lineTo(bx + bw, by + bh - radius);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
        ctx.lineTo(bx + radius, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }
  }, [script]);

  // Draw current frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !script) return;

    const previewScale = 0.3;
    canvas.width = ratio.width * previewScale;
    canvas.height = ratio.height * previewScale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(previewScale, previewScale);
    const virtualCanvas = { width: ratio.width, height: ratio.height } as HTMLCanvasElement;
    Object.defineProperty(ctx, 'canvas', { value: virtualCanvas, configurable: true });
    drawFrame(ctx, script.slides[currentSlide], gradientPhase, textOpacity, waveformData, playbackProgress, showWaveform);
    ctx.restore();
  }, [script, currentSlide, gradientPhase, textOpacity, drawFrame, ratio, waveformData, playbackProgress, showWaveform]);

  // Animation loop for preview
  useEffect(() => {
    if (!isPlaying || !script) return;

    let slideStartTime = Date.now();
    let slideIndex = currentSlide;
    let phase = gradientPhase;

    // Set up audio analyser for waveform visualization
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;

    const setupAnalyser = () => {
      if (!showWaveform) return;
      try {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        playbackAudioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
      } catch { /* ignore */ }
    };

    setupAnalyser();

    const playSlideAudio = (index: number) => {
      const audioBlob = audioBlobs.get(index);
      if (!audioBlob) return;

      const url = URL.createObjectURL(audioBlob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;

      // Connect to analyser if waveform is enabled
      if (showWaveform && audioCtx && analyser) {
        try {
          const source = audioCtx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch { /* already connected or error */ }
      }

      audio.play().catch(() => {});
    };

    // Play first slide audio
    playSlideAudio(slideIndex);

    const animate = () => {
      const elapsed = (Date.now() - slideStartTime) / 1000;
      const slideDuration = getSlideDuration(slideIndex);
      phase += 1;

      // Progress within slide
      const progress = Math.min(elapsed / slideDuration, 1);
      setPlaybackProgress(progress);

      // Read frequency data for waveform
      if (showWaveform && analyser && frequencyData) {
        analyser.getByteFrequencyData(frequencyData);
        // Convert to Float32Array for drawFrame
        const floatData = new Float32Array(frequencyData.length);
        for (let i = 0; i < frequencyData.length; i++) {
          floatData[i] = frequencyData[i];
        }
        setWaveformData(floatData);
      }

      // Text fade in/out
      let opacity = 1;
      const fadeTime = 0.3;
      if (elapsed < fadeTime) opacity = elapsed / fadeTime;
      else if (elapsed > slideDuration - fadeTime) opacity = Math.max(0, (slideDuration - elapsed) / fadeTime);

      setGradientPhase(phase);
      setTextOpacity(opacity);

      // Move to next slide when duration is reached
      if (elapsed >= slideDuration) {
        const nextIndex = slideIndex + 1;
        if (nextIndex >= script.slides.length) {
          setIsPlaying(false);
          setCurrentSlide(0);
          setWaveformData(null);
          setPlaybackProgress(0);
          return;
        }
        slideIndex = nextIndex;
        setCurrentSlide(nextIndex);
        slideStartTime = Date.now();
        playSlideAudio(nextIndex);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        playbackAudioCtxRef.current = null;
        analyserRef.current = null;
      }
      setWaveformData(null);
    };
  }, [isPlaying, getSlideDuration, showWaveform]);

  const handleGenerateScript = async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a topic", description: "Describe what the video should be about.", variant: "destructive" });
      return;
    }

    setIsGeneratingScript(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-video-script", {
        body: { prompt: prompt.trim(), slideCount: parseInt(slideCount) },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setScript(data);
      setCurrentSlide(0);
      setAudioBlobs(new Map());
      setAudioDurations(new Map());
      toast({ title: "Script generated!", description: `${data.slides.length} slides created.` });
    } catch (e) {
      toast({ title: "Generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!script) return;
    setIsGeneratingAudio(true);
    setAudioProgress(0);
    const newBlobs = new Map<number, Blob>();
    const newDurations = new Map<number, number>();

    try {
      for (let i = 0; i < script.slides.length; i++) {
        setAudioProgress(i + 1);
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              text: script.slides[i].voiceover,
              voiceId,
            }),
          }
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "TTS failed" }));
          throw new Error(err.error || `TTS failed for slide ${i + 1}`);
        }

        const blob = await response.blob();
        newBlobs.set(i, blob);

        // Measure actual audio duration
        const duration = await getAudioBlobDuration(blob);
        newDurations.set(i, duration);
      }

      setAudioBlobs(newBlobs);
      setAudioDurations(newDurations);
      toast({ title: "Audio generated!", description: `${script.slides.length} voiceovers ready. Slide durations synced to audio.` });
    } catch (e) {
      toast({ title: "Audio generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleExportVideo = async () => {
    if (!script || !canvasRef.current) return;

    setIsRecording(true);
    toast({ title: "Recording video…", description: "Please wait while the video is being recorded." });

    try {
      // Create a full-resolution offscreen canvas
      const offscreen = document.createElement("canvas");
      offscreen.width = ratio.width;
      offscreen.height = ratio.height;
      const offCtx = offscreen.getContext("2d")!;

      const stream = offscreen.captureStream(30);

      // Mix audio if available
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      stream.addTrack(destination.stream.getAudioTracks()[0] || stream.getVideoTracks()[0]);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recordedChunks.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${script.title || "video"}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        toast({ title: "Video exported!", description: "Your video has been downloaded." });
      };

      mediaRecorder.start();

      // Record each slide
      let phase = 0;
      for (let s = 0; s < script.slides.length; s++) {
        const slide = script.slides[s];
        const durationMs = getSlideDuration(s) * 1000;
        const startTime = Date.now();

        // Play audio for this slide
        const audioBlob = audioBlobs.get(s);
        if (audioBlob) {
          const arrayBuffer = await audioBlob.arrayBuffer();
          try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(destination);
            source.start();
          } catch { /* audio decode error, skip */ }
        }

        while (Date.now() - startTime < durationMs) {
          const elapsed = (Date.now() - startTime) / 1000;
          phase += 1;

          const slideDurSec = durationMs / 1000;
          let opacity = 1;
          if (elapsed < 0.3) opacity = elapsed / 0.3;
          else if (elapsed > slideDurSec - 0.3) opacity = Math.max(0, (slideDurSec - elapsed) / 0.3);

          const exportProgress = elapsed / slideDurSec;
          // Generate fake waveform bars for export if waveform enabled
          const exportWaveform = showWaveform ? new Float32Array(64).map(() => Math.random() * 180 + 20) : null;
          drawFrame(offCtx, slide, phase, opacity, exportWaveform, exportProgress, showWaveform);
          await new Promise(r => setTimeout(r, 33)); // ~30fps
        }
      }

      mediaRecorder.stop();
      audioContext.close();
    } catch (e) {
      setIsRecording(false);
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleSlideChange = (index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, (script?.slides.length || 1) - 1)));
    setTextOpacity(1);
  };

  const handleEditSlideText = (index: number, text: string) => {
    if (!script) return;
    const updated = { ...script, slides: script.slides.map((s, i) => i === index ? { ...s, text } : s) };
    setScript(updated);
  };

  const handleEditSlideVoiceover = (index: number, voiceover: string) => {
    if (!script) return;
    const updated = { ...script, slides: script.slides.map((s, i) => i === index ? { ...s, voiceover } : s) };
    setScript(updated);
  };

  const handleGradientChange = (gradient: string) => {
    if (!script) return;
    setScript({ ...script, gradient });
  };

  // Preview canvas dimensions
  const previewMaxHeight = 480;
  const previewWidth = (ratio.width / ratio.height) * previewMaxHeight;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Controls */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Film className="h-5 w-5" />
            Video Reel Creator
          </h3>

          {!script ? (
            <>
              <div className="space-y-2">
                <Label>Topic / Prompt</Label>
                <Textarea
                  placeholder="e.g. '5 tips for better productivity' or 'Why Bitcoin is the future of money'"
                  className="min-h-[100px] resize-none"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGeneratingScript}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Slides</Label>
                  <Select value={slideCount} onValueChange={setSlideCount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["3", "5", "7", "10"].map(n => (
                        <SelectItem key={n} value={n}>{n} slides</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VOICES.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleGenerateScript} disabled={isGeneratingScript} className="w-full gap-2">
                {isGeneratingScript ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating Script…</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Generate Video Script</>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Script editor */}
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{script.title}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setScript(null); setAudioBlobs(new Map()); }}
                  className="gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> New
                </Button>
              </div>

              {/* Gradient selector */}
              <div className="space-y-2">
                <Label className="text-xs">Background</Label>
                <div className="flex gap-2 flex-wrap">
                  {GRADIENT_PRESETS.map((g, i) => (
                    <button
                      key={i}
                      className={`w-8 h-8 rounded-md border-2 transition-all ${
                        script.gradient === g ? "border-primary scale-110" : "border-transparent"
                      }`}
                      style={{ background: g }}
                      onClick={() => handleGradientChange(g)}
                    />
                  ))}
                </div>
              </div>

              {/* Slide editor */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {script.slides.map((slide, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      currentSlide === i ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onClick={() => handleSlideChange(i)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-[10px]">Slide {i + 1}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {audioDurations.has(i) ? `${getSlideDuration(i).toFixed(1)}s (audio: ${audioDurations.get(i)!.toFixed(1)}s)` : `${slide.duration}s`}
                      </span>
                      {audioBlobs.has(i) && <Volume2 className="h-3 w-3 text-green-600" />}
                    </div>
                    <Input
                      value={slide.text}
                      onChange={(e) => handleEditSlideText(i, e.target.value)}
                      className="text-xs h-7 mb-1"
                      placeholder="On-screen text"
                    />
                    <Input
                      value={slide.voiceover}
                      onChange={(e) => handleEditSlideVoiceover(i, e.target.value)}
                      className="text-xs h-7 text-muted-foreground"
                      placeholder="Voiceover text"
                    />
                  </div>
                ))}
              </div>

              {/* Voice selector */}
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

              {/* Waveform toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AudioWaveform className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-xs">Waveform Visualizer</Label>
                </div>
                <Switch
                  checked={showWaveform}
                  onCheckedChange={setShowWaveform}
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleGenerateAudio}
                  disabled={isGeneratingAudio}
                  variant="secondary"
                  className="w-full gap-2"
                >
                  {isGeneratingAudio ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating Audio ({audioProgress}/{script.slides.length})…</>
                  ) : (
                    <><Volume2 className="h-4 w-4" /> {audioBlobs.size > 0 ? "Regenerate" : "Generate"} Voiceover</>
                  )}
                </Button>

                <Button
                  onClick={handleExportVideo}
                  disabled={isRecording}
                  className="w-full gap-2"
                >
                  {isRecording ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</>
                  ) : (
                    <><Download className="h-4 w-4" /> Export Video</>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Right: Preview */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[400px]">
          {script ? (
            <>
              <div className="relative rounded-lg overflow-hidden shadow-2xl border border-border" style={{ width: previewWidth, maxWidth: "100%" }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>

              {/* Playback controls */}
              <div className="flex items-center gap-3 mt-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleSlideChange(currentSlide - 1)}
                  disabled={currentSlide === 0 || isPlaying}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                    } else {
                      setCurrentSlide(0);
                      setIsPlaying(true);
                    }
                  }}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleSlideChange(currentSlide + 1)}
                  disabled={currentSlide >= script.slides.length - 1 || isPlaying}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <span className="text-xs text-muted-foreground ml-2">
                  {currentSlide + 1} / {script.slides.length}
                </span>
              </div>

              <p className="text-xs text-muted-foreground mt-2 text-center max-w-[280px]">
                {script.slides[currentSlide]?.voiceover}
              </p>
            </>
          ) : (
            <div className="text-center text-muted-foreground">
              <Film className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-medium">Video Preview</p>
              <p className="text-sm mt-1">Generate a script to preview your video reel</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
