import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLATFORM_PRESETS: Record<string, string> = {
  instagram_post: "square 1:1 aspect ratio, 1080×1080, suitable for an Instagram post",
  instagram_story: "vertical 9:16 aspect ratio, 1080×1920, suitable for an Instagram Story",
  facebook_post: "landscape ~1.9:1 aspect ratio, 1200×630, suitable for a Facebook post",
  linkedin_post: "landscape ~1.91:1 aspect ratio, 1200×627, suitable for a LinkedIn post",
  twitter_post: "widescreen 16:9 aspect ratio, 1600×900, suitable for a Twitter/X post",
  tiktok_cover: "vertical 9:16 aspect ratio, 1080×1920, suitable for a TikTok cover",
  blog_header: "wide 2:1 aspect ratio, 1200×600, suitable for a blog header",
  ad_banner: "landscape ~1.91:1 aspect ratio, 1200×628, suitable for an ad banner",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  imageUrl?: string;
}

function buildSystemPrompt(brandStyle?: any, platform?: string, contentType?: string, pageContext?: any): string {
  let sys = "You are an image generation assistant. You MUST produce an image for every request. Do not ask clarifying questions — just create the best image you can based on the description.\n";

  if (platform && PLATFORM_PRESETS[platform]) {
    sys += `\nImage dimensions/format: ${PLATFORM_PRESETS[platform]}.`;
  }

  if (contentType === "facebook_post_image") {
    sys += "\nThis image is for a Facebook page post. It should be eye-catching, shareable, and suitable for social media.";
  } else if (contentType === "instagram_image") {
    sys += "\nThis image is for an Instagram post. It should be visually stunning, on-trend, and optimized for the Instagram feed.";
  }

  if (pageContext) {
    if (pageContext.page_name) sys += ` The image is for the page "${pageContext.page_name}".`;
    if (pageContext.description) sys += ` Page context: ${pageContext.description}.`;
    if (pageContext.content_tone) sys += ` Visual tone should be ${pageContext.content_tone}.`;
  }

  if (brandStyle) {
    sys += `\n\nBrand style guidance for "${brandStyle.name}":`;
    if (brandStyle.colors) {
      const colorEntries = Object.entries(brandStyle.colors).filter(([, v]) => v);
      if (colorEntries.length) {
        sys += ` Use these brand colors: ${colorEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}.`;
      }
    }
    if (brandStyle.tone) {
      sys += ` Visual tone should feel ${brandStyle.tone}.`;
    }
  }

  return sys;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, brandStyle, platform, contentType, pageContext, messages, variationCount } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = buildSystemPrompt(brandStyle, platform, contentType, pageContext);

    // Build messages array for the AI
    let aiMessages: any[];

    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Multi-turn conversation mode
      aiMessages = [{ role: "system", content: systemPrompt }];

      for (const msg of messages as ChatMessage[]) {
        if (msg.role === "user") {
          // If user message references editing a previous image, build multi-modal content
          aiMessages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          // Include assistant text responses (skip images in history to save tokens,
          // but include the last image if the next message is an edit request)
          if (msg.content) {
            aiMessages.push({ role: "assistant", content: typeof msg.content === "string" ? msg.content : "" });
          }
        }
      }
    } else {
      // Legacy single-shot mode
      const enhancedPrompt = `Generate an image based on the following description. You MUST produce an image, do not ask clarifying questions. Just create the best image you can:\n\n${prompt}`;
      aiMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: enhancedPrompt },
      ];
    }

    // Handle variation generation
    const count = Math.min(variationCount || 1, 4);

    const generateOne = async (variationIndex?: number) => {
      const msgs = [...aiMessages];
      if (variationIndex !== undefined && variationIndex > 0) {
        // Append variation instruction to the last user message
        const lastUserIdx = msgs.map((m: any) => m.role).lastIndexOf("user");
        if (lastUserIdx >= 0) {
          const original = typeof msgs[lastUserIdx].content === "string" ? msgs[lastUserIdx].content : "";
          msgs[lastUserIdx] = {
            ...msgs[lastUserIdx],
            content: original + `\n\nGenerate a distinctly DIFFERENT creative variation (variation #${variationIndex + 1}). Use a different composition, style, or artistic interpretation while keeping the same subject.`,
          };
        }
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: msgs,
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
        if (response.status === 402) throw new Error("Usage credits exhausted. Please top up in Settings → Workspace → Usage.");
        const text = await response.text();
        console.error("AI gateway error:", response.status, text);
        throw new Error("Image generation failed");
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      const imageUrl = message?.images?.[0]?.image_url?.url;
      const description = message?.content || "";

      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === "content_filter" || message?.refusal) {
        throw new Error("The image could not be generated due to content safety filters. Try a different prompt.");
      }

      if (!imageUrl) {
        throw new Error("No image was generated. Try rephrasing or simplifying your request.");
      }

      return { imageUrl, description };
    };

    if (count <= 1) {
      const result = await generateOne();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Generate multiple variations in parallel
      const results = await Promise.allSettled(
        Array.from({ length: count }, (_, i) => generateOne(i))
      );

      const variations = results
        .filter((r): r is PromiseFulfilledResult<{ imageUrl: string; description: string }> => r.status === "fulfilled")
        .map((r) => r.value);

      if (variations.length === 0) {
        const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        return new Response(JSON.stringify({ error: firstError?.reason?.message || "All variations failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ variations, imageUrl: variations[0].imageUrl, description: variations[0].description }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
