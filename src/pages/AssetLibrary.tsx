import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderOpen, Search, FileText, ImageIcon, Trash2, Loader2, Copy, Check, Download, Calendar, X,
} from "lucide-react";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Asset {
  id: string;
  org_id: string;
  created_by: string;
  type: "text" | "image";
  title: string;
  content: string;
  metadata: Record<string, string> | null;
  created_at: string;
}

export default function AssetLibrary() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  const fetchAssets = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const orgIds = memberships.map((m) => m.org_id);

    let query = supabase
      .from("assets")
      .select("*")
      .in("org_id", orgIds)
      .order("created_at", { ascending: false });

    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data } = await query;
    setAssets((data as Asset[]) || []);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const filtered = assets.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      (a.metadata?.channel || "").toLowerCase().includes(q) ||
      (a.metadata?.brand || "").toLowerCase().includes(q)
    );
  });

  const handleCopy = async (asset: Asset) => {
    await navigator.clipboard.writeText(asset.content);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`Delete "${asset.title}"?`)) return;
    try {
      const { error } = await supabase.from("assets").delete().eq("id", asset.id);
      if (error) throw error;
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast({ title: "Asset deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDownload = (asset: Asset) => {
    const a = document.createElement("a");
    a.href = asset.content;
    a.download = `${asset.title}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold tracking-tight">Asset Library</h1>
        <p className="text-muted-foreground mt-1">Browse and manage your saved content.</p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="image">Images</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-lg font-medium">
              {assets.length === 0 ? "No saved assets yet" : "No matching assets"}
            </p>
            <p className="text-sm mt-1">
              {assets.length === 0
                ? "Generate content in the Studio and save it to your library."
                : "Try adjusting your search or filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((asset, i) => (
            <motion.div
              key={asset.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card
                className="group cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                onClick={() => setPreviewAsset(asset)}
              >
                {asset.type === "image" ? (
                  <div className="aspect-video bg-muted overflow-hidden">
                    <img
                      src={asset.content}
                      alt={asset.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted/30 p-4 overflow-hidden">
                    <p className="text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap">
                      {asset.content}
                    </p>
                  </div>
                )}
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm truncate flex-1">{asset.title}</p>
                    <Badge variant="secondary" className="shrink-0 text-[10px] gap-1">
                      {asset.type === "text" ? (
                        <FileText className="h-3 w-3" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      {asset.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {asset.metadata?.channel && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {asset.metadata.channel}
                      </Badge>
                    )}
                    {asset.metadata?.brand && (
                      <Badge variant="outline" className="text-[10px]">
                        {asset.metadata.brand}
                      </Badge>
                    )}
                    {asset.metadata?.platform && (
                      <Badge variant="outline" className="text-[10px]">
                        {asset.metadata.platform}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(asset.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {asset.type === "text" ? (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); handleCopy(asset); }}
                        >
                          {copiedId === asset.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); handleDownload(asset); }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(asset); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
        <DialogContent className="max-w-2xl">
          {previewAsset && (
            <>
              <DialogHeader>
                <DialogTitle>{previewAsset.title}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 pt-1">
                  <Badge variant="secondary" className="text-xs gap-1 capitalize">
                    {previewAsset.type === "text" ? <FileText className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                    {previewAsset.type}
                  </Badge>
                  {previewAsset.metadata?.channel && (
                    <Badge variant="outline" className="text-xs capitalize">{previewAsset.metadata.channel}</Badge>
                  )}
                  {previewAsset.metadata?.brand && (
                    <Badge variant="outline" className="text-xs">{previewAsset.metadata.brand}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(previewAsset.created_at).toLocaleString()}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                {previewAsset.type === "image" ? (
                  <img
                    src={previewAsset.content}
                    alt={previewAsset.title}
                    className="w-full rounded-md border border-border object-contain max-h-[500px]"
                  />
                ) : (
                  <ScrollArea className="max-h-[400px]">
                    <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                      {previewAsset.content}
                    </div>
                  </ScrollArea>
                )}
              </div>
              <DialogFooter>
                {previewAsset.type === "text" ? (
                  <Button variant="outline" className="gap-1.5" onClick={() => handleCopy(previewAsset)}>
                    {copiedId === previewAsset.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === previewAsset.id ? "Copied" : "Copy Text"}
                  </Button>
                ) : (
                  <Button variant="outline" className="gap-1.5" onClick={() => handleDownload(previewAsset)}>
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                )}
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => { handleDelete(previewAsset); setPreviewAsset(null); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
