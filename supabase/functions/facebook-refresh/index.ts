import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function decryptValue(encrypted: string, ivB64: string, saltB64: string, password: string): Promise<string> {
  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(encrypted);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

async function encryptValue(plaintext: string, password: string, salt: Uint8Array): Promise<{ encrypted: string; iv: string }> {
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
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
    const { org_id, encryption_password } = await req.json();
    if (!org_id || !encryption_password) throw new Error("org_id and encryption_password are required");

    // Fetch stored credentials
    const { data: creds, error: credErr } = await supabase
      .from("facebook_credentials")
      .select("*")
      .eq("org_id", org_id)
      .single();

    if (credErr || !creds) throw new Error("No Facebook credentials found. Please run initial setup first.");

    // Decrypt the long-lived user token
    const ivData = JSON.parse(creds.iv);
    let userToken: string;
    try {
      userToken = await decryptValue(creds.user_token_encrypted, ivData.user_token_iv, creds.salt, encryption_password);
    } catch {
      throw new Error("Failed to decrypt credentials. Wrong encryption password?");
    }

    // Also decrypt app_id and app_secret to attempt a token refresh
    const appId = await decryptValue(creds.app_id_encrypted, ivData.app_id_iv, creds.salt, encryption_password);
    const appSecret = await decryptValue(creds.app_secret_encrypted, ivData.app_secret_iv, creds.salt, encryption_password);

    // Try to exchange for a fresh long-lived token (extends the 60-day window)
    let freshToken = userToken;
    try {
      const exchangeUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(userToken)}`;
      const exchangeRes = await fetch(exchangeUrl);
      const exchangeData = await exchangeRes.json();
      if (exchangeData.access_token) {
        freshToken = exchangeData.access_token;
      }
      // If exchange fails, we still use the existing token to fetch pages
    } catch {
      console.warn("Token refresh exchange failed, using existing token");
    }

    // Fetch pages with the (possibly refreshed) token
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(freshToken)}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(`Facebook API error: ${pagesData.error.message}. Your token may have expired — please reconnect.`);
    }

    const pages = pagesData.data || [];

    // Re-encrypt the (possibly refreshed) user token
    const credSalt = fromBase64(creds.salt);
    const [encAppId, encAppSecret, encUserToken] = await Promise.all([
      encryptValue(appId, encryption_password, credSalt),
      encryptValue(appSecret, encryption_password, credSalt),
      encryptValue(freshToken, encryption_password, credSalt),
    ]);

    const combinedIv = JSON.stringify({
      app_id_iv: encAppId.iv,
      app_secret_iv: encAppSecret.iv,
      user_token_iv: encUserToken.iv,
    });

    await supabase
      .from("facebook_credentials")
      .update({
        app_id_encrypted: encAppId.encrypted,
        app_secret_encrypted: encAppSecret.encrypted,
        user_token_encrypted: encUserToken.encrypted,
        iv: combinedIv,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", org_id);

    // Delete old pages and insert fresh ones
    await supabase.from("facebook_pages").delete().eq("org_id", org_id);
    await supabase.from("instagram_accounts").delete().eq("org_id", org_id);

    const pageResults: Array<{ id: string; name: string; category?: string }> = [];
    const igResults: Array<{ ig_user_id: string; ig_username: string; facebook_page_id: string }> = [];

    for (const page of pages) {
      const pageSalt = crypto.getRandomValues(new Uint8Array(16));
      const pageSaltB64 = toBase64(pageSalt);
      const encPageToken = await encryptValue(page.access_token, encryption_password, pageSalt);

      await supabase.from("facebook_pages").insert({
        org_id,
        page_id: page.id,
        page_name: page.name,
        page_token_encrypted: encPageToken.encrypted,
        page_token_iv: encPageToken.iv,
        page_token_salt: pageSaltB64,
      });

      pageResults.push({ id: page.id, name: page.name, category: page.category });

      // Discover linked Instagram Business account
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v22.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(page.access_token)}`
        );
        const igData = await igRes.json();
        const igAccount = igData?.instagram_business_account;
        if (igAccount?.id) {
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
      token_refreshed: freshToken !== userToken,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook refresh error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
