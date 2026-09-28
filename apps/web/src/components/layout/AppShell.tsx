import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { WorkspaceProvider } from '../../context/WorkspaceContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <WorkspaceProvider>
      <div className="flex h-screen bg-slate-50">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
