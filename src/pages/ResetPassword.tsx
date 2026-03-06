import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from the email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check the URL hash for type=recovery (handles page refresh)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated", description: "You can now log in with your new password." });
      navigate("/dashboard");
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
            <Zap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-display font-bold">Invalid Reset Link</h1>
          <p className="text-muted-foreground">This link is invalid or has expired. Please request a new password reset.</p>
          <Button onClick={() => navigate("/auth")} variant="outline">Back to Login</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
            <Zap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-display font-bold">Set New Password</h1>
          <p className="text-muted-foreground mt-1">Enter your new password below.</p>
        </div>

        <Card>
          <CardHeader />
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input id="confirm-password" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Updating…" : "Update Password"}
              </Button>
            </CardContent>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
