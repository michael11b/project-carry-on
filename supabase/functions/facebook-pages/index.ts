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

  try {
    const FACEBOOK_PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
    if (!FACEBOOK_PAGE_ACCESS_TOKEN) {
      throw new Error("Facebook Page Access Token is not configured.");
    }

    // Fetch pages from Facebook Graph API
    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(FACEBOOK_PAGE_ACCESS_TOKEN)}`
    );
    const fbData = await fbRes.json();

    if (fbData.error) {
      throw new Error(`Facebook API error: ${fbData.error.message}`);
    }

    const pages = (fbData.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token, // page-specific token
      category: p.category,
    }));

    return new Response(JSON.stringify({ pages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching Facebook pages:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
