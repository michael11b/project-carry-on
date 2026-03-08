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
  ImagePlus, VideoIcon, X, Type, Music, Upload, Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlideBg {
  type: "gradient" | "image" | "video";
  gradient: string;
  mediaUrl?: string | null;
}

interface Slide {
  text: string;
  voiceover: string;
  duration: number;
  bg?: SlideBg;
}

interface VideoScript {
  title: string;
  gradient: string;
  slides: Slide[];
}

interface TextStyle {
  font: string;
  sizeMultiplier: number;
  position: "center" | "top" | "bottom";
  animation: "fade" | "typewriter" | "scale" | "slide-up";
  bold: boolean;
  color: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

const FONT_OPTIONS = [
  { value: "system-ui, -apple-system, sans-serif", label: "System" },
  { value: "'Georgia', serif", label: "Georgia" },
  { value: "'Courier New', monospace", label: "Mono" },
  { value: "'Impact', sans-serif", label: "Impact" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
  { value: "'Comic Sans MS', cursive", label: "Comic" },
];

const TEXT_POSITIONS = [
  { value: "center", label: "Center" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

const TEXT_ANIMATIONS = [
  { value: "fade", label: "Fade" },
  { value: "typewriter", label: "Typewriter" },
  { value: "scale", label: "Scale Up" },
  { value: "slide-up", label: "Slide Up" },
];

// ─── Component ───────────────────────────────────────────────────────────────

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
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playbackAudioCtxRef = useRef<AudioContext | null>(null);

  // Per-slide background media (loaded elements keyed by slide index)
  const slideBgImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const slideBgVideosRef = useRef<Map<number, HTMLVideoElement>>(new Map());
  const slideBgFileInputRef = useRef<HTMLInputElement>(null);
  const [editingBgSlide, setEditingBgSlide] = useState<number | null>(null);
  // Force re-render trigger when bg media loads
  const [bgLoadTick, setBgLoadTick] = useState(0);

  // Text styling state
  const [textStyle, setTextStyle] = useState<TextStyle>({
    font: FONT_OPTIONS[0].value,
    sizeMultiplier: 1,
    position: "center",
    animation: "fade",
    bold: true,
    color: "#ffffff",
  });

  // Recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  const ratio = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0];

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const getAudioBlobDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration)) {
          resolve(audio.duration);
        } else {
          audio.addEventListener("durationchange", () => {
            if (isFinite(audio.duration)) {
              resolve(audio.duration);
              URL.revokeObjectURL(url);
            }
          });
          setTimeout(() => resolve(3), 5000);
        }
        URL.revokeObjectURL(url);
      });
      audio.addEventListener("error", () => {
        resolve(3);
        URL.revokeObjectURL(url);
      });
    });
  };

  const getSlideDuration = useCallback((slideIndex: number): number => {
    const audioDur = audioDurations.get(slideIndex);
    const scriptDur = script?.slides[slideIndex]?.duration || 3;
    if (audioDur && audioDur > 0) {
      return Math.max(audioDur + 0.5, scriptDur);
    }
    return scriptDur;
  }, [audioDurations, script]);

  /** Get the effective background for a slide (falls back to script-level gradient) */
  const getSlideBg = useCallback((slide: Slide, scriptGradient: string): SlideBg => {
    if (slide.bg) return slide.bg;
    return { type: "gradient", gradient: scriptGradient };
  }, []);

  // ─── Canvas Rendering ────────────────────────────────────────────────────

  const drawFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    slide: Slide,
    phase: number,
    opacity: number,
    waveform: Float32Array | null | undefined,
    progress: number | undefined,
    renderWaveform: boolean | undefined,
    waveStyle: "bars" | "circular" | "line" | undefined,
    bgImage: HTMLImageElement | null | undefined,
    bgVideo: HTMLVideoElement | null | undefined,
    ts: TextStyle | undefined,
    slideGradient: string,
  ) => {
    const { width, height } = ctx.canvas;

    // ── Background ──────────────────────────────────────────────────────
    let drewCustomBg = false;

    if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
      const imgR = bgImage.naturalWidth / bgImage.naturalHeight;
      const canR = width / height;
      let sx = 0, sy = 0, sw = bgImage.naturalWidth, sh = bgImage.naturalHeight;
      if (imgR > canR) { sw = bgImage.naturalHeight * canR; sx = (bgImage.naturalWidth - sw) / 2; }
      else { sh = bgImage.naturalWidth / canR; sy = (bgImage.naturalHeight - sh) / 2; }
      ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, width, height);
      drewCustomBg = true;
    } else if (bgVideo && bgVideo.readyState >= 2) {
      const vidR = bgVideo.videoWidth / bgVideo.videoHeight;
      const canR = width / height;
      let sx = 0, sy = 0, sw = bgVideo.videoWidth, sh = bgVideo.videoHeight;
      if (vidR > canR) { sw = bgVideo.videoHeight * canR; sx = (bgVideo.videoWidth - sw) / 2; }
      else { sh = bgVideo.videoWidth / canR; sy = (bgVideo.videoHeight - sh) / 2; }
      ctx.drawImage(bgVideo, sx, sy, sw, sh, 0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, width, height);
      drewCustomBg = true;
    }

    if (!drewCustomBg) {
      const angle = 135 + Math.sin(phase * 0.02) * 30;
      const rad = (angle * Math.PI) / 180;
      const x1 = width / 2 - Math.cos(rad) * width;
      const y1 = height / 2 - Math.sin(rad) * height;
      const x2 = width / 2 + Math.cos(rad) * width;
      const y2 = height / 2 + Math.sin(rad) * height;

      const colorMatches = slideGradient.match(/#[0-9a-fA-F]{6}/g) || ["#667eea", "#764ba2"];
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      const hueShift = Math.sin(phase * 0.01) * 0.1;
      gradient.addColorStop(0, colorMatches[0]);
      gradient.addColorStop(0.5 + hueShift, colorMatches[1] || colorMatches[0]);
      gradient.addColorStop(1, colorMatches[2] || colorMatches[0]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 6; i++) {
        const x = (width * (i + 1)) / 7 + Math.sin(phase * 0.015 + i) * 40;
        const y = (height * (i + 1)) / 7 + Math.cos(phase * 0.02 + i * 2) * 40;
        const r = 30 + Math.sin(phase * 0.03 + i) * 15;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.sin(phase * 0.02 + i) * 0.03})`;
        ctx.fill();
      }
    }

    // ── Text ────────────────────────────────────────────────────────────
    const style: TextStyle = ts || {
      font: "system-ui, -apple-system, sans-serif", sizeMultiplier: 1,
      position: "center", animation: "fade", bold: true, color: "#ffffff",
    };
    const text = slide.text;
    const baseFontSize = Math.min(width, height) * 0.06;
    const fontSize = baseFontSize * style.sizeMultiplier;
    const weight = style.bold ? "bold" : "normal";
    ctx.font = `${weight} ${fontSize}px ${style.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    const maxWidth = width * 0.8;
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);

    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    let baseY: number;
    if (style.position === "top") baseY = height * 0.15 + lineHeight / 2;
    else if (style.position === "bottom") baseY = height * 0.7 - totalHeight / 2 + lineHeight / 2;
    else baseY = height / 2 - totalHeight / 2 + lineHeight / 2;

    const slideDur = slide.duration || 3;
    const elapsed = (progress || 0) * slideDur;
    const fadeTime = 0.3;
    let textAlpha = opacity;
    let offsetY = 0;
    let scaleVal = 1;

    if (style.animation === "slide-up") {
      if (elapsed < fadeTime) { const t = elapsed / fadeTime; textAlpha = t; offsetY = (1 - t) * height * 0.05; }
      else if (elapsed > slideDur - fadeTime) { const t = Math.max(0, (slideDur - elapsed) / fadeTime); textAlpha = t; offsetY = -(1 - t) * height * 0.05; }
    } else if (style.animation === "scale") {
      if (elapsed < fadeTime) { const t = elapsed / fadeTime; textAlpha = t; scaleVal = 0.7 + t * 0.3; }
      else if (elapsed > slideDur - fadeTime) { const t = Math.max(0, (slideDur - elapsed) / fadeTime); textAlpha = t; scaleVal = 0.7 + t * 0.3; }
    } else if (style.animation === "typewriter") {
      const revealProgress = Math.min(elapsed / (slideDur * 0.6), 1);
      const visibleChars = Math.floor(revealProgress * text.length);
      const visibleText = text.substring(0, visibleChars);
      const twWords = visibleText.split(" ");
      const twLines: string[] = [];
      let twCur = "";
      for (const word of twWords) {
        const test = twCur ? `${twCur} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && twCur) { twLines.push(twCur); twCur = word; }
        else twCur = test;
      }
      if (twCur) twLines.push(twCur);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = style.color;
      twLines.forEach((line, i) => ctx.fillText(line, width / 2, baseY + i * lineHeight));
      ctx.globalAlpha = 1;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    if (style.animation !== "typewriter") {
      ctx.save();
      if (scaleVal !== 1) {
        ctx.translate(width / 2, baseY + totalHeight / 2);
        ctx.scale(scaleVal, scaleVal);
        ctx.translate(-(width / 2), -(baseY + totalHeight / 2));
      }
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = style.color;
      lines.forEach((line, i) => ctx.fillText(line, width / 2, baseY + offsetY + i * lineHeight));
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // ── Waveform ────────────────────────────────────────────────────────
    if (renderWaveform && waveform && waveform.length > 0) {
      ctx.globalAlpha = 0.85;
      const effStyle = waveStyle || "bars";

      if (effStyle === "bars") {
        const barCount = 40;
        const barW = (width * 0.6) / barCount;
        const barGap = barW * 0.3;
        const wfY = height * 0.78;
        const maxBarH = height * 0.08;
        const startX = width * 0.2;
        for (let i = 0; i < barCount; i++) {
          const di = Math.floor((i / barCount) * waveform.length);
          const nv = Math.min(Math.abs(waveform[di] || 0) / 128, 1);
          const bh = Math.max(2, nv * maxBarH);
          const x = startX + i * (barW + barGap);
          ctx.fillStyle = (i / barCount) <= (progress || 0) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)";
          const r = Math.min(barW / 2, 3);
          ctx.beginPath();
          ctx.moveTo(x + r, wfY - bh / 2);
          ctx.lineTo(x + barW - r, wfY - bh / 2);
          ctx.quadraticCurveTo(x + barW, wfY - bh / 2, x + barW, wfY - bh / 2 + r);
          ctx.lineTo(x + barW, wfY + bh / 2 - r);
          ctx.quadraticCurveTo(x + barW, wfY + bh / 2, x + barW - r, wfY + bh / 2);
          ctx.lineTo(x + r, wfY + bh / 2);
          ctx.quadraticCurveTo(x, wfY + bh / 2, x, wfY + bh / 2 - r);
          ctx.lineTo(x, wfY - bh / 2 + r);
          ctx.quadraticCurveTo(x, wfY - bh / 2, x + r, wfY - bh / 2);
          ctx.closePath();
          ctx.fill();
        }
      } else if (effStyle === "circular") {
        const cx = width / 2, cy = height * 0.78;
        const baseR = Math.min(width, height) * 0.06;
        const maxExt = Math.min(width, height) * 0.04;
        const segs = 48;
        for (let i = 0; i < segs; i++) {
          const angle = (i / segs) * Math.PI * 2 - Math.PI / 2;
          const di = Math.floor((i / segs) * waveform.length);
          const nv = Math.min(Math.abs(waveform[di] || 0) / 128, 1);
          const ext = nv * maxExt;
          ctx.strokeStyle = (i / segs) <= (progress || 0) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * baseR, cy + Math.sin(angle) * baseR);
          ctx.lineTo(cx + Math.cos(angle) * (baseR + ext), cy + Math.sin(angle) * (baseR + ext));
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (effStyle === "line") {
        const wfY = height * 0.78;
        const sX = width * 0.15, eX = width * 0.85;
        const wW = eX - sX, maxAmp = height * 0.04, pts = 60;
        const pEnd = Math.floor(pts * (progress || 0));
        ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        for (let i = 0; i <= pEnd; i++) {
          const x = sX + (i / pts) * wW;
          const di = Math.floor((i / pts) * waveform.length);
          const nv = Math.min(Math.abs(waveform[di] || 0) / 128, 1);
          const y = wfY + nv * maxAmp * (i % 2 === 0 ? -1 : 1);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        for (let i = pEnd; i <= pts; i++) {
          const x = sX + (i / pts) * wW;
          const di = Math.floor((i / pts) * waveform.length);
          const nv = Math.min(Math.abs(waveform[di] || 0) / 128, 1);
          const y = wfY + nv * maxAmp * (i % 2 === 0 ? -1 : 1);
          if (i === pEnd) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (progress && progress > 0) {
          const dx = sX + progress * wW;
          const ddi = Math.floor(progress * waveform.length);
          const dv = Math.min(Math.abs(waveform[Math.min(ddi, waveform.length - 1)] || 0) / 128, 1);
          const dy = wfY + dv * maxAmp * (Math.floor(progress * pts) % 2 === 0 ? -1 : 1);
          ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    }
  }, []);

  // ─── Draw current frame effect ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !script) return;

    const previewScale = 0.3;
    canvas.width = ratio.width * previewScale;
    canvas.height = ratio.height * previewScale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const slide = script.slides[currentSlide];
    const bg = getSlideBg(slide, script.gradient);

    ctx.save();
    ctx.scale(previewScale, previewScale);
    const virtualCanvas = { width: ratio.width, height: ratio.height } as HTMLCanvasElement;
    Object.defineProperty(ctx, "canvas", { value: virtualCanvas, configurable: true });
    drawFrame(
      ctx, slide, gradientPhase, textOpacity,
      waveformData, playbackProgress, showWaveform, waveformStyle,
      bg.type === "image" ? slideBgImagesRef.current.get(currentSlide) || null : null,
      bg.type === "video" ? slideBgVideosRef.current.get(currentSlide) || null : null,
      textStyle, bg.gradient,
    );
    ctx.restore();
  }, [script, currentSlide, gradientPhase, textOpacity, drawFrame, ratio, waveformData, playbackProgress, showWaveform, textStyle, bgLoadTick, getSlideBg]);

  // ─── Animation loop ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying || !script) return;

    let slideStartTime = Date.now();
    let slideIndex = currentSlide;
    let phase = gradientPhase;

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
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      if (showWaveform && audioCtx && analyser) {
        try {
          const source = audioCtx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch { /* */ }
      }
      audio.play().catch(() => {});
    };

    playSlideAudio(slideIndex);

    const animate = () => {
      const elapsed = (Date.now() - slideStartTime) / 1000;
      const slideDuration = getSlideDuration(slideIndex);
      phase += 1;

      const progress = Math.min(elapsed / slideDuration, 1);
      setPlaybackProgress(progress);

      if (showWaveform && analyser && frequencyData) {
        analyser.getByteFrequencyData(frequencyData);
        const floatData = new Float32Array(frequencyData.length);
        for (let i = 0; i < frequencyData.length; i++) floatData[i] = frequencyData[i];
        setWaveformData(floatData);
      }

      let opacity = 1;
      const fadeTime = 0.3;
      if (elapsed < fadeTime) opacity = elapsed / fadeTime;
      else if (elapsed > slideDuration - fadeTime) opacity = Math.max(0, (slideDuration - elapsed) / fadeTime);

      setGradientPhase(phase);
      setTextOpacity(opacity);

      if (elapsed >= slideDuration) {
        const next = slideIndex + 1;
        if (next >= script.slides.length) {
          setIsPlaying(false);
          setCurrentSlide(0);
          setWaveformData(null);
          setPlaybackProgress(0);
          return;
        }
        slideIndex = next;
        setCurrentSlide(next);
        slideStartTime = Date.now();
        playSlideAudio(next);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audioCtx) { audioCtx.close().catch(() => {}); playbackAudioCtxRef.current = null; analyserRef.current = null; }
      setWaveformData(null);
    };
  }, [isPlaying, getSlideDuration, showWaveform]);

  // ─── Handlers ──────────────────────────────────────────────────────────

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
      // Initialize per-slide bg from script gradient
      const enriched: VideoScript = {
        ...data,
        slides: data.slides.map((s: Slide) => ({
          ...s,
          bg: { type: "gradient" as const, gradient: data.gradient },
        })),
      };
      setScript(enriched);
      setCurrentSlide(0);
      setAudioBlobs(new Map());
      setAudioDurations(new Map());
      slideBgImagesRef.current = new Map();
      slideBgVideosRef.current = new Map();
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
            body: JSON.stringify({ text: script.slides[i].voiceover, voiceId }),
          }
        );
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "TTS failed" }));
          throw new Error(err.error || `TTS failed for slide ${i + 1}`);
        }
        const blob = await response.blob();
        newBlobs.set(i, blob);
        const duration = await getAudioBlobDuration(blob);
        newDurations.set(i, duration);
      }
      setAudioBlobs(newBlobs);
      setAudioDurations(newDurations);
      toast({ title: "Audio generated!", description: `${script.slides.length} voiceovers ready.` });
    } catch (e) {
      toast({ title: "Audio generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleExportVideo = async () => {
    if (!script || !canvasRef.current) return;
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

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
      });
      recordedChunks.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${script.title || "video"}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        toast({ title: "Video exported!" });
      };
      mediaRecorder.start();

      // Reset slide bg videos
      slideBgVideosRef.current.forEach((v) => { v.currentTime = 0; v.play().catch(() => {}); });

      let phase = 0;
      for (let s = 0; s < script.slides.length; s++) {
        const slide = script.slides[s];
        const durationMs = getSlideDuration(s) * 1000;
        const startTime = Date.now();
        const bg = getSlideBg(slide, script.gradient);

        const audioBlob = audioBlobs.get(s);
        if (audioBlob) {
          const ab = await audioBlob.arrayBuffer();
          try {
            const buf = await audioContext.decodeAudioData(ab);
            const src = audioContext.createBufferSource();
            src.buffer = buf;
            src.connect(destination);
            src.start();
          } catch { /* */ }
        }

        while (Date.now() - startTime < durationMs) {
          const elapsed = (Date.now() - startTime) / 1000;
          phase += 1;
          const durSec = durationMs / 1000;
          let opacity = 1;
          if (elapsed < 0.3) opacity = elapsed / 0.3;
          else if (elapsed > durSec - 0.3) opacity = Math.max(0, (durSec - elapsed) / 0.3);
          const exportProgress = elapsed / durSec;
          const exportWaveform = showWaveform ? new Float32Array(64).map(() => Math.random() * 180 + 20) : null;
          drawFrame(
            offCtx, slide, phase, opacity, exportWaveform, exportProgress,
            showWaveform, waveformStyle,
            bg.type === "image" ? slideBgImagesRef.current.get(s) || null : null,
            bg.type === "video" ? slideBgVideosRef.current.get(s) || null : null,
            textStyle, bg.gradient,
          );
          await new Promise(r => setTimeout(r, 33));
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
    setScript({ ...script, slides: script.slides.map((s, i) => i === index ? { ...s, text } : s) });
  };

  const handleEditSlideVoiceover = (index: number, voiceover: string) => {
    if (!script) return;
    setScript({ ...script, slides: script.slides.map((s, i) => i === index ? { ...s, voiceover } : s) });
  };

  /** Set a gradient preset for a specific slide */
  const handleSlideGradientChange = (slideIndex: number, gradient: string) => {
    if (!script) return;
    // Clear any media for this slide
    const oldUrl = script.slides[slideIndex]?.bg?.mediaUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    slideBgImagesRef.current.delete(slideIndex);
    const vid = slideBgVideosRef.current.get(slideIndex);
    if (vid) { vid.pause(); slideBgVideosRef.current.delete(slideIndex); }

    setScript({
      ...script,
      slides: script.slides.map((s, i) =>
        i === slideIndex ? { ...s, bg: { type: "gradient", gradient } } : s
      ),
    });
  };

  /** Apply a gradient to ALL slides */
  const handleApplyGradientToAll = (gradient: string) => {
    if (!script) return;
    // Clear all media
    script.slides.forEach((s, i) => {
      if (s.bg?.mediaUrl) URL.revokeObjectURL(s.bg.mediaUrl);
      slideBgImagesRef.current.delete(i);
      const vid = slideBgVideosRef.current.get(i);
      if (vid) { vid.pause(); slideBgVideosRef.current.delete(i); }
    });
    setScript({
      ...script,
      gradient,
      slides: script.slides.map((s) => ({ ...s, bg: { type: "gradient", gradient } })),
    });
  };

  /** Handle per-slide file upload */
  const handleSlideBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editingBgSlide === null || !script) return;
    const idx = editingBgSlide;

    // Revoke old
    const old = script.slides[idx]?.bg?.mediaUrl;
    if (old) URL.revokeObjectURL(old);

    const url = URL.createObjectURL(file);

    if (file.type.startsWith("image/")) {
      slideBgVideosRef.current.delete(idx);
      const img = new Image();
      img.onload = () => {
        slideBgImagesRef.current.set(idx, img);
        setBgLoadTick((t) => t + 1);
      };
      img.src = url;
      setScript({
        ...script,
        slides: script.slides.map((s, i) =>
          i === idx ? { ...s, bg: { type: "image", gradient: s.bg?.gradient || script.gradient, mediaUrl: url } } : s
        ),
      });
    } else if (file.type.startsWith("video/")) {
      slideBgImagesRef.current.delete(idx);
      const video = document.createElement("video");
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});
      video.addEventListener("loadeddata", () => setBgLoadTick((t) => t + 1));
      slideBgVideosRef.current.set(idx, video);
      setScript({
        ...script,
        slides: script.slides.map((s, i) =>
          i === idx ? { ...s, bg: { type: "video", gradient: s.bg?.gradient || script.gradient, mediaUrl: url } } : s
        ),
      });
    }

    // Reset input
    if (slideBgFileInputRef.current) slideBgFileInputRef.current.value = "";
    setEditingBgSlide(null);
  };

  /** Clear per-slide media (revert to gradient) */
  const handleClearSlideBg = (idx: number) => {
    if (!script) return;
    const old = script.slides[idx]?.bg?.mediaUrl;
    if (old) URL.revokeObjectURL(old);
    slideBgImagesRef.current.delete(idx);
    const vid = slideBgVideosRef.current.get(idx);
    if (vid) { vid.pause(); slideBgVideosRef.current.delete(idx); }
    setScript({
      ...script,
      slides: script.slides.map((s, i) =>
        i === idx ? { ...s, bg: { type: "gradient", gradient: s.bg?.gradient || script.gradient } } : s
      ),
    });
    setBgLoadTick((t) => t + 1);
  };

  // ─── Preview dimensions ────────────────────────────────────────────────

  const previewMaxHeight = 480;
  const previewWidth = (ratio.width / ratio.height) * previewMaxHeight;

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Hidden file input for per-slide bg uploads */}
      <input
        ref={slideBgFileInputRef}
        type="file"
        accept="image/*,video/mp4,video/webm"
        className="hidden"
        onChange={handleSlideBgUpload}
      />

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
              {/* Script editor header */}
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{script.title}</h4>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { setScript(null); setAudioBlobs(new Map()); }}
                  className="gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> New
                </Button>
              </div>

              {/* Global gradient (apply to all) */}
              <div className="space-y-2">
                <Label className="text-xs">Default Background (apply to all)</Label>
                <div className="flex gap-2 flex-wrap">
                  {GRADIENT_PRESETS.map((g, i) => (
                    <button
                      key={i}
                      className={`w-7 h-7 rounded-md border-2 transition-all ${
                        script.gradient === g ? "border-primary scale-110" : "border-transparent"
                      }`}
                      style={{ background: g }}
                      onClick={() => handleApplyGradientToAll(g)}
                    />
                  ))}
                </div>
              </div>

              {/* Text Styling */}
              <div className="space-y-3 border border-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-xs font-medium">Text Styling</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Font</Label>
                    <Select value={textStyle.font} onValueChange={(v) => setTextStyle(s => ({ ...s, font: v }))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Position</Label>
                    <Select value={textStyle.position} onValueChange={(v) => setTextStyle(s => ({ ...s, position: v as TextStyle["position"] }))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TEXT_POSITIONS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Size ({Math.round(textStyle.sizeMultiplier * 100)}%)</Label>
                  <Slider
                    value={[textStyle.sizeMultiplier]}
                    min={0.5} max={1.8} step={0.1}
                    onValueChange={([v]) => setTextStyle(s => ({ ...s, sizeMultiplier: v }))}
                    className="py-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Animation</Label>
                  <div className="flex gap-1 flex-wrap">
                    {TEXT_ANIMATIONS.map(a => (
                      <button
                        key={a.value}
                        onClick={() => setTextStyle(s => ({ ...s, animation: a.value as TextStyle["animation"] }))}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          textStyle.animation === a.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Switch checked={textStyle.bold} onCheckedChange={(v) => setTextStyle(s => ({ ...s, bold: v }))} />
                    <Label className="text-[10px]">Bold</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px]">Color</Label>
                    <input
                      type="color" value={textStyle.color}
                      onChange={(e) => setTextStyle(s => ({ ...s, color: e.target.value }))}
                      className="w-6 h-6 rounded border border-border cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Slide editor */}
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {script.slides.map((slide, i) => {
                  const bg = getSlideBg(slide, script.gradient);
                  return (
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
                          {audioDurations.has(i)
                            ? `${getSlideDuration(i).toFixed(1)}s (audio: ${audioDurations.get(i)!.toFixed(1)}s)`
                            : `${slide.duration}s`}
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
                        className="text-xs h-7 text-muted-foreground mb-2"
                        placeholder="Voiceover text"
                      />

                      {/* Per-slide background controls */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Gradient swatches for this slide */}
                        {GRADIENT_PRESETS.slice(0, 4).map((g, gi) => (
                          <button
                            key={gi}
                            className={`w-5 h-5 rounded border transition-all ${
                              bg.type === "gradient" && bg.gradient === g ? "border-primary scale-110" : "border-transparent"
                            }`}
                            style={{ background: g }}
                            onClick={(e) => { e.stopPropagation(); handleSlideGradientChange(i, g); }}
                            title={`Gradient ${gi + 1}`}
                          />
                        ))}
                        {/* More gradients dropdown-like: show remaining on hover? Just show all 8 compactly */}
                        {GRADIENT_PRESETS.slice(4).map((g, gi) => (
                          <button
                            key={gi + 4}
                            className={`w-5 h-5 rounded border transition-all ${
                              bg.type === "gradient" && bg.gradient === g ? "border-primary scale-110" : "border-transparent"
                            }`}
                            style={{ background: g }}
                            onClick={(e) => { e.stopPropagation(); handleSlideGradientChange(i, g); }}
                            title={`Gradient ${gi + 5}`}
                          />
                        ))}

                        {/* Upload image/video for this slide */}
                        <button
                          className="w-5 h-5 rounded border border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary transition-colors"
                          title="Upload image"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBgSlide(i);
                            if (slideBgFileInputRef.current) {
                              slideBgFileInputRef.current.accept = "image/*";
                              slideBgFileInputRef.current.click();
                            }
                          }}
                        >
                          <ImagePlus className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          className="w-5 h-5 rounded border border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary transition-colors"
                          title="Upload video"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBgSlide(i);
                            if (slideBgFileInputRef.current) {
                              slideBgFileInputRef.current.accept = "video/mp4,video/webm,video/quicktime";
                              slideBgFileInputRef.current.click();
                            }
                          }}
                        >
                          <VideoIcon className="h-3 w-3 text-muted-foreground" />
                        </button>

                        {/* Show media indicator & clear button */}
                        {bg.type !== "gradient" && (
                          <div className="flex items-center gap-1 ml-1">
                            <Badge variant="outline" className="text-[8px] h-4 px-1">
                              {bg.type === "image" ? "IMG" : "VID"}
                            </Badge>
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleClearSlideBg(i); }}
                              title="Remove media"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AudioWaveform className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs">Waveform Visualizer</Label>
                  </div>
                  <Switch checked={showWaveform} onCheckedChange={setShowWaveform} />
                </div>
                {showWaveform && (
                  <div className="flex gap-1.5">
                    {([
                      { value: "bars" as const, label: "Bars" },
                      { value: "circular" as const, label: "Circular" },
                      { value: "line" as const, label: "Line" },
                    ]).map(s => (
                      <button
                        key={s.value}
                        onClick={() => setWaveformStyle(s.value)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          waveformStyle === s.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
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
                  variant="ghost" size="icon"
                  onClick={() => handleSlideChange(currentSlide - 1)}
                  disabled={currentSlide === 0 || isPlaying}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="icon"
                  onClick={() => {
                    if (isPlaying) setIsPlaying(false);
                    else { setCurrentSlide(0); setIsPlaying(true); }
                  }}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost" size="icon"
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
