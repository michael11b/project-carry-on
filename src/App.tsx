import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import ProfilePage from "@/pages/ProfilePage";
import Dashboard from "@/pages/Dashboard";
import Workspaces from "@/pages/Workspaces";
import BrandKit from "@/pages/BrandKit";
import Studio from "@/pages/Studio";
import AssetLibrary from "@/pages/AssetLibrary";
import ContentCalendar from "@/pages/ContentCalendar";
import TeamManagement from "@/pages/TeamManagement";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/workspaces" element={<Workspaces />} />
              <Route path="/brand-kit" element={<BrandKit />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/assets" element={<AssetLibrary />} />
              <Route path="/calendar" element={<ContentCalendar />} />
              <Route path="/team" element={<TeamManagement />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
