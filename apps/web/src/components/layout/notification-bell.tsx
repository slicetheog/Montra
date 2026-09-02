"use client";

import { Bell } from "lucide-react";
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead, type NotificationView } from "@/hooks/use-notifications";
import { useFormatDate } from "@/hooks/use-locale-format";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Polling-based (see useNotifications' own comment), reads from the
 * Notification rows generateNotifications() writes for overspending,
 * upcoming bills, goal completions, and reconciliation reminders — see
 * server/services/notifications.ts. Hidden entirely when the user has
 * turned notifications off in Settings, same as the underlying query.
 */
export function NotificationBell() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const formatDate = useFormatDate();

  if (!notifications) return null;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-8 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
      >
        <Bell className="size-4.5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-medium leading-none text-accent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={() => markAllRead.mutate()} className="text-xs font-medium text-brand hover:underline">
              Mark all read
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="p-4 text-center text-sm text-foreground-muted">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} onRead={() => markRead.mutate(n.id)} formatDate={formatDate} />
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({
  notification,
  onRead,
  formatDate,
}: {
  notification: NotificationView;
  onRead: () => void;
  formatDate: (date: string) => string;
}) {
  return (
    <li className="border-b border-border last:border-0">
      <button
        onClick={() => !notification.isRead && onRead()}
        className={cn(
          "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-surface-muted",
          !notification.isRead && "bg-brand-tint/60",
        )}
      >
        <span className="flex items-center gap-1.5 font-medium">
          {!notification.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
          {notification.title}
        </span>
        <span className="text-xs text-foreground-muted">{notification.body}</span>
        <span className="text-[11px] text-foreground-muted">{formatDate(notification.createdAt)}</span>
      </button>
    </li>
  );
}
