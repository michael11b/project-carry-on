import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FacebookPage {
  id: string;
  name: string;
  category?: string;
}

export default function FacebookIntegrationCard() {
  const { toast } = useToast();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-pages");
      if (error) throw error;
      if (data?.error) {
        if (data.error.includes("not configured")) {
          setTokenConfigured(false);
          setPages([]);
          return;
        }
        throw new Error(data.error);
      }
      setTokenConfigured(true);
      setPages(data?.pages || []);
    } catch (e) {
      console.error("Failed to fetch FB pages:", e);
      toast({ title: "Failed to load pages", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-lg">Facebook Integration</CardTitle>
            <CardDescription>Connect your Facebook Pages to publish content directly.</CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={
              tokenConfigured === true
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : tokenConfigured === false
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            }
          >
            {tokenConfigured === true ? "Connected" : tokenConfigured === false ? "Not Configured" : "Checking…"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tokenConfigured === false && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-300">
            Your Facebook Page Access Token is not configured. Please contact your administrator to set it up in the backend secrets.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pages.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Connected Pages</p>
            {pages.map((page) => (
              <div key={page.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                  {page.category && (
                    <p className="text-xs text-muted-foreground">{page.category}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">Active</Badge>
              </div>
            ))}
          </div>
        ) : tokenConfigured === true ? (
          <p className="text-sm text-muted-foreground py-2">No Facebook Pages found for this token.</p>
        ) : null}

        <Button variant="outline" size="sm" className="gap-2" onClick={fetchPages} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Pages
        </Button>
      </CardContent>
    </Card>
  );
}
