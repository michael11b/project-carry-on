import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, segmentCount } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!prompt?.trim()) throw new Error("Prompt is required");

    const numSegments = segmentCount || 8;

    const systemPrompt = `You are a script writer for short-form karaoke-style videos (reels/shorts). Given a topic, generate a script broken into ${numSegments} segments.

Each segment is a short phrase (3-8 words) that will be displayed on screen one at a time, with each word highlighting as the narrator speaks it.

Rules:
- Each segment should be a complete thought or phrase (NOT a single word)
- 3-8 words per segment — punchy, engaging, easy to read
- The full script should tell a story or convey a message
- Include a voiceover field with the EXACT same text (this will be spoken by TTS)
- Duration is how long this segment stays on screen (1.5-4 seconds depending on word count)

Also generate:
- "title": A catchy title
- "gradient": A CSS gradient string (e.g. "linear-gradient(135deg, #667eea 0%, #764ba2 100%)")

Return a JSON object:
{
  "title": "string",
  "gradient": "string",
  "segments": [
    { "text": "string", "voiceover": "string", "duration": number }
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks.`;

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
              name: "create_word_highlight_script",
              description: "Create a word-highlight video script with segments",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Video title" },
                  gradient: { type: "string", description: "CSS gradient for background" },
                  segments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "On-screen text (3-8 words)" },
                        voiceover: { type: "string", description: "Spoken text (same as text)" },
                        duration: { type: "number", description: "Duration in seconds (1.5-4)" },
                      },
                      required: ["text", "voiceover", "duration"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "gradient", "segments"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_word_highlight_script" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
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
    console.error("generate-word-highlight-script error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
