

## Plan: Add AI Video Generation (Google Veo + OpenAI Sora) to Content Studio

### Overview
Add an "AI Video" sub-section within the Video tab that lets users select a model (Google Veo or OpenAI Sora), enter a prompt, and generate a fully AI-created video. The generated video will be displayed in-line with a download button.

### Steps

**1. Securely store API keys**
- Use the `add_secret` tool to request two secrets: `GOOGLE_VEO_API_KEY` and `OPENAI_VIDEO_API_KEY`.

**2. Create edge function `generate-ai-video`**
- File: `supabase/functions/generate-ai-video/index.ts`
- Accepts `{ model: "google-veo" | "openai-sora", prompt: string, aspectRatio?: string }`
- For **Google Veo**: Call `https://generativelanguage.googleapis.com/v1beta/models/veo-3-generate-preview:predictLongRunning` (or the appropriate Veo endpoint) using the stored API key. Veo returns a video generation operation that needs polling until complete, then returns a video URL/bytes.
- For **OpenAI Sora**: Call `https://api.openai.com/v1/videos/generations` with the stored OpenAI key. Poll the generation status, then return the video URL.
- Both APIs are async (generate → poll → result), so the edge function will handle polling internally and return the final video URL.
- Add CORS headers, handle 429/402 errors, set `verify_jwt = false` in config.toml.

**3. Create `AIVideoGenerator` component**
- File: `src/components/AIVideoGenerator.tsx`
- UI: Model selector (Google Veo / OpenAI Sora), prompt textarea, aspect ratio selector, "Generate" button.
- Shows a loading state with progress indicator during generation (these APIs can take 30-120 seconds).
- Displays the generated video in a `<video>` player with download button.
- Option to save to Asset Library.

**4. Integrate into VideoCreator**
- Add a toggle/tab at the top of the Video tab: "Slide Builder" (existing) vs "AI Video" (new).
- When "AI Video" is selected, render `AIVideoGenerator` instead of the existing slide-based creator.

### Technical Details

- Google Veo API returns video as base64 or a GCS URL; the edge function will handle conversion.
- OpenAI Sora returns a URL to the generated video.
- Both APIs have long generation times (30s-2min), so the frontend will poll a status endpoint or the edge function will block until complete (with a timeout of ~3 minutes).
- The edge function will normalize responses to `{ videoUrl: string, durationSeconds: number }`.

### API Key Flow
Before implementing, I will request the two API keys from you using the secure secrets tool.

