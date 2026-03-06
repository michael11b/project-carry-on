import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Image, Volume2, Languages, TrendingUp, FileText, Zap, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const quickActions = [
  { title: "Generate Text", description: "Posts, captions, ad copy", icon: FileText, color: "text-primary", path: "/studio" },
  { title: "Generate Image", description: "Brand visuals & creatives", icon: Image, color: "text-accent", path: "/studio" },
  { title: "Text to Speech", description: "Voiceovers & narration", icon: Volume2, color: "text-warning", path: "/studio" },
  { title: "Translate", description: "Multi-language content", icon: Languages, color: "text-info", path: "/studio" },
];

const stats = [
  { label: "Content Generated", value: "1,847", change: "+12%", icon: Sparkles },
  { label: "Active Brands", value: "6", change: "+2", icon: Zap },
  { label: "This Month", value: "342", change: "+28%", icon: TrendingUp },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back. Here's what's happening.</p>
          </div>
          <Button onClick={() => navigate("/studio")} className="gap-2">
            <Sparkles className="h-4 w-4" />
            New Content
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-display font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <p className="text-xs text-success mt-2 font-medium">{stat.change} from last period</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, i) => (
            <motion.div key={action.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
              <Card
                className="cursor-pointer hover:shadow-md hover:border-primary/20 transition-all group"
                onClick={() => navigate(action.path)}
              >
                <CardContent className="p-5">
                  <action.icon className={`h-8 w-8 ${action.color} mb-3`} />
                  <h3 className="font-semibold">{action.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground mt-3 group-hover:translate-x-1 transition-transform" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4">Recent Activity</h2>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            <p>No activity yet. Start by generating your first content!</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/studio")}>
              Go to Content Studio
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
