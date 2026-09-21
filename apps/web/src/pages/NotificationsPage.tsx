import { useEffect, useState } from 'react';
import type { Notification } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationsContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';
import { notificationMessage } from '../lib/notificationMessage';

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const toast = useToast();
  const { markRead, refreshUnreadCount, onNotification } = useNotifications();

  const load = async () => {
    try {
      const page = await api.notifications.list({ unreadOnly, limit: 50 });
      setNotifications(page.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load notifications.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  // Live-prepend anything pushed while this page is open.
  useEffect(() => {
    return onNotification((notification) => {
      setNotifications((prev) => (prev ? [notification, ...prev] : prev));
    });
  }, [onNotification]);

  const handleMarkRead = async (notification: Notification) => {
    if (notification.readAt) return;
    try {
      await markRead(notification.id);
      setNotifications(
        (prev) =>
          prev?.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)) ??
          prev,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not mark as read.');
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications?.filter((n) => !n.readAt) ?? [];
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map((n) => markRead(n.id)));
      setNotifications(
        (prev) => prev?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? prev,
      );
      toast.success('All caught up.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not mark all as read.');
    } finally {
      refreshUnreadCount();
    }
  };

  if (notifications === null) {
    return <PageSpinner />;
  }

  const groups = new Map<string, Notification[]>();
  for (const n of notifications) {
    const label = dayLabel(n.createdAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(n);
  }

  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Unread only
        </label>
        {hasUnread && (
          <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Task assignments, comments, and invites will show up here as they happen."
        />
      ) : (
        Array.from(groups.entries()).map(([label, items]) => (
          <section key={label}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </h3>
            <Card>
              <ul className="divide-y divide-slate-100">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleMarkRead(notification)}
                      className={cn(
                        'flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50',
                        !notification.readAt && 'bg-brand-50/50',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          notification.readAt ? 'bg-transparent' : 'bg-brand-600',
                        )}
                      />
                      <span className="flex-1">
                        <span
                          className={cn(
                            'block text-sm',
                            notification.readAt ? 'text-slate-600' : 'font-medium text-slate-900',
                          )}
                        >
                          {notificationMessage(notification)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {timeLabel(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
