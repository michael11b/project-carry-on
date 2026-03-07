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

    // Read pages from DB
    const { data: pages, error } = await supabase
      .from("facebook_pages")
      .select("page_id, page_name")
      .eq("org_id", orgId);

    if (error) throw error;

    // Read Instagram accounts from DB
    const { data: igAccounts, error: igError } = await supabase
      .from("instagram_accounts")
      .select("ig_user_id, ig_username, facebook_page_id")
      .eq("org_id", orgId);

    if (igError) throw igError;

    if (error) throw error;

    // Check if credentials exist for this org and get token age
    const { data: creds } = await supabase
      .from("facebook_credentials")
      .select("id, updated_at")
      .eq("org_id", orgId)
      .maybeSingle();

    const connected = !!creds;

    // Calculate days until token expiry (60 days from exchange)
    let tokenExchangedAt: string | null = null;
    let daysUntilExpiry: number | null = null;
    if (creds?.updated_at) {
      tokenExchangedAt = creds.updated_at;
      const exchangeDate = new Date(creds.updated_at);
      const expiryDate = new Date(exchangeDate.getTime() + 60 * 24 * 60 * 60 * 1000);
      daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    }

    return new Response(JSON.stringify({
      connected,
      pages: (pages || []).map((p: any) => ({
        id: p.page_id,
        name: p.page_name,
      })),
      instagram_accounts: (igAccounts || []).map((ig: any) => ({
        ig_user_id: ig.ig_user_id,
        ig_username: ig.ig_username,
        facebook_page_id: ig.facebook_page_id,
      })),
      token_exchanged_at: tokenExchangedAt,
      days_until_expiry: daysUntilExpiry,
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
