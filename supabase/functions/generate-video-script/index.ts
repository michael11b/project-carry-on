import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, slideCount, format } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!prompt?.trim()) throw new Error("Prompt is required");

    const numSlides = slideCount || 5;

    const systemPrompt = `You are a video script generator for social media reels/shorts. Given a topic, generate a script broken into ${numSlides} slides.

Each slide has:
- "text": The text displayed on screen (max 15 words, punchy and engaging)
- "voiceover": What the narrator says for this slide (1-2 sentences, natural spoken language)
- "duration": Suggested display time in seconds (2-5 seconds)

Also generate:
- "title": A catchy title for the video
- "gradient": A CSS gradient string for the background (use vibrant, modern gradients like "linear-gradient(135deg, #667eea 0%, #764ba2 100%)")

Return a JSON object with this exact structure:
{
  "title": "string",
  "gradient": "string",
  "slides": [
    { "text": "string", "voiceover": "string", "duration": number }
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks, no explanation.`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "create_video_script",
              description: "Create a video script with slides for a reel/short",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Video title" },
                  gradient: { type: "string", description: "CSS gradient for background" },
                  slides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "On-screen text (max 15 words)" },
                        voiceover: { type: "string", description: "Narrator text for this slide" },
                        duration: { type: "number", description: "Duration in seconds (2-5)" },
                      },
                      required: ["text", "voiceover", "duration"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "gradient", "slides"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_video_script" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Script generation failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No script generated");

    const script = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(script), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-video-script error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
