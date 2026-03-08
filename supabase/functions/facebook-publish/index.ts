import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- AES-256-GCM Decryption Helpers ---
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

    // Determine encryption password: from request body or from server secret (for cron)
    const password = encryption_password || Deno.env.get("FB_ENCRYPTION_PASSWORD");
    if (!password) throw new Error("Encryption password is required");

    // Fetch the post
    const { data: post, error: postErr } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postErr || !post) throw new Error("Post not found");
    if (post.published_fb_id) throw new Error("Post already published to Facebook");
    if (!post.facebook_page_id) throw new Error("No Facebook page selected for this post");

    // Fetch the encrypted page token from DB
    const { data: pageRow, error: pageErr } = await supabase
      .from("facebook_pages")
      .select("page_token_encrypted, page_token_iv, page_token_salt")
      .eq("org_id", post.org_id)
      .eq("page_id", post.facebook_page_id)
      .single();

    if (pageErr || !pageRow) throw new Error(`Facebook page ${post.facebook_page_id} not found in database`);
    if (!pageRow.page_token_encrypted || !pageRow.page_token_iv || !pageRow.page_token_salt) {
      throw new Error("Page token not properly encrypted in database. Please re-run Facebook setup.");
    }

    // Decrypt the page token
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

    const pageId = post.facebook_page_id;
    const postType = post.post_type || "text";
    let fbResult: any;

    // Use title as caption (content may contain AI preamble text)
    const caption = post.title || post.content || "";

    // Validate media_url is a proper HTTP URL (not base64)
    if (postType !== "text" && post.media_url) {
      if (!post.media_url.startsWith("http")) {
        throw new Error("media_url must be an HTTP(S) URL, not a data URL");
      }
    }

    if (postType === "text") {
      const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption,
          access_token: pageToken,
        }),
      });
      fbResult = await res.json();
    } else if (postType === "image") {
      if (!post.media_url) throw new Error("media_url is required for image posts");
      const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: post.media_url,
          caption: caption,
          published: true,
          access_token: pageToken,
        }),
      });
      fbResult = await res.json();
    } else if (postType === "video" || postType === "reel") {
      if (!post.media_url) throw new Error("media_url is required for video/reel posts");
      const endpoint = postType === "reel"
        ? `https://graph.facebook.com/v22.0/${pageId}/video_reels`
        : `https://graph.facebook.com/v22.0/${pageId}/videos`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: post.media_url,
          description: caption,
          published: true,
          access_token: pageToken,
        }),
      });
      fbResult = await res.json();
    } else {
      throw new Error(`Unknown post type: ${postType}`);
    }

    if (fbResult.error) {
      await supabase
        .from("scheduled_posts")
        .update({ publish_error: fbResult.error.message })
        .eq("id", post_id);
      throw new Error(`Facebook publish error: ${fbResult.error.message}`);
    }

    const fbId = fbResult.id || fbResult.post_id || JSON.stringify(fbResult);
    await supabase
      .from("scheduled_posts")
      .update({
        published_fb_id: fbId,
        publish_error: null,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", post_id);

    return new Response(JSON.stringify({ success: true, fb_id: fbId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook publish error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
