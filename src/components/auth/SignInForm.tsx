import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sanitizeEmail, checkAccountLockout, recordLoginAttempt, RateLimiter } from "@/lib/security";

const signInLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 });

export const SignInForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    if (!signInLimiter.isAllowed(sanitizedEmail)) {
      setError("Too many sign-in attempts. Please try again later.");
      setLoading(false);
      return;
    }

    const lockoutStatus = checkAccountLockout(sanitizedEmail);
    if (lockoutStatus.isLocked) {
      const remainingMinutes = Math.ceil((lockoutStatus.remainingTime || 0) / (1000 * 60));
      setError(`Account temporarily locked. Please try again in ${remainingMinutes} minutes.`);
      setLoading(false);
      return;
    }


    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password,
      });

      if (error) {
        recordLoginAttempt(sanitizedEmail, false);
        if (error.message === "Email not confirmed") {
          setError("Please verify your email before signing in. Check your inbox and spam folder for the verification link.");
        } else if (error.message.includes("Failed to fetch")) {
          setError("Connection error. Please check your internet connection and try again.");
        } else {
          setError(error.message || "An error occurred during sign in");
        }
        return;
      }

      if (data.user) {
        recordLoginAttempt(sanitizedEmail, true);
        window.location.href = "/";
      }
    } catch (error) {
      setError((error as Error).message || "An error occurred during sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Enter your email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Enter your password"
        />
      </div>
      <Button type="submit" size="default" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </Button>
      {error && (
        <Alert className="mt-4 border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
};