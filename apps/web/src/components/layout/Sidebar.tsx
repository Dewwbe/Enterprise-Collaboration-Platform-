import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspaces } from '../../context/WorkspaceContext';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../lib/cn';
import {
  DashboardIcon,
  OrganizationIcon,
  WorkspaceIcon,
  BellIcon,
  LogoutIcon,
  CloseIcon,
} from './icons';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/organizations', label: 'Organizations', icon: OrganizationIcon, end: false },
  { to: '/workspaces', label: 'Workspaces', icon: WorkspaceIcon, end: false },
  { to: '/notifications', label: 'Notifications', icon: BellIcon, end: false },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { workspaces, selectedWorkspaceId, selectWorkspace, loading } = useWorkspaces();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              E
            </span>
            <span className="text-base font-semibold text-slate-900">ECP Platform</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 md:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

      <div className="px-4 pb-3">
        <label htmlFor="workspace-switcher" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Workspace
        </label>
        {loading ? (
          <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
        ) : workspaces.length === 0 ? (
          <p className="text-sm text-slate-400">No workspaces yet</p>
        ) : (
          <select
            id="workspace-switcher"
            value={selectedWorkspaceId ?? ''}
            onChange={(e) => selectWorkspace(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
