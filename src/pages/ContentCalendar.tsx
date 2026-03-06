import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { motion } from "framer-motion";

export default function ContentCalendar() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold tracking-tight">Content Calendar</h1>
        <p className="text-muted-foreground mt-1">Schedule and visualize content by date and channel.</p>
      </motion.div>

      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-lg font-medium">Calendar coming soon</p>
          <p className="text-sm mt-1">Schedule content across channels with a visual calendar.</p>
        </CardContent>
      </Card>
    </div>
  );
}
