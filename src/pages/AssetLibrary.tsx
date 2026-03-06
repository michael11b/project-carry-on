import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Upload } from "lucide-react";
import { motion } from "framer-motion";

export default function AssetLibrary() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Asset Library</h1>
          <p className="text-muted-foreground mt-1">Browse and manage all generated content.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </motion.div>

      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-lg font-medium">No assets yet</p>
          <p className="text-sm mt-1">Generated text, images, and audio will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
