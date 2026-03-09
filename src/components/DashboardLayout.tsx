import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, Search, Moon, Sun, LogOut, CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuthContext } from "@/components/AuthProvider";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { useApprovalActivity, ApprovalActivity } from "@/hooks/useApprovalActivity";
import { useApprovalToasts } from "@/hooks/useApprovalToasts";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";

function ActivityItem({ activity }: { activity: ApprovalActivity }) {
  const icon = activity.status === "approved"
    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
    : activity.status === "rejected"
    ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
    : <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;

  const description = activity.status === "pending"
    ? <><span className="font-medium">{activity.submitter_name}</span> submitted <span className="font-medium">"{activity.post_title}"</span> for approval</>
    : activity.status === "approved"
    ? <><span className="font-medium">"{activity.post_title}"</span> was approved{activity.reviewer_name ? <> by <span className="font-medium">{activity.reviewer_name}</span></> : null}</>
    : <><span className="font-medium">"{activity.post_title}"</span> was rejected{activity.reviewer_name ? <> by <span className="font-medium">{activity.reviewer_name}</span></> : null}</>;

  const timestamp = activity.reviewed_at || activity.created_at;

  return (
    <div className="flex gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-foreground">{description}</p>
        {activity.reviewer_comment && (
          <p className="text-[11px] text-muted-foreground mt-0.5 italic line-clamp-1">"{activity.reviewer_comment}"</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const { user, signOut } = useAuthContext();
  const { count: pendingCount } = usePendingApprovals();
  const { activities, loading: activitiesLoading } = useApprovalActivity();
  const navigate = useNavigate();
  useApprovalToasts();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground w-64">
                  <Search className="h-4 w-4" />
                  <span>Search…</span>
                  <kbd className="ml-auto text-xs bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              {/* Notification Bell with Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {pendingCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {pendingCount > 9 ? "9+" : pendingCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <h4 className="text-sm font-semibold">Notifications</h4>
                    {pendingCount > 0 && (
                      <span className="text-xs text-muted-foreground">{pendingCount} pending</span>
                    )}
                  </div>
                  <Separator />
                  <ScrollArea className="max-h-[320px]">
                    {activitiesLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Clock className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading…</span>
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <ShieldCheck className="h-6 w-6 mb-2 opacity-50" />
                        <p className="text-xs">No approval activity yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {activities.map((a) => (
                          <ActivityItem key={a.id} activity={a} />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  <Separator />
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs justify-center"
                      onClick={() => navigate("/approvals")}
                    >
                      View all approvals
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
              <div className="ml-2 h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                {initials}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
