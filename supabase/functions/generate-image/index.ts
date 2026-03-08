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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, brandStyle, platform, contentType, pageContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build enhanced prompt with content type context
    let contextPrefix = "";
    if (contentType === "facebook_post_image") {
      contextPrefix = "This image is for a Facebook page post. It should be eye-catching, shareable, and suitable for social media. ";
    } else if (contentType === "instagram_image") {
      contextPrefix = "This image is for an Instagram post. It should be visually stunning, on-trend, and optimized for the Instagram feed. ";
    }

    // Add page context
    if (pageContext) {
      if (pageContext.page_name) contextPrefix += `The image is for the page "${pageContext.page_name}". `;
      if (pageContext.description) contextPrefix += `Page context: ${pageContext.description}. `;
      if (pageContext.content_tone) contextPrefix += `Visual tone should be ${pageContext.content_tone}. `;
    }

    let enhancedPrompt = `Generate an image based on the following description. You MUST produce an image, do not ask clarifying questions. Just create the best image you can:\n\n${contextPrefix}${prompt}`;

    if (platform && PLATFORM_PRESETS[platform]) {
      enhancedPrompt += `\n\nImage dimensions/format: ${PLATFORM_PRESETS[platform]}.`;
    }

    if (brandStyle) {
      let brandContext = `\n\nBrand style guidance for "${brandStyle.name}":`;
      if (brandStyle.colors) {
        const colorEntries = Object.entries(brandStyle.colors).filter(([, v]) => v);
        if (colorEntries.length) {
          brandContext += ` Use these brand colors: ${colorEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}.`;
        }
      }
      if (brandStyle.tone) {
        brandContext += ` Visual tone should feel ${brandStyle.tone}.`;
      }
      enhancedPrompt += brandContext;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: enhancedPrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage credits exhausted. Please top up in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "Image generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    console.log("AI gateway response structure:", JSON.stringify(data, null, 2).slice(0, 2000));

    const message = data.choices?.[0]?.message;
    const imageUrl = message?.images?.[0]?.image_url?.url;
    const description = message?.content || "";

    // Check for refusal / safety filter
    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === "content_filter" || message?.refusal) {
      return new Response(JSON.stringify({ error: "The image could not be generated due to content safety filters. Try a different prompt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image was generated. The model may not have produced an image for this prompt. Try rephrasing or simplifying your request." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageUrl, description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
