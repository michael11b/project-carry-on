import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, brandVoice, channel, variantCount, contentType, pageContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build system prompt with content type context
    let systemPrompt = `You are a world-class content strategist and copywriter.`;

    // Add content type context
    if (contentType === "facebook_post") {
      systemPrompt += `\n\nYou are creating a Facebook page post. The output should be ready to publish directly to Facebook. Include engaging copy that drives likes, comments, and shares. Keep it concise but impactful. Use emojis sparingly. Do NOT include image descriptions or placeholders — just the text content for the post.`;
    } else if (contentType === "instagram_caption") {
      systemPrompt += `\n\nYou are writing an Instagram caption. Make it engaging, use relevant hashtags at the end, and include a call-to-action. Use emojis naturally.`;
    } else {
      systemPrompt += `\n\nGenerate high-quality marketing content based on the user's prompt.`;
    }

    // Add page-specific context if provided
    if (pageContext) {
      systemPrompt += `\n\n## Page Context`;
      if (pageContext.page_name) systemPrompt += `\nPage: ${pageContext.page_name}`;
      if (pageContext.description) systemPrompt += `\nAbout: ${pageContext.description}`;
      if (pageContext.target_audience) systemPrompt += `\nTarget Audience: ${pageContext.target_audience}`;
      if (pageContext.content_tone) systemPrompt += `\nTone: ${pageContext.content_tone}`;
      if (pageContext.content_topics?.length) systemPrompt += `\nKey Topics: ${pageContext.content_topics.join(", ")}`;
      if (pageContext.posting_goals) systemPrompt += `\nGoals: ${pageContext.posting_goals}`;
      if (pageContext.hashtag_preferences) systemPrompt += `\nPreferred Hashtags: ${pageContext.hashtag_preferences}`;
      if (pageContext.custom_system_prompt) systemPrompt += `\n\n## Additional Instructions\n${pageContext.custom_system_prompt}`;
    }

    if (channel) {
      const channelGuides: Record<string, string> = {
        instagram: "Write for Instagram: use emojis, hashtags, keep it visual and engaging. Max 2200 chars per post. Include relevant hashtags at the end.",
        linkedin: "Write for LinkedIn: professional tone, thought leadership style, use line breaks for readability. Include a hook in the first line.",
        tiktok: "Write for TikTok: casual, trendy, Gen-Z friendly. Short punchy sentences. Include trending hooks and CTAs.",
        twitter: "Write for Twitter/X: concise, max 280 chars per tweet. Punchy, witty, conversation-starting. Use threads for longer content.",
        blog: "Write for a blog: SEO-friendly, well-structured with headers, engaging introduction, clear CTAs. Use markdown formatting.",
        ad_copy: "Write advertising copy: persuasive, benefit-driven, clear value proposition. Include headline, body copy, and CTA variations.",
      };
      if (channelGuides[channel]) {
        systemPrompt += `\n\n## Channel Guidelines\n${channelGuides[channel]}`;
      }
    }

    if (variantCount && variantCount > 1) {
      systemPrompt += `\n\n## Variants\nGenerate exactly ${variantCount} distinct variants. Label each as "Variant 1:", "Variant 2:", etc. Each should take a different angle or tone while staying on-brand.`;
    }

    if (brandVoice) {
      systemPrompt += `\n\n## Brand Voice Profile`;
      if (brandVoice.voice_profile) {
        const vp = brandVoice.voice_profile;
        if (vp.tone) systemPrompt += `\nTone: ${vp.tone}`;
        if (vp.style) systemPrompt += `\nStyle: ${vp.style}`;
        if (vp.personality) systemPrompt += `\nPersonality: ${vp.personality}`;
        if (vp.audience) systemPrompt += `\nTarget Audience: ${vp.audience}`;
        if (vp.examples) systemPrompt += `\nExample content for reference:\n${vp.examples}`;
      }
      if (brandVoice.prohibited_terms && brandVoice.prohibited_terms.length > 0) {
        systemPrompt += `\n\nNEVER use these prohibited terms: ${brandVoice.prohibited_terms.join(", ")}`;
      }
      if (brandVoice.name) {
        systemPrompt += `\nBrand name: ${brandVoice.name}`;
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
