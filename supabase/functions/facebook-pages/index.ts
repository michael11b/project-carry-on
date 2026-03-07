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
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = body.org_id;

    if (!orgId) {
      throw new Error("org_id is required");
    }

    // Read pages from DB instead of calling Facebook API
    const { data: pages, error } = await supabase
      .from("facebook_pages")
      .select("page_id, page_name")
      .eq("org_id", orgId);

    if (error) throw error;

    // Check if credentials exist for this org
    const { data: creds } = await supabase
      .from("facebook_credentials")
      .select("id")
      .eq("org_id", orgId)
      .maybeSingle();

    const connected = !!creds;

    return new Response(JSON.stringify({
      connected,
      pages: (pages || []).map((p: any) => ({
        id: p.page_id,
        name: p.page_name,
      })),
    }), {
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
