import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, Plus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import BrandEditor from "@/components/BrandEditor";
import type { Tables } from "@/integrations/supabase/types";

type Brand = Tables<"brands">;

interface ColorsJson {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

interface VoiceProfileJson {
  tone?: string;
}

export default function BrandKit() {
  const { user } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1);

    const oid = memberships?.[0]?.org_id;
    if (!oid) { setLoading(false); return; }
    setOrgId(oid);

    const [brandsRes, wsRes] = await Promise.all([
      supabase.from("brands").select("*").eq("org_id", oid).order("created_at", { ascending: false }),
      supabase.from("workspaces").select("id").eq("org_id", oid).eq("archived", false).limit(1),
    ]);

    setBrands(brandsRes.data ?? []);
    setWorkspaceId(wsRes.data?.[0]?.id ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => { setEditingBrand(null); setEditorOpen(true); };
  const openEdit = (b: Brand) => { setEditingBrand(b); setEditorOpen(true); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Brand Kit</h1>
          <p className="text-muted-foreground mt-1">Define brand identity: logos, colors, voice, and guidelines.</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Brand
        </Button>
      </motion.div>

      {brands.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Palette className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-lg font-medium">No brands configured</p>
            <p className="text-sm mt-1">Set up your first brand kit with logo, colors, tone, and voice profile.</p>
            <Button className="mt-4 gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create Brand
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => {
            const c = (brand.colors as ColorsJson) ?? {};
            const vp = (brand.voice_profile as VoiceProfileJson) ?? {};
            const swatches = [c.primary, c.secondary, c.accent, c.background, c.text].filter(Boolean);

            return (
              <motion.div key={brand.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card
                  className="cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => openEdit(brand)}
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt={brand.name} className="h-10 w-10 rounded-md object-contain border bg-muted" />
                      ) : (
                        <div className="h-10 w-10 rounded-md border bg-muted flex items-center justify-center">
                          <Palette className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{brand.name}</p>
                        {vp.tone && <Badge variant="secondary" className="text-[10px] mt-0.5">{vp.tone}</Badge>}
                      </div>
                    </div>

                    {swatches.length > 0 && (
                      <div className="flex gap-1.5">
                        {swatches.map((hex, i) => (
                          <div key={i} className="h-6 w-6 rounded-full border" style={{ backgroundColor: hex }} title={hex} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {orgId && workspaceId && (
        <BrandEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          brand={editingBrand}
          orgId={orgId}
          workspaceId={workspaceId}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
