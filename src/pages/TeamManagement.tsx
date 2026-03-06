import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserPlus, Loader2, Shield, Crown, Pencil, Eye, UserCheck, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface TeamMember {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email?: string;
  role: AppRole;
  joinedAt: string;
}

const ROLE_CONFIG: Record<AppRole, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: "Owner", icon: Crown, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  admin: { label: "Admin", icon: Shield, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  editor: { label: "Editor", icon: Pencil, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  viewer: { label: "Viewer", icon: Eye, color: "bg-muted text-muted-foreground" },
  client_reviewer: { label: "Client Reviewer", icon: UserCheck, color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
};

const ASSIGNABLE_ROLES: AppRole[] = ["admin", "editor", "viewer", "client_reviewer"];

export default function TeamManagement() {
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<AppRole | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("editor");
  const [inviting, setInviting] = useState(false);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const fetchMembers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const firstOrgId = memberships[0].org_id;
    setOrgId(firstOrgId);

    // Get all members of this org
    const { data: orgMembers } = await supabase
      .from("organization_members")
      .select("user_id, created_at")
      .eq("org_id", firstOrgId);

    if (!orgMembers?.length) { setLoading(false); return; }

    const userIds = orgMembers.map((m) => m.user_id);

    // Fetch profiles and roles in parallel
    const [profilesResult, rolesResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds),
      supabase.from("user_roles").select("user_id, role").eq("org_id", firstOrgId).in("user_id", userIds),
    ]);

    const profilesMap = new Map(
      (profilesResult.data || []).map((p) => [p.id, p])
    );
    const rolesMap = new Map(
      (rolesResult.data || []).map((r) => [r.user_id, r.role as AppRole])
    );

    // Set current user's role
    setCurrentUserRole(rolesMap.get(user.id) || null);

    const teamMembers: TeamMember[] = orgMembers.map((m) => {
      const profile = profilesMap.get(m.user_id);
      return {
        userId: m.user_id,
        fullName: profile?.full_name || null,
        avatarUrl: profile?.avatar_url || null,
        role: rolesMap.get(m.user_id) || "viewer",
        joinedAt: m.created_at,
      };
    });

    // Sort: owner first, then admin, then others
    const roleOrder: Record<AppRole, number> = { owner: 0, admin: 1, editor: 2, viewer: 3, client_reviewer: 4 };
    teamMembers.sort((a, b) => (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5));

    setMembers(teamMembers);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return;

    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: { email: inviteEmail.trim(), orgId, role: inviteRole },
      });

      if (error) {
        // Try to parse the error context for a user-friendly message
        let msg = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) msg = ctx.error;
        } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      toast({ title: "Member invited!", description: `${inviteEmail} has been added as ${ROLE_CONFIG[inviteRole].label}.` });
      setInviteEmail("");
      setInviteRole("editor");
      setInviteOpen(false);
      fetchMembers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to invite member";
      toast({ title: "Invite failed", description: msg, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    if (!orgId) return;
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId)
        .eq("org_id", orgId);

      if (error) throw error;

      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
      );
      toast({ title: "Role updated", description: `Role changed to ${ROLE_CONFIG[newRole].label}.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update role";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    }
  };

  const handleRemoveMember = async (userId: string, name: string | null) => {
    if (!orgId) return;
    if (!confirm(`Remove ${name || "this member"} from the organization?`)) return;

    try {
      // Delete role first, then membership
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("org_id", orgId);
      const { error } = await supabase.from("organization_members").delete().eq("user_id", userId).eq("org_id", orgId);
      if (error) throw error;

      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      toast({ title: "Member removed" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to remove member";
      toast({ title: "Removal failed", description: msg, variant: "destructive" });
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground mt-1">Invite members and manage roles & permissions.</p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a Team Member</DialogTitle>
                <DialogDescription>
                  Enter their email address. They must already have an account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={inviting}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)} disabled={inviting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((r) => {
                        const config = ROLE_CONFIG[r];
                        return (
                          <SelectItem key={r} value={r}>
                            <div className="flex items-center gap-2">
                              <config.icon className="h-3.5 w-3.5" />
                              {config.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="gap-2">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {inviting ? "Inviting…" : "Send Invite"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-medium">No team members yet</p>
              <p className="text-sm mt-1">Invite your team to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.map((member) => {
                const roleConfig = ROLE_CONFIG[member.role];
                const RoleIcon = roleConfig.icon;
                const isOwner = member.role === "owner";

                return (
                  <motion.div
                    key={member.userId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatarUrl || undefined} />
                        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                          {getInitials(member.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{member.fullName || "Unnamed User"}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canManage && !isOwner ? (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleRoleChange(member.userId, v as AppRole)}
                          >
                            <SelectTrigger className="w-[150px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.map((r) => {
                                const c = ROLE_CONFIG[r];
                                return (
                                  <SelectItem key={r} value={r}>
                                    <div className="flex items-center gap-2">
                                      <c.icon className="h-3.5 w-3.5" />
                                      {c.label}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveMember(member.userId, member.fullName)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Badge variant="secondary" className={`gap-1.5 ${roleConfig.color}`}>
                          <RoleIcon className="h-3 w-3" />
                          {roleConfig.label}
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
