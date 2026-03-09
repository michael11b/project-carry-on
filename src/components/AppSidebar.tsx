import {
  LayoutDashboard,
  Layers,
  Palette,
  Sparkles,
  FolderOpen,
  CalendarDays,
  Users,
  User2,
  Settings,
  ChevronDown,
  Building2,
  Zap,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";

const mainNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workspaces", url: "/workspaces", icon: Layers },
  { title: "Brand Kit", url: "/brand-kit", icon: Palette },
];

const createNav = [
  { title: "Content Studio", url: "/studio", icon: Sparkles },
  { title: "Asset Library", url: "/assets", icon: FolderOpen },
  { title: "Content Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Pages", url: "/pages", icon: FileText },
  { title: "Approvals", url: "/approvals", icon: ShieldCheck },
];

const manageNav = [
  { title: "Team", url: "/team", icon: Users },
  { title: "Profile", url: "/profile", icon: User2 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { count: pendingCount } = usePendingApprovals();

  const renderNavItem = (item: { title: string; url: string; icon: any }) => {
    const isApprovals = item.url === "/approvals";
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={location.pathname === item.url}>
          <NavLink to={item.url} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
            <div className="relative">
              <item.icon className="h-4 w-4" />
              {isApprovals && pendingCount > 0 && collapsed && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            {!collapsed && (
              <span className="flex items-center justify-between flex-1">
                <span>{item.title}</span>
                {isApprovals && pendingCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] font-semibold bg-primary text-primary-foreground"
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </Badge>
                )}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Zap className="h-4 w-4" />
              </div>
              {!collapsed && (
                <>
                  <div className="flex flex-col items-start text-sm leading-tight">
                    <span className="font-display font-semibold truncate">ContentForge</span>
                    <span className="text-xs text-muted-foreground truncate">Agency Pro</span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>
              <Building2 className="mr-2 h-4 w-4" />
              Switch Organization
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Organization Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Create</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {createNav.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manageNav.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" />
              <span>1,240 / 5,000 credits</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div className="h-full w-[25%] rounded-full bg-primary" />
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
