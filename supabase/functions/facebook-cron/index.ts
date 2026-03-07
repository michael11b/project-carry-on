import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encryptionPassword = Deno.env.get("FB_ENCRYPTION_PASSWORD");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (!encryptionPassword) {
    return new Response(JSON.stringify({ error: "FB_ENCRYPTION_PASSWORD secret not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: posts, error } = await supabase
      .from("scheduled_posts")
      .select("id")
      .eq("status", "scheduled")
      .eq("channel", "facebook")
      .is("published_fb_id", null)
      .lte("scheduled_at", new Date().toISOString());

    if (error) throw error;
    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ message: "No posts due", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const post of posts) {
      try {
        const publishRes = await fetch(`${supabaseUrl}/functions/v1/facebook-publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ post_id: post.id, encryption_password: encryptionPassword }),
        });
        const publishData = await publishRes.json();
        results.push({ post_id: post.id, ...publishData });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push({ post_id: post.id, error: msg });
      }
    }

    return new Response(JSON.stringify({ message: "Cron complete", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook cron error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
