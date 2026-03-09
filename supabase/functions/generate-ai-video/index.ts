import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function pollOperation(url: string, headers: Record<string, string>, maxWait = 180000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Poll failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (data.done || data.state === "SUCCEEDED") return data;
    if (data.error || data.state === "FAILED") throw new Error(data.error?.message || "Generation failed");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Video generation timed out");
}

async function generateWithGoogleVeo(prompt: string, aspectRatio: string): Promise<{ videoUrl: string }> {
  const apiKey = Deno.env.get("GOOGLE_VEO_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_VEO_API_KEY is not configured");

  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-preview:predictLongRunning`;

  const body = {
    instances: [{ prompt }],
  };

  const startRes = await fetch(generateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error("Veo start error:", startRes.status, errText);
    throw new Error(`Failed to start Veo generation: ${startRes.status} - ${errText.slice(0, 200)}`);
  }

  const startData = await startRes.json();
  const operationName = startData.name;

  if (!operationName) {
    // Check for immediate result
    const video = startData.generatedVideos?.[0]?.video;
    if (video?.uri) return { videoUrl: video.uri };
    throw new Error("No operation name or immediate result from Veo");
  }

  // Poll for completion
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
  const result = await pollOperation(pollUrl, {}, 180000);

  const videoResult = result.response?.generatedVideos?.[0]?.video;
  if (videoResult?.uri) return { videoUrl: videoResult.uri };

  throw new Error("No video URL in Veo response");
}

async function generateWithOpenAISora(prompt: string, aspectRatio: string): Promise<{ videoUrl: string }> {
  const apiKey = Deno.env.get("OPENAI_VIDEO_API_KEY");
  if (!apiKey) throw new Error("OPENAI_VIDEO_API_KEY is not configured");

  const size = aspectRatio === "9:16" ? "1080x1920" : aspectRatio === "1:1" ? "1080x1080" : "1920x1080";

  // Start video generation
  const startRes = await fetch("https://api.openai.com/v1/videos/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sora",
      prompt,
      size,
      duration: 10,
      n: 1,
    }),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error("OpenAI Sora start error:", startRes.status, errText);
    throw new Error(`Failed to start Sora generation: ${startRes.status}`);
  }

  const startData = await startRes.json();

  // If the response has a direct URL
  if (startData.data?.[0]?.url) {
    return { videoUrl: startData.data[0].url };
  }

  // If it returns a generation ID for polling
  const generationId = startData.id;
  if (!generationId) throw new Error("No generation ID from Sora");

  // Poll for completion
  const start = Date.now();
  while (Date.now() - start < 180000) {
    const pollRes = await fetch(`https://api.openai.com/v1/videos/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`Sora poll failed: ${pollRes.status}`);
    const pollData = await pollRes.json();
    if (pollData.status === "completed" && pollData.data?.[0]?.url) {
      return { videoUrl: pollData.data[0].url };
    }
    if (pollData.status === "failed") throw new Error(pollData.error?.message || "Sora generation failed");
    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error("Sora generation timed out");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { model, prompt, aspectRatio } = await req.json();

    if (!prompt?.trim()) throw new Error("Prompt is required");
    if (!model || !["google-veo", "openai-sora"].includes(model)) {
      throw new Error("Invalid model. Use 'google-veo' or 'openai-sora'");
    }

    console.log(`Generating video with ${model}, prompt: "${prompt.slice(0, 100)}...", aspect: ${aspectRatio}`);

    let result: { videoUrl: string };

    if (model === "google-veo") {
      result = await generateWithGoogleVeo(prompt, aspectRatio || "16:9");
    } else {
      result = await generateWithOpenAISora(prompt, aspectRatio || "16:9");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-ai-video error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
