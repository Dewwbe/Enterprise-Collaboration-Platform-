import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Notification } from '@ecp/shared-types';
import { api, tokenStore } from '../api/client';
import { useAuth } from './AuthContext';

const WS_BASE = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

interface NotificationsContextValue {
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  /** Subscribe to notifications pushed live over the socket; returns an unsubscribe fn. */
  onNotification: (listener: (notification: Notification) => void) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef(new Set<(notification: Notification) => void>());

  const refreshUnreadCount = useCallback(async () => {
    try {
      const page = await api.notifications.list({ unreadOnly: true, limit: 1 });
      setUnreadCount(page.total);
    } catch {
      // Non-critical - the bell just stays at its last known count.
    }
  }, []);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setUnreadCount(0);
      return;
    }

    refreshUnreadCount();

    const socket = io(`${WS_BASE}/notifications`, {
      auth: { token: tokenStore.accessToken },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('notification', (notification: Notification) => {
      setUnreadCount((count) => count + 1);
      listenersRef.current.forEach((listener) => listener(notification));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshUnreadCount]);

  const markRead = useCallback(async (id: string) => {
    await api.notifications.markRead(id);
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const onNotification = useCallback((listener: (notification: Notification) => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, markRead, refreshUnreadCount, onNotification }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}
