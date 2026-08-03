"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hostname.startsWith("demo.")) {
      router.replace("/demo-login");
      return;
    }
    if (!authLoading && user) {
      router.replace("/app");
    }
  }, [router, authLoading, user]);

  function switchMode() {
    setError(null);
    setMode((prev) => (prev === "login" ? "register" : "login"));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    if (mode === "register") {
      const confirmPassword = String(form.get("confirmPassword"));
      if (password !== confirmPassword) {
        setError("Passwords don't match");
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        await auth.login(email, password);
      } else {
        await auth.register(email, password);
      }
      await refresh();
      router.push("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || user) {
    return null;
  }

  return (
    <div className="flex min-h-full w-full">
      <aside
        className="sticky top-0 hidden h-screen w-1/2 flex-col justify-between bg-linear-to-br from-primary to-primary/80 p-12 text-primary-foreground lg:flex"
      >
        <p
          className="text-2xl tracking-tight"
          style={{ fontFamily: "var(--font-wordmark)", fontWeight: 800 }}
        >
          Sentinel
        </p>
        <div className="space-y-4">
          <p className="max-w-md text-3xl leading-tight font-medium">
            Track your time.
            <br />
            Plan your day.
            <br />
            Move forward.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">
          The lightweight focus tracker for people who build things.
        </p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-6 lg:px-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5 lg:hidden">
            <p
              className="text-primary text-2xl tracking-tight"
              style={{ fontFamily: "var(--font-wordmark)", fontWeight: 800 }}
            >
              Sentinel
            </p>
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create an account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Sign in to continue to your dashboard."
                : "Start tracking your time and planning your days."}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                autoComplete={mode === "login" ? "username" : "email"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                required
              />
            </div>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="auth-confirm-password">Confirm password</Label>
                <Input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            )}
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="text-primary underline-offset-4 hover:underline"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}