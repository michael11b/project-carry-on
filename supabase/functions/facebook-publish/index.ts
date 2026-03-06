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
    const { post_id } = await req.json();
    if (!post_id) throw new Error("post_id is required");

    // Fetch the post
    const { data: post, error: postErr } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postErr || !post) throw new Error("Post not found");
    if (post.published_fb_id) throw new Error("Post already published to Facebook");
    if (!post.facebook_page_id) throw new Error("No Facebook page selected for this post");

    const FACEBOOK_PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
    if (!FACEBOOK_PAGE_ACCESS_TOKEN) throw new Error("Facebook token not configured");

    // Get page-specific access token
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(FACEBOOK_PAGE_ACCESS_TOKEN)}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(`Facebook API: ${pagesData.error.message}`);

    const page = (pagesData.data || []).find((p: any) => p.id === post.facebook_page_id);
    if (!page) throw new Error(`Facebook page ${post.facebook_page_id} not found or not accessible`);

    const pageToken = page.access_token;
    const pageId = post.facebook_page_id;
    const postType = post.post_type || "text";

    let fbResult: any;

    if (postType === "text") {
      // Text post
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: post.content || post.title,
          access_token: pageToken,
        }),
      });
      fbResult = await res.json();
    } else if (postType === "image") {
      // Image post
      if (!post.media_url) throw new Error("media_url is required for image posts");
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: post.media_url,
          caption: post.content || post.title,
          access_token: pageToken,
        }),
      });
      fbResult = await res.json();
    } else if (postType === "video" || postType === "reel") {
      // Video / Reel post
      if (!post.media_url) throw new Error("media_url is required for video/reel posts");
      const endpoint = postType === "reel"
        ? `https://graph.facebook.com/v21.0/${pageId}/video_reels`
        : `https://graph.facebook.com/v21.0/${pageId}/videos`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: post.media_url,
          description: post.content || post.title,
          access_token: pageToken,
        }),
      });
      fbResult = await res.json();
    } else {
      throw new Error(`Unknown post type: ${postType}`);
    }

    if (fbResult.error) {
      // Store error but don't crash
      await supabase
        .from("scheduled_posts")
        .update({ publish_error: fbResult.error.message })
        .eq("id", post_id);
      throw new Error(`Facebook publish error: ${fbResult.error.message}`);
    }

    // Success — update post
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
