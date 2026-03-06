import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    // Client to verify the caller
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { email, orgId, role } = await req.json();

    if (!email || !orgId || !role) {
      throw new Error("Missing required fields: email, orgId, role");
    }

    const validRoles = ["owner", "admin", "editor", "viewer", "client_reviewer"];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller has owner/admin role in the org
    const { data: hasPermission } = await supabaseAdmin.rpc("has_any_role", {
      _user_id: user.id,
      _org_id: orgId,
      _roles: ["owner", "admin"],
    });

    if (!hasPermission) {
      throw new Error("You don't have permission to invite members to this organization");
    }

    // Check if user exists by email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const targetUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: "No account found with that email. They must sign up first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already a member
    const { data: existingMember } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", targetUser.id)
      .maybeSingle();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: "This user is already a member of this organization." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add member to org
    const { error: memberError } = await supabaseAdmin
      .from("organization_members")
      .insert({ org_id: orgId, user_id: targetUser.id });

    if (memberError) throw memberError;

    // Assign role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: targetUser.id, org_id: orgId, role });

    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ success: true, userId: targetUser.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
