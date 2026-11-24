"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@cbt/ui";
import { signIn, signUp } from "@/lib/auth-client";

const homeFor: Record<string, string> = { super_admin: "/admin", institute_admin: "/admin", admin: "/admin", teacher: "/teacher", student: "/student", parent: "/parent" };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    try {
      const res = isSignup
        ? await signUp.email({ email, password, name: String(fd.get("name")) })
        : await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Something went wrong");
        return;
      }
      // The sign-in payload has no role; the API's /me returns the caller's role in their institute.
      let role = "admin";
      try {
        const me = await fetch("/api/v1/me", { credentials: "include" });
        if (me.ok) role = ((await me.json()) as { role?: string }).role ?? role;
      } catch {
        /* fall back to the admin home */
      }
      router.push(params.get("next") ?? homeFor[role] ?? "/admin");
    } catch {
      setError("Cannot reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar text-sm font-bold text-white">P</span>
          PrepDesk
        </Link>
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            {isSignup ? "Set up your institute workspace." : "Log in to continue."}
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            {isSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" required autoComplete="name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete={isSignup ? "new-password" : "current-password"} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "New institute? "}
          <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-accent-foreground hover:underline">
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
      </div>
    </div>
  );
}
