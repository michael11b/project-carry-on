import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Layers, MoreHorizontal, Loader2, Pencil, Archive, ArchiveRestore,
  FolderOpen, Calendar,
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Workspace = Tables<"workspaces">;

export default function Workspaces() {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename dialog
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [renaming, setRenaming] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id);

    if (!memberships?.length) { setLoading(false); return; }

    const firstOrgId = memberships[0].org_id;
    setOrgId(firstOrgId);

    const { data } = await supabase
      .from("workspaces")
      .select("*")
      .eq("org_id", firstOrgId)
      .order("created_at", { ascending: true });

    setWorkspaces(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  const handleCreate = async () => {
    if (!createName.trim() || !orgId) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("workspaces").insert({
        name: createName.trim(),
        description: createDesc.trim() || null,
        org_id: orgId,
      });
      if (error) throw error;
      toast({ title: "Workspace created", description: `"${createName.trim()}" is ready.` });
      setCreateName("");
      setCreateDesc("");
      setCreateOpen(false);
      fetchWorkspaces();
    } catch (e) {
      toast({ title: "Failed to create", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openRename = (ws: Workspace) => {
    setRenameId(ws.id);
    setRenameName(ws.name);
    setRenameDesc(ws.description || "");
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!renameName.trim() || !renameId) return;
    setRenaming(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: renameName.trim(), description: renameDesc.trim() || null })
        .eq("id", renameId);
      if (error) throw error;
      toast({ title: "Workspace updated" });
      setRenameOpen(false);
      fetchWorkspaces();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRenaming(false);
    }
  };

  const handleToggleArchive = async (ws: Workspace) => {
    const newArchived = !ws.archived;
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ archived: newArchived })
        .eq("id", ws.id);
      if (error) throw error;
      toast({ title: newArchived ? "Workspace archived" : "Workspace restored" });
      fetchWorkspaces();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const active = workspaces.filter((w) => !w.archived);
  const archived = workspaces.filter((w) => w.archived);
  const displayed = showArchived ? archived : active;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Manage your client workspaces and projects.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>Organize brands and content under a workspace.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. Acme Corp"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="What is this workspace for?"
                  className="resize-none"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  disabled={creating}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !createName.trim()} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Tabs for active / archived */}
      <div className="flex items-center gap-2">
        <Button
          variant={!showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived(false)}
          className="gap-1.5"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Active ({active.length})
        </Button>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived(true)}
          className="gap-1.5"
        >
          <Archive className="h-3.5 w-3.5" />
          Archived ({archived.length})
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-lg font-medium">
              {showArchived ? "No archived workspaces" : "No active workspaces"}
            </p>
            <p className="text-sm mt-1">
              {showArchived
                ? "Archived workspaces will appear here."
                : "Create your first workspace to organize brands and content."}
            </p>
            {!showArchived && (
              <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Workspace
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((ws, i) => (
            <motion.div
              key={ws.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="group relative hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{ws.name}</CardTitle>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openRename(ws)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleArchive(ws)}>
                          {ws.archived ? (
                            <>
                              <ArchiveRestore className="mr-2 h-4 w-4" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {ws.description && (
                    <CardDescription className="line-clamp-2 text-xs mb-3">
                      {ws.description}
                    </CardDescription>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Created {new Date(ws.created_at).toLocaleDateString()}
                    {ws.archived && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">Archived</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
            <DialogDescription>Update the workspace name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} disabled={renaming} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea className="resize-none" value={renameDesc} onChange={(e) => setRenameDesc(e.target.value)} disabled={renaming} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renaming}>Cancel</Button>
            <Button onClick={handleRename} disabled={renaming || !renameName.trim()} className="gap-2">
              {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              {renaming ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
