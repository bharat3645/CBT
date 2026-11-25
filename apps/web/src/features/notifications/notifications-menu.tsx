"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { Button } from "@cbt/ui";
import { fmtDateTime } from "@/components/ui-kit";
import { useMarkAllRead, useNotifications } from "./api";

/** Header bell: unread count from the dashboard payload, latest in-app notifications on open. */
export function NotificationsMenu({ unread }: { unread: number }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const list = useNotifications({ limit: 8, enabled: open });
  const markAll = useMarkAllRead();

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative"
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-lg border border-border bg-card p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              className="text-xs text-accent-foreground hover:underline disabled:opacity-50"
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </button>
          </div>
          {list.isLoading ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Loading...</p>
          ) : !list.data?.length ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">You are all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {list.data.map((n) => (
                <li key={n.id} className="px-2 py-2 text-sm">
                  <div className={n.readAt ? "text-muted-foreground" : "font-medium"}>{n.title}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
