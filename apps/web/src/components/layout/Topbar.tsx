import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { Avatar } from '../ui/Avatar';
import { BellIcon, SearchIcon, MenuIcon } from './icons';

const TITLES: Array<[prefix: string, title: string]> = [
  ['/organizations', 'Organizations'],
  ['/workspaces', 'Workspaces'],
  ['/notifications', 'Notifications'],
  ['/', 'Dashboard'],
];

function titleForPath(pathname: string): string {
  return TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'ECP Platform';
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const location = useLocation();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900">{titleForPath(location.pathname)}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400 sm:flex">
          <SearchIcon className="h-4 w-4" />
          <span>Search…</span>
        </div>

        <Link
          to="/notifications"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" />
      </div>
    </header>
  );
}
