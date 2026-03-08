import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    ["decrypt"]
  );
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptValue(encrypted: string, ivB64: string, saltB64: string, password: string): Promise<string> {
  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(encrypted);
  const key = await deriveKey(password, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuffer);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { post_id, encryption_password } = await req.json();
    if (!post_id) throw new Error("post_id is required");

    const password = encryption_password || Deno.env.get("FB_ENCRYPTION_PASSWORD");
    if (!password) throw new Error("Encryption password is required");

    // Fetch the post
    const { data: post, error: postErr } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postErr || !post) throw new Error("Post not found");
    if (!post.published_fb_id) throw new Error("Post has not been published to Facebook yet");
    if (!post.facebook_page_id) throw new Error("No Facebook page associated with this post");

    // Fetch encrypted page token
    const { data: pageRow, error: pageErr } = await supabase
      .from("facebook_pages")
      .select("page_token_encrypted, page_token_iv, page_token_salt")
      .eq("org_id", post.org_id)
      .eq("page_id", post.facebook_page_id)
      .single();

    if (pageErr || !pageRow) throw new Error("Facebook page not found in database");
    if (!pageRow.page_token_encrypted || !pageRow.page_token_iv || !pageRow.page_token_salt) {
      throw new Error("Page token not properly encrypted. Please re-run Facebook setup.");
    }

    let pageToken: string;
    try {
      pageToken = await decryptValue(
        pageRow.page_token_encrypted,
        pageRow.page_token_iv,
        pageRow.page_token_salt,
        password
      );
    } catch {
      throw new Error("Failed to decrypt page token. Wrong encryption password?");
    }

    // Facebook Graph API DELETE: /{post-id}
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${post.published_fb_id}?access_token=${encodeURIComponent(pageToken)}`,
      { method: "DELETE" }
    );
    const fbResult = await res.json();

    if (fbResult.error) {
      // Return the error but don't block local deletion
      return new Response(JSON.stringify({
        success: false,
        fb_error: fbResult.error.message,
        message: "Failed to delete from Facebook, but you can still remove it locally."
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook delete error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
