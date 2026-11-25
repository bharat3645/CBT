"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { AppSidebar, Button, SidebarProfileCard, type LinkProps } from "@cbt/ui";
import { AbilityProvider } from "@/lib/casl";
import { signOut, useSession } from "@/lib/auth-client";
import { useDashboard } from "@/features/dashboards/api";
import { useSelectedChild } from "@/features/parent/child";
import { NotificationsMenu } from "@/features/notifications/notifications-menu";
import { navByRole, roleSlugToRole, withBadges, type RoleSlug } from "./nav-config";

const NextLink = ({ href, children, ...rest }: LinkProps) => (
  <Link href={href} {...rest}>
    {children}
  </Link>
);

/** Role app shell: navy sidebar + light content. Pages render in `children` (SidebarInset equivalent). */
export function AppShell({ role, children }: { role: RoleSlug; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { data: session } = useSession();
  const { child, isLoading: childLoading } = useSelectedChild(role === "parent");
  // same query key as the dashboard page body, so the sidebar badges cost no extra request
  const dash = useDashboard({ childId: role === "parent" ? (child?.studentId ?? null) : null, enabled: role !== "parent" || !childLoading });
  const nav = navByRole[role];
  const name = session?.user?.name ?? dash.data?.user.name ?? "";
  const email = session?.user?.email ?? dash.data?.user.email;
  const instituteName = dash.data?.institute?.name;
  const logo = dash.data?.institute?.logo;
  const brand = dash.data?.institute?.brandColor;
  // institute branding (Settings): the brand colour overrides the primary tokens for this whole shell
  const brandStyle = brand && /^#[0-9a-fA-F]{6}$/.test(brand) ? ({ "--primary": brand, "--sidebar-primary": brand, "--ring": brand } as React.CSSProperties) : undefined;

  React.useEffect(() => setMobileOpen(false), [pathname]);

  // A signed-in user who opens another role's area (typed URL, old bookmark) is sent to their own home.
  const actualRole = dash.data?.role as string | undefined;
  React.useEffect(() => {
    if (!actualRole) return;
    const home: Record<string, RoleSlug> = { institute_admin: "admin", super_admin: "superadmin", teacher: "teacher", student: "student", parent: "parent" };
    const mine = home[actualRole];
    if (mine && mine !== role) router.replace(`/${mine}`);
  }, [actualRole, role, router]);

  return (
    <AbilityProvider role={roleSlugToRole[role]}>
      <div className="flex min-h-screen" style={brandStyle}>
        <AppSidebar
          groups={withBadges(nav.groups, dash.data?.badges)}
          pathname={pathname}
          linkComponent={NextLink}
          primaryAction={nav.primaryAction}
          storageKey={`cbt.sidebar.collapsed.${role}`}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          brand={
            role === "parent" ? (
              <ChildSwitcher />
            ) : (
              <Link href={`/${role}`} className="flex items-center gap-2 text-sidebar-foreground">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="size-7 rounded-md bg-white object-contain" />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-white">P</span>
                )}
                <span className="font-semibold">PrepDesk</span>
              </Link>
            )
          }
          footer={<SidebarProfileCard institute={instituteName} userName={name || "..."} userEmail={email} />}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu />
            </Button>
            <PageSearch role={role} />
            <div className="ml-auto flex items-center gap-1">
              <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">{instituteName ? `${instituteName} · ${nav.label}` : nav.label}</span>
              <NotificationsMenu unread={dash.data?.badges.unreadNotifications ?? 0} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={async () => {
                  await signOut().catch(() => {});
                  router.push("/login");
                }}
              >
                <LogOut />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </AbilityProvider>
  );
}

/** Real guardian links (GET /children): the whole parent area follows the selected child. */
function ChildSwitcher() {
  const { children, child, setChild, isLoading } = useSelectedChild();
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Viewing child</span>
      {isLoading ? (
        <div className="h-9 rounded-md border border-sidebar-border bg-sidebar-accent" />
      ) : children.length === 0 ? (
        <p className="rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-2 text-xs text-sidebar-muted">
          No linked child yet. Ask your institute to link your account.
        </p>
      ) : (
        <select
          aria-label="Child"
          value={child?.studentId ?? ""}
          onChange={(e) => setChild(e.target.value)}
          className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 text-sm text-sidebar-foreground outline-none"
        >
          {children.map((c) => (
            <option key={c.studentId} value={c.studentId}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

/** Header search: jump to any page of this role's menu by typing part of its name (Enter opens the first match). */
function PageSearch({ role }: { role: RoleSlug }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const flat = React.useMemo(() => {
    const out: { title: string; href: string }[] = [];
    const walk = (items: import("@cbt/ui").NavItem[], prefix = "") => {
      for (const i of items) {
        if (i.href) out.push({ title: prefix + i.title, href: i.href });
        if (i.children) walk(i.children, `${i.title} / `);
      }
    };
    navByRole[role].groups.forEach((g) => walk(g.items));
    return out;
  }, [role]);
  const term = q.trim().toLowerCase();
  const matches = term ? flat.filter((i) => i.title.toLowerCase().includes(term)).slice(0, 6) : [];
  const go = (href: string) => { setQ(""); setOpen(false); router.push(href); };
  return (
    <div className="relative hidden max-w-sm flex-1 sm:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        aria-label="Search pages"
        placeholder="Search pages"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) go(matches[0].href); if (e.key === "Escape") setOpen(false); }}
        className="h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && term && (
        <ul role="listbox" aria-label="Matching pages" className="absolute left-0 right-0 top-10 z-30 rounded-lg border border-border bg-card p-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matching page</li>
          ) : (
            matches.map((m) => (
              <li key={m.href} role="option" aria-selected="false">
                <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(e) => { e.preventDefault(); go(m.href); }}>{m.title}</button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
