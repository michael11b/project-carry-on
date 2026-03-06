import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Building2, CreditCard, Shield, Loader2, Save, Check, Zap, FileText, ImageIcon, Languages, Users,
  AlertTriangle, Lock, Mail, Plug,
} from "lucide-react";
import FacebookIntegrationCard from "@/components/FacebookIntegrationCard";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function SettingsPage() {
  const { toast } = useToast();

  // Org state
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [savingOrg, setSavingOrg] = useState(false);

  // User prefs (local)
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [autoSave, setAutoSave] = useState(true);

  // Stats
  const [memberCount, setMemberCount] = useState(0);
  const [brandCount, setBrandCount] = useState(0);
  const [workspaceCount, setWorkspaceCount] = useState(0);

  const fetchOrgData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoadingOrg(false); return; }

    const firstOrgId = memberships[0].org_id;
    setOrgId(firstOrgId);

    // Fetch org, members count, brands count, workspaces count in parallel
    const [orgResult, membersResult, brandsResult, workspacesResult] = await Promise.all([
      supabase.from("organizations").select("name, slug").eq("id", firstOrgId).single(),
      supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("org_id", firstOrgId),
      supabase.from("brands").select("id", { count: "exact", head: true }).eq("org_id", firstOrgId),
      supabase.from("workspaces").select("id", { count: "exact", head: true }).eq("org_id", firstOrgId).eq("archived", false),
    ]);

    if (orgResult.data) {
      setOrgName(orgResult.data.name);
      setOrgSlug(orgResult.data.slug);
    }
    setMemberCount(membersResult.count || 0);
    setBrandCount(brandsResult.count || 0);
    setWorkspaceCount(workspacesResult.count || 0);
    setLoadingOrg(false);
  }, []);

  useEffect(() => { fetchOrgData(); }, [fetchOrgData]);

  const handleSaveOrg = async () => {
    if (!orgId || !orgName.trim()) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: orgName.trim() })
        .eq("id", orgId);
      if (error) throw error;
      toast({ title: "Organization updated" });
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingOrg(false);
    }
  };

  // Usage mock data
  const usageData = {
    textGenerations: { used: 847, limit: 5000 },
    imageGenerations: { used: 124, limit: 500 },
    translations: { used: 63, limit: 1000 },
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Organization settings, usage, and billing.</p>
      </motion.div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Building2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Zap className="h-4 w-4" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Usage & Billing
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* ── General ── */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Organization Details</CardTitle>
              <CardDescription>Update your organization name and settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingOrg ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Organization Name</Label>
                      <Input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        disabled={savingOrg}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Slug</Label>
                      <Input value={orgSlug} disabled className="bg-muted" />
                      <p className="text-xs text-muted-foreground">Auto-generated, cannot be changed.</p>
                    </div>
                  </div>
                  <Button onClick={handleSaveOrg} disabled={savingOrg || !orgName.trim()} className="gap-2">
                    {savingOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingOrg ? "Saving…" : "Save Changes"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Organization Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{memberCount}</p>
                    <p className="text-xs text-muted-foreground">Members</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Building2 className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{workspaceCount}</p>
                    <p className="text-xs text-muted-foreground">Workspaces</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Zap className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{brandCount}</p>
                    <p className="text-xs text-muted-foreground">Brands</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Preferences ── */}
        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">User Preferences</CardTitle>
              <CardDescription>Customize your experience.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Email Notifications</Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">Receive email updates about scheduled posts and team activity.</p>
                </div>
                <Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Save className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Auto-save to Library</Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">Automatically save generated content to your Asset Library.</p>
                </div>
                <Switch checked={autoSave} onCheckedChange={setAutoSave} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Usage & Billing ── */}
        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Current Plan</CardTitle>
              <CardDescription>You're on the Agency Pro plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-primary/5">
                <div>
                  <p className="font-display font-semibold text-lg">Agency Pro</p>
                  <p className="text-sm text-muted-foreground">Unlimited team members · 5,000 text generations · 500 images</p>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <Check className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>
              <Button variant="outline" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Manage Billing
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Usage This Month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Text Generations</span>
                  </div>
                  <span className="text-muted-foreground">
                    {usageData.textGenerations.used.toLocaleString()} / {usageData.textGenerations.limit.toLocaleString()}
                  </span>
                </div>
                <Progress value={(usageData.textGenerations.used / usageData.textGenerations.limit) * 100} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span>Image Generations</span>
                  </div>
                  <span className="text-muted-foreground">
                    {usageData.imageGenerations.used} / {usageData.imageGenerations.limit}
                  </span>
                </div>
                <Progress value={(usageData.imageGenerations.used / usageData.imageGenerations.limit) * 100} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4 text-muted-foreground" />
                    <span>Translations</span>
                  </div>
                  <span className="text-muted-foreground">
                    {usageData.translations.used} / {usageData.translations.limit}
                  </span>
                </div>
                <Progress value={(usageData.translations.used / usageData.translations.limit) * 100} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Security Settings</CardTitle>
              <CardDescription>Manage authentication and access controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Add an extra layer of security to your account.</p>
                  </div>
                </div>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Session Management</p>
                    <p className="text-xs text-muted-foreground">View and manage active sessions across devices.</p>
                  </div>
                </div>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Audit Log</p>
                    <p className="text-xs text-muted-foreground">Track all team actions and changes.</p>
                  </div>
                </div>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="font-display text-lg text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Delete Organization</p>
                  <p className="text-xs text-muted-foreground">Permanently delete this organization and all its data.</p>
                </div>
                <Button variant="destructive" size="sm" disabled>Delete Organization</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
