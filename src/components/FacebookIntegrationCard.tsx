import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Trash2, Shield, Eye, EyeOff, AlertTriangle, Clock, Instagram } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FacebookPage {
  id: string;
  name: string;
}

interface InstagramAccount {
  ig_user_id: string;
  ig_username: string;
  facebook_page_id: string;
}

export default function FacebookIntegrationCard({ orgId }: { orgId?: string }) {
  const { toast } = useToast();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [igAccounts, setIgAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState<number | null>(null);
  const [tokenExchangedAt, setTokenExchangedAt] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  // Setup form fields
  const [shortLivedToken, setShortLivedToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [refreshPassword, setRefreshPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const fetchPages = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-pages", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConnected(data?.connected ?? false);
      setPages(data?.pages || []);
      setIgAccounts(data?.instagram_accounts || []);
      setDaysUntilExpiry(data?.days_until_expiry ?? null);
      setTokenExchangedAt(data?.token_exchanged_at ?? null);
    } catch (e) {
      console.error("Failed to fetch FB pages:", e);
      toast({ title: "Failed to load pages", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, orgId]);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const handleSetup = async () => {
    if (!orgId) {
      toast({ title: "Error", description: "Organization not found", variant: "destructive" });
      return;
    }
    if (encryptionPassword !== confirmPassword) {
      toast({ title: "Password mismatch", description: "Encryption passwords do not match.", variant: "destructive" });
      return;
    }
    if (encryptionPassword.length < 8) {
      toast({ title: "Weak password", description: "Encryption password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (!shortLivedToken || !appId || !appSecret) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setSetupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-setup", {
        body: {
          short_lived_token: shortLivedToken,
          app_id: appId,
          app_secret: appSecret,
          encryption_password: encryptionPassword,
          org_id: orgId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Facebook connected!",
        description: `Successfully connected ${data.pages?.length || 0} page(s).`,
      });

      // Clear form
      setShortLivedToken("");
      setAppId("");
      setAppSecret("");
      setEncryptionPassword("");
      setConfirmPassword("");
      setShowSetup(false);

      // Refresh pages
      await fetchPages();
    } catch (e) {
      console.error("Facebook setup error:", e);
      toast({ title: "Setup failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSetupLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!orgId) return;
    if (!refreshPassword || refreshPassword.length < 8) {
      toast({ title: "Password required", description: "Enter your encryption password (min 8 chars).", variant: "destructive" });
      return;
    }
    setRefreshLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-refresh", {
        body: { org_id: orgId, encryption_password: refreshPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: data.token_refreshed ? "Tokens refreshed!" : "Pages refreshed!",
        description: `${data.pages?.length || 0} page(s) updated.${data.token_refreshed ? " User token extended for 60 more days." : ""}`,
      });
      setRefreshPassword("");
      setShowRefresh(false);
      await fetchPages();
    } catch (e) {
      toast({ title: "Refresh failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      await supabase.from("facebook_credentials").delete().eq("org_id", orgId);
      await supabase.from("facebook_pages").delete().eq("org_id", orgId);
      await supabase.from("instagram_accounts").delete().eq("org_id", orgId);
      setConnected(false);
      setPages([]);
      setIgAccounts([]);
      toast({ title: "Disconnected", description: "Facebook & Instagram integration removed." });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-lg">Facebook & Instagram</CardTitle>
            <CardDescription>Connect your Facebook Pages and linked Instagram accounts to publish content directly.</CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={
              connected === true
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : connected === false
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            }
          >
            {connected === true ? "Connected" : connected === false ? "Not Connected" : "Checking…"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected: Show pages */}
        {connected === true && pages.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Connected Pages</p>
            {pages.map((page) => (
              <div key={page.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                </div>
                <Badge variant="outline" className="text-xs">Active</Badge>
              </div>
            ))}
          </div>
        )}

        {/* Instagram accounts */}
        {connected === true && igAccounts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Instagram className="h-4 w-4" /> Linked Instagram Accounts
            </p>
            {igAccounts.map((ig) => (
              <div key={ig.ig_user_id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">@{ig.ig_username || ig.ig_user_id}</p>
                  <p className="text-xs text-muted-foreground">ID: {ig.ig_user_id}</p>
                </div>
                <Badge variant="outline" className="text-xs">Active</Badge>
              </div>
            ))}
          </div>
        )}

        {connected === true && pages.length === 0 && igAccounts.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">Credentials stored but no pages or accounts found.</p>
        )}

        {/* Token expiry warning */}
        {connected === true && daysUntilExpiry !== null && (
          daysUntilExpiry <= 0 ? (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-sm">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">User token expired!</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Your long-lived user token has expired. Page tokens may still work, but you should reconnect to refresh everything.
                </p>
                <Button size="sm" variant="destructive" className="mt-2 gap-2" onClick={() => setShowSetup(true)}>
                  <Shield className="h-3.5 w-3.5" /> Reconnect Now
                </Button>
              </div>
            </div>
          ) : daysUntilExpiry <= 14 ? (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 text-sm">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Token expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Your long-lived user token will expire soon. Reconnect to refresh it.
                  {tokenExchangedAt && (
                    <span> Last exchanged: {new Date(tokenExchangedAt).toLocaleDateString()}</span>
                  )}
                </p>
                <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={() => setShowSetup(true)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh Token
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Token valid for {daysUntilExpiry} more days
              {tokenExchangedAt && (
                <span>· Exchanged {new Date(tokenExchangedAt).toLocaleDateString()}</span>
              )}
            </p>
          )
        )}

        {/* Not connected: Show setup prompt or form */}
        {connected === false && !showSetup && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-300">
              Connect your Facebook App to start publishing. You'll need your App ID, App Secret, and a short-lived user token from the Meta Developer Dashboard.
            </div>
            <Button onClick={() => setShowSetup(true)} className="gap-2">
              <Shield className="h-4 w-4" />
              Connect Facebook
            </Button>
          </div>
        )}

        {/* Setup Form */}
        {showSetup && (
          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
            <p className="text-sm font-medium">Facebook App Setup</p>
            <p className="text-xs text-muted-foreground">
              All credentials will be encrypted with your password using AES-256-GCM before storage. 
              Keep your encryption password safe — it's required for publishing.
            </p>

            <div className="space-y-2">
              <Label htmlFor="fb-app-id">Facebook App ID</Label>
              <Input
                id="fb-app-id"
                placeholder="Your Facebook App ID"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-app-secret">Facebook App Secret</Label>
              <div className="relative">
                <Input
                  id="fb-app-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="Your Facebook App Secret"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-token">Short-Lived User Token</Label>
              <div className="relative">
                <Input
                  id="fb-token"
                  type={showToken ? "text" : "password"}
                  placeholder="From Graph API Explorer or Login Flow"
                  value={shortLivedToken}
                  onChange={(e) => setShortLivedToken(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-enc-pass">Encryption Password</Label>
              <div className="relative">
                <Input
                  id="fb-enc-pass"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 characters — keep this safe!"
                  value={encryptionPassword}
                  onChange={(e) => setEncryptionPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-enc-pass-confirm">Confirm Encryption Password</Label>
              <Input
                id="fb-enc-pass-confirm"
                type="password"
                placeholder="Re-enter encryption password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSetup} disabled={setupLoading} className="gap-2">
                {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {setupLoading ? "Connecting…" : "Connect & Encrypt"}
              </Button>
              <Button variant="outline" onClick={() => setShowSetup(false)} disabled={setupLoading}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Refresh Tokens prompt */}
        {connected === true && showRefresh && (
          <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
            <p className="text-sm font-medium">Refresh Tokens</p>
            <p className="text-xs text-muted-foreground">
              Enter your encryption password to re-fetch page tokens from Facebook and extend your user token.
            </p>
            <div className="space-y-2">
              <Label htmlFor="fb-refresh-pass">Encryption Password</Label>
              <Input
                id="fb-refresh-pass"
                type="password"
                placeholder="Your encryption password"
                value={refreshPassword}
                onChange={(e) => setRefreshPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleRefresh} disabled={refreshLoading} size="sm" className="gap-2">
                {refreshLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {refreshLoading ? "Refreshing…" : "Refresh Tokens"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowRefresh(false); setRefreshPassword(""); }} disabled={refreshLoading}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchPages} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh List
          </Button>
          {connected === true && !showRefresh && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowRefresh(true)} disabled={loading}>
              <Shield className="h-4 w-4" />
              Refresh Tokens
            </Button>
          )}
          {connected === true && (
            <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={handleDisconnect} disabled={loading}>
              <Trash2 className="h-4 w-4" />
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
