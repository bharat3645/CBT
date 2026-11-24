"use client";

import * as React from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { cn } from "../lib";

export type NavItem = {
  title: string;
  href?: string;
  icon?: LucideIcon;
  /** Count or short label shown as a badge. */
  badge?: number | string;
  children?: NavItem[];
};
export type NavGroup = { label?: string; items: NavItem[] };

export type LinkProps = { href: string; className?: string; children: React.ReactNode; title?: string; onClick?: () => void; "aria-current"?: "page" };
export type LinkComponent = React.ComponentType<LinkProps>;

const DefaultLink: LinkComponent = ({ href, ...rest }) => <a href={href} {...rest} />;

export type AppSidebarProps = {
  groups: NavGroup[];
  /** Current pathname, used for active state. */
  pathname: string;
  /** Element rendered at the very top (brand / child switcher). */
  brand?: React.ReactNode;
  /** The one primary action up top (e.g. "Upload paper"). */
  primaryAction?: { label: string; href: string; icon?: LucideIcon };
  /** Profile / usage card at the bottom. */
  footer?: React.ReactNode;
  linkComponent?: LinkComponent;
  /** localStorage key to remember icon-collapse. */
  storageKey?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

function isActive(pathname: string, href?: string, exact = false) {
  if (!href) return false;
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function Badge({ value, collapsed }: { value: number | string; collapsed: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold leading-5 text-white",
        collapsed && "absolute right-1 top-1 ml-0 min-w-4 px-1 text-[10px] leading-4",
      )}
    >
      {value}
    </span>
  );
}

export function AppSidebar({
  groups,
  pathname,
  brand,
  primaryAction,
  footer,
  linkComponent: Link = DefaultLink,
  storageKey = "cbt.sidebar.collapsed",
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {}
  }, [storageKey]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(storageKey, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  // On mobile the drawer is always expanded.
  const c = collapsed;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onMobileClose} aria-hidden />}
      <aside
        data-collapsed={c}
        className={cn(
          "group fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          c && "md:w-[68px]",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 pb-2 pt-4", c && "md:justify-center md:px-2")}>
          <div className={cn("min-w-0 flex-1", c && "md:hidden")}>{brand}</div>
          <button
            type="button"
            onClick={toggle}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground md:inline-flex"
            aria-label={c ? "Expand sidebar" : "Collapse sidebar"}
          >
            {c ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        {primaryAction && (
          <div className={cn("px-3 pb-2 pt-1", c && "md:px-2")}>
            <Link
              href={primaryAction.href}
              title={primaryAction.label}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-md bg-sidebar-primary px-3 text-sm font-medium text-white hover:brightness-110",
              )}
            >
              {primaryAction.icon && <primaryAction.icon className="size-4 shrink-0" />}
              <span className={cn(c && "md:hidden")}>{primaryAction.label}</span>
            </Link>
          </div>
        )}

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2" aria-label="Main">
          {groups.map((g, gi) => (
            <div key={g.label ?? gi}>
              {g.label && (
                <div className={cn("px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted", c && "md:hidden")}>
                  {g.label}
                </div>
              )}
              {g.label && c && <div className="mx-2 mb-1 hidden h-px bg-sidebar-border md:block" />}
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <NavRow key={item.title} item={item} pathname={pathname} collapsed={c} Link={Link} onNavigate={onMobileClose} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {footer && <div className={cn("border-t border-sidebar-border p-3", c && "md:p-2")}>{footer}</div>}
      </aside>
    </>
  );
}

function NavRow({
  item,
  pathname,
  collapsed,
  Link,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  Link: LinkComponent;
  onNavigate?: () => void;
}) {
  const hasChildren = !!item.children?.length;
  const childActive = hasChildren && item.children!.some((ch) => isActive(pathname, ch.href));
  const [open, setOpen] = React.useState(childActive);
  React.useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  const Icon = item.icon;
  const base =
    "relative flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";
  const activeCls = "bg-sidebar-accent text-sidebar-foreground font-medium";
  // Dashboard-style roots ("/admin") must match exactly, otherwise every page highlights it.
  const active = hasChildren ? false : isActive(pathname, item.href, item.href ? item.href.split("/").length <= 2 : false);

  const inner = (
    <>
      {Icon && <Icon className="size-4 shrink-0" />}
      <span className={cn("truncate", collapsed && "md:hidden")}>{item.title}</span>
      {item.badge !== undefined && <Badge value={item.badge} collapsed={collapsed} />}
      {hasChildren && (
        <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform", open && "rotate-180", collapsed && "md:hidden")} />
      )}
    </>
  );

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          className={cn(base, childActive && "text-sidebar-foreground")}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={item.title}
        >
          {inner}
        </button>
      ) : (
        <Link
          href={item.href ?? "#"}
          title={item.title}
          className={cn(base, active && activeCls)}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
        >
          {inner}
        </Link>
      )}
      {hasChildren && open && (
        <ul className={cn("ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2", collapsed && "md:hidden")}>
          {item.children!.map((ch) => {
            const a = isActive(pathname, ch.href);
            return (
              <li key={ch.title}>
                <Link
                  href={ch.href ?? "#"}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    a && activeCls,
                  )}
                  aria-current={a ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span className="truncate">{ch.title}</span>
                  {ch.badge !== undefined && <Badge value={ch.badge} collapsed={false} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** Profile + usage card for the sidebar footer. */
export function SidebarProfileCard({
  institute,
  usageLabel,
  usagePercent,
  userName,
  userEmail,
  collapsed,
}: {
  institute?: string;
  usageLabel?: string;
  usagePercent?: number;
  userName: string;
  userEmail?: string;
  collapsed?: boolean;
}) {
  const initials = userName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="space-y-3">
      {usagePercent !== undefined && (
        <div className="rounded-md bg-sidebar-accent p-3 md:group-data-[collapsed=true]:hidden">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">{institute ?? "Usage"}</span>
            <span className="text-sidebar-muted">{usagePercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-border">
            <div className="h-full rounded-full bg-sidebar-primary" style={{ width: `${usagePercent}%` }} />
          </div>
          {usageLabel && <p className="mt-1.5 text-[11px] text-sidebar-muted">{usageLabel}</p>}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-white">
          {initials}
        </div>
        {true && (
          <div className="min-w-0 md:group-data-[collapsed=true]:hidden">
            <div className="truncate text-sm font-medium">{userName}</div>
            {userEmail && <div className="truncate text-xs text-sidebar-muted">{userEmail}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
