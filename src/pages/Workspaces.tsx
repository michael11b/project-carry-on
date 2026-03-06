import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Layers, MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";

export default function Workspaces() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Manage your client workspaces and projects.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Workspace
        </Button>
      </motion.div>

      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-lg font-medium">No workspaces yet</p>
          <p className="text-sm mt-1">Create your first workspace to organize brands and content.</p>
          <Button className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Create Workspace
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
