import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus } from "lucide-react";
import { motion } from "framer-motion";

export default function TeamManagement() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground mt-1">Invite members and manage roles & permissions.</p>
        </div>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </motion.div>

      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-lg font-medium">No team members yet</p>
          <p className="text-sm mt-1">Invite your team and assign roles: Owner, Admin, Editor, Viewer, or Client Reviewer.</p>
          <Button className="mt-4 gap-2">
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
