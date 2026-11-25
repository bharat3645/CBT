"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@cbt/ui";
import { signIn } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api-client";
import { errorText } from "@/components/ui-kit";
import { IS_DEMO } from "@/lib/demo/flag";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo/accounts";

/** Local dev installs can show the one-click demo accounts too (the seed creates them). */
const SHOW_DEMO_LOGINS = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === "1";
const homeFor: Record<string, string> = { super_admin: "/superadmin", institute_admin: "/admin", admin: "/admin", teacher: "/teacher", student: "/student", parent: "/parent" };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const isSignup = mode === "signup";
  const [registered, setRegistered] = React.useState<string | null>(null);
  // Until hydration finishes the form would submit natively (a full page reload), so keep the buttons disabled.
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    await submit(fd);
  }

  async function submit(fd: FormData) {
    setError(null);
    setLoading(true);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    try {
      if (isSignup) {
        // Institute registration (FR-001): creates the admin account and a PENDING institute; the platform owner approves it.
        try {
          await api("/institutes", { method: "POST", body: { name: String(fd.get("institute")), adminName: String(fd.get("name")), adminEmail: email, password } });
        } catch (e) {
          setError(e instanceof ApiError && e.status === 429 ? "Too many attempts. Please wait a minute and try again." : errorText(e, "Could not register the institute"));
          return;
        }
        setRegistered(String(fd.get("institute")));
        return;
      }
      const res = await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Something went wrong");
        return;
      }
      // The sign-in payload has no role; the API's /me returns the caller's role in their institute.
      const me = await api<{ role?: string }>("/me").catch(() => null); // no role: fall back to the admin home
      const role = me?.role ?? "admin";
      router.push(params.get("next") ?? homeFor[role] ?? "/admin");
    } catch {
      setError("Cannot reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /** One-click demo login: same code path as typing the credentials. */
  function quickLogin(email: string, password: string) {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    void submit(fd);
  }

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6" role="status">
          <h1 className="text-lg font-semibold">Registration received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {registered} is waiting for approval. You can log in once the platform team approves your institute.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-accent-foreground hover:underline">Back to log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_100%_0%,rgba(59,91,253,0.4),transparent),radial-gradient(50%_40%_at_0%_100%,rgba(124,58,237,0.3),transparent)]" />
        <Link href="/" className="relative flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">P</span>
          PrepDesk
        </Link>
        <div className="relative">
          <h2 className="max-w-md text-3xl font-semibold tracking-tight">Run exam prep like the real exam.</h2>
          <ul className="mt-6 space-y-3 text-sm text-sidebar-muted">
            {["Paper to computer-based test in minutes", "NTA-style exam screen with a server-driven timer", "Ranks, weak topics and parent-ready reports"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-exam-answered" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">Isolated per institute · audit-logged · built for exam day</p>
      </aside>

      <main className="flex items-center justify-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-6 flex items-center gap-2 font-semibold lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">P</span>
            PrepDesk
          </Link>
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">{isSignup ? "Set up your institute workspace." : "Log in to continue."}</p>
            <form onSubmit={onSubmit} className="space-y-4">
              {isSignup && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="institute">Institute name</Label>
                    <Input id="institute" name="institute" required minLength={2} autoComplete="organization" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Your full name</Label>
                    <Input id="name" name="name" required minLength={2} autoComplete="name" />
                  </div>
                </>
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
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
              </Button>
            </form>
          </div>

          {!isSignup && (IS_DEMO || SHOW_DEMO_LOGINS) && (
            <section aria-label="Demo accounts" className="mt-5 rounded-xl border border-dashed border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Try a demo account</h2>
              <p className="mb-3 text-xs text-muted-foreground">One click signs you in. Password for all: <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code></p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEMO_USERS.filter((u) => u.role !== "super_admin").map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    disabled={loading || !ready}
                    onClick={() => quickLogin(u.email, DEMO_PASSWORD)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:border-primary hover:bg-accent disabled:opacity-50"
                  >
                    <span className="block text-sm font-medium capitalize">{u.role === "admin" ? "Institute admin" : u.role}</span>
                    <span className="block text-xs text-muted-foreground">{u.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : IS_DEMO ? "" : "New institute? "}
            {(isSignup || !IS_DEMO) && (
              <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-accent-foreground hover:underline">
                {isSignup ? "Log in" : "Sign up"}
              </Link>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
