import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Google Service Account JWT → Access Token ──────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_KEY is not configured");

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  })));

  const signingInput = `${header}.${payload}`;

  // Import RSA private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Token exchange error:", tokenRes.status, errText);
    throw new Error("Failed to obtain GCP access token");
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// ─── Polling ────────────────────────────────────────────────────────────────

async function pollOperation(url: string, accessToken: string, maxWait = 180000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Poll failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (data.done) return data;
    if (data.error) throw new Error(data.error.message || "Generation failed");
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("Video generation timed out (3 min)");
}

// ─── Google Veo (Vertex AI) ─────────────────────────────────────────────────

async function generateWithGoogleVeo(prompt: string, aspectRatio: string): Promise<{ videoUrl: string }> {
  const projectId = Deno.env.get("GCP_PROJECT_ID");
  const location = Deno.env.get("GCP_LOCATION") || "us-central1";
  if (!projectId) throw new Error("GCP_PROJECT_ID is not configured");

  const accessToken = await getAccessToken();
  const modelId = "veo-3.0-generate-001";
  const baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
      sampleCount: 1,
    },
  };

  console.log("Starting Veo generation via Vertex AI...");
  const startRes = await fetch(`${baseUrl}:predictLongRunning`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error("Vertex AI Veo error:", startRes.status, errText);
    throw new Error(`Veo generation failed: ${startRes.status} - ${errText.slice(0, 300)}`);
  }

  const startData = await startRes.json();
  console.log("Veo start response:", JSON.stringify(startData).slice(0, 500));
  const operationName = startData.name;

  if (!operationName) {
    const vid = startData.predictions?.[0]?.videoUri;
    if (vid) return { videoUrl: vid };
    throw new Error("No operation name from Vertex AI");
  }

  // Extract operation ID and build correct poll URL
  // operationName format: "projects/{p}/locations/{l}/publishers/google/models/{m}/operations/{id}"
  // Poll URL format: "projects/{p}/locations/{l}/operations/{id}"
  const opIdMatch = operationName.match(/operations\/([^/]+)$/);
  const opId = opIdMatch ? opIdMatch[1] : operationName;
  const pollUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/operations/${opId}`;
  const result = await pollOperation(pollUrl, accessToken, 180000);

  // Extract video URL from response
  const predictions = result.response?.predictions;
  if (predictions?.[0]?.videoUri) return { videoUrl: predictions[0].videoUri };

  // Alternative response structure
  const videos = result.response?.generatedVideos;
  if (videos?.[0]?.video?.uri) return { videoUrl: videos[0].video.uri };

  console.error("Unexpected Veo response:", JSON.stringify(result).slice(0, 500));
  throw new Error("No video URL in Veo response");
}

// ─── OpenAI Sora ────────────────────────────────────────────────────────────

async function generateWithOpenAISora(prompt: string, aspectRatio: string): Promise<{ videoUrl: string }> {
  const apiKey = Deno.env.get("OPENAI_VIDEO_API_KEY");
  if (!apiKey) throw new Error("OPENAI_VIDEO_API_KEY is not configured");

  const size = aspectRatio === "9:16" ? "1080x1920" : aspectRatio === "1:1" ? "1080x1080" : "1920x1080";

  const startRes = await fetch("https://api.openai.com/v1/videos/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "sora", prompt, size, duration: 10, n: 1 }),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error("OpenAI Sora error:", startRes.status, errText);
    throw new Error(`Sora generation failed: ${startRes.status}`);
  }

  const startData = await startRes.json();

  if (startData.data?.[0]?.url) return { videoUrl: startData.data[0].url };

  const generationId = startData.id;
  if (!generationId) throw new Error("No generation ID from Sora");

  const start = Date.now();
  while (Date.now() - start < 180000) {
    const pollRes = await fetch(`https://api.openai.com/v1/videos/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`Sora poll failed: ${pollRes.status}`);
    const pollData = await pollRes.json();
    if (pollData.status === "completed" && pollData.data?.[0]?.url) return { videoUrl: pollData.data[0].url };
    if (pollData.status === "failed") throw new Error(pollData.error?.message || "Sora generation failed");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Sora generation timed out");
}

// ─── Handler ────────────────────────────────────────────────────────────────

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
