import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- AES-256-GCM Encryption Helpers ---
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function encryptValue(plaintext: string, password: string, salt: Uint8Array): Promise<{ encrypted: string; iv: string }> {
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  return { encrypted: toBase64(ciphertext), iv: toBase64(iv) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { short_lived_token, app_id, app_secret, encryption_password, org_id } = await req.json();

    if (!short_lived_token || !app_id || !app_secret || !encryption_password || !org_id) {
      throw new Error("Missing required fields: short_lived_token, app_id, app_secret, encryption_password, org_id");
    }

    // Step 1: Exchange short-lived token for long-lived user token
    const exchangeUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(app_id)}&client_secret=${encodeURIComponent(app_secret)}&fb_exchange_token=${encodeURIComponent(short_lived_token)}`;
    const exchangeRes = await fetch(exchangeUrl);
    const exchangeData = await exchangeRes.json();

    if (exchangeData.error) {
      throw new Error(`Token exchange failed: ${exchangeData.error.message}`);
    }

    const longLivedToken = exchangeData.access_token;
    if (!longLivedToken) {
      throw new Error("No access_token returned from token exchange");
    }

    // Step 2: Fetch all pages using long-lived token
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedToken)}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(`Failed to fetch pages: ${pagesData.error.message}`);
    }

    const pages = pagesData.data || [];
    if (pages.length === 0) {
      throw new Error("No Facebook Pages found for this account. Make sure you have page management permissions.");
    }

    // Step 3: Generate salt and encrypt credentials
    const credSalt = crypto.getRandomValues(new Uint8Array(16));
    const credSaltB64 = toBase64(credSalt);

    const [encAppId, encAppSecret, encUserToken] = await Promise.all([
      encryptValue(app_id, encryption_password, credSalt),
      encryptValue(app_secret, encryption_password, credSalt),
      encryptValue(longLivedToken, encryption_password, credSalt),
    ]);

    // Step 4: Upsert facebook_credentials (one combined IV for the credential row)
    const combinedIv = JSON.stringify({
      app_id_iv: encAppId.iv,
      app_secret_iv: encAppSecret.iv,
      user_token_iv: encUserToken.iv,
    });

    const { error: credErr } = await supabase
      .from("facebook_credentials")
      .upsert({
        org_id,
        app_id_encrypted: encAppId.encrypted,
        app_secret_encrypted: encAppSecret.encrypted,
        user_token_encrypted: encUserToken.encrypted,
        iv: combinedIv,
        salt: credSaltB64,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id" });

    if (credErr) throw new Error(`Failed to store credentials: ${credErr.message}`);

    // Step 5: Encrypt and upsert each page token
    const pageResults: Array<{ id: string; name: string; category?: string }> = [];

    for (const page of pages) {
      const pageSalt = crypto.getRandomValues(new Uint8Array(16));
      const pageSaltB64 = toBase64(pageSalt);
      const encPageToken = await encryptValue(page.access_token, encryption_password, pageSalt);

      // Delete existing page entry if any, then insert
      await supabase
        .from("facebook_pages")
        .delete()
        .eq("org_id", org_id)
        .eq("page_id", page.id);

      const { error: pageErr } = await supabase
        .from("facebook_pages")
        .insert({
          org_id,
          page_id: page.id,
          page_name: page.name,
          access_token_encrypted: null, // legacy column
          page_token_encrypted: encPageToken.encrypted,
          page_token_iv: encPageToken.iv,
          page_token_salt: pageSaltB64,
        });

      if (pageErr) {
        console.error(`Failed to store page ${page.id}:`, pageErr);
        continue;
      }

      pageResults.push({ id: page.id, name: page.name, category: page.category });
    }

    // Step 6: Discover Instagram Business accounts linked to each page
    const igResults: Array<{ ig_user_id: string; ig_username: string; facebook_page_id: string }> = [];

    for (const page of pages) {
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v22.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(page.access_token)}`
        );
        const igData = await igRes.json();
        const igAccount = igData?.instagram_business_account;
        if (igAccount?.id) {
          // Delete existing and insert fresh
          await supabase
            .from("instagram_accounts")
            .delete()
            .eq("org_id", org_id)
            .eq("ig_user_id", igAccount.id);

          await supabase
            .from("instagram_accounts")
            .insert({
              org_id,
              facebook_page_id: page.id,
              ig_user_id: igAccount.id,
              ig_username: igAccount.username || null,
            });

          igResults.push({
            ig_user_id: igAccount.id,
            ig_username: igAccount.username || "",
            facebook_page_id: page.id,
          });
        }
      } catch (e) {
        console.error(`Failed to fetch IG account for page ${page.id}:`, e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      pages: pageResults,
      instagram_accounts: igResults,
      token_expires_in: exchangeData.expires_in || "never (page tokens are permanent)",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook setup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
