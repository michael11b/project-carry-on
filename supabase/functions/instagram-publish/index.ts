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

async function waitForIgMediaReady(igUserId: string, creationId: string, token: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    const data = await res.json();
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new Error("Instagram media processing failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Instagram media processing timed out");
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
    if (post.published_fb_id) throw new Error("Post already published");
    if (!post.instagram_account_id) throw new Error("No Instagram account selected for this post");

    // Fetch the IG account to get the linked facebook_page_id
    const { data: igAccount, error: igErr } = await supabase
      .from("instagram_accounts")
      .select("ig_user_id, facebook_page_id")
      .eq("org_id", post.org_id)
      .eq("ig_user_id", post.instagram_account_id)
      .single();

    if (igErr || !igAccount) throw new Error("Instagram account not found");

    // Fetch the encrypted page token for the linked Facebook page
    const { data: pageRow, error: pageErr } = await supabase
      .from("facebook_pages")
      .select("page_token_encrypted, page_token_iv, page_token_salt")
      .eq("org_id", post.org_id)
      .eq("page_id", igAccount.facebook_page_id)
      .single();

    if (pageErr || !pageRow) throw new Error("Linked Facebook page not found");
    if (!pageRow.page_token_encrypted || !pageRow.page_token_iv || !pageRow.page_token_salt) {
      throw new Error("Page token not properly encrypted. Please re-run setup.");
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

    const igUserId = igAccount.ig_user_id;
    const postType = post.post_type || "image";
    const caption = post.content || post.title;

    // Step 1: Create media container
    let containerBody: Record<string, string> = {
      caption,
      access_token: pageToken,
    };

    if (postType === "image") {
      if (!post.media_url) throw new Error("media_url is required for image posts");
      containerBody.image_url = post.media_url;
    } else if (postType === "reel" || postType === "video") {
      if (!post.media_url) throw new Error("media_url is required for reel/video posts");
      containerBody.video_url = post.media_url;
      containerBody.media_type = "REELS";
    } else {
      throw new Error(`Instagram does not support post type: ${postType}. Use image or reel.`);
    }

    const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerBody),
    });
    const containerData = await containerRes.json();

    if (containerData.error) {
      throw new Error(`Instagram container error: ${containerData.error.message}`);
    }

    const creationId = containerData.id;
    if (!creationId) throw new Error("No creation_id returned from Instagram");

    // Step 2: Wait for media processing (for videos/reels)
    if (postType === "reel" || postType === "video") {
      await waitForIgMediaReady(igUserId, creationId, pageToken);
    }

    // Step 3: Publish
    const publishRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: pageToken,
      }),
    });
    const publishData = await publishRes.json();

    if (publishData.error) {
      await supabase
        .from("scheduled_posts")
        .update({ publish_error: publishData.error.message })
        .eq("id", post_id);
      throw new Error(`Instagram publish error: ${publishData.error.message}`);
    }

    const igPostId = publishData.id;
    await supabase
      .from("scheduled_posts")
      .update({
        published_fb_id: igPostId,
        publish_error: null,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", post_id);

    return new Response(JSON.stringify({ success: true, ig_id: igPostId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Instagram publish error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
