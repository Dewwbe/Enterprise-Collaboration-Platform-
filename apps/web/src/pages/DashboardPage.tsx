import { useEffect, useState } from 'react';
import type { Organization, UserDashboard, Workspace } from '@ecp/shared-types';
import { TaskStatus } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, CardBody } from '../components/ui/Card';
import { Badge, STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatTile({ value, label, danger = false }: { value: number; label: string; danger?: boolean }) {
  return (
    <Card className={cn(danger && value > 0 && 'border-red-200 bg-red-50')}>
      <CardBody>
        <p className={cn('text-2xl font-semibold', danger && value > 0 ? 'text-red-700' : 'text-slate-900')}>
          {value}
        </p>
        <p className="text-sm text-slate-500">{label}</p>
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [dash, orgs, ws] = await Promise.all([
          api.users.dashboard(),
          api.organizations.list(),
          api.workspaces.list(),
        ]);
        setDashboard(dash);
        setOrganizations(orgs);
        setWorkspaces(ws);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <PageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-slate-500">Welcome back, {user?.firstName}.</p>

      {dashboard && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile value={dashboard.workspaceCount} label="Workspaces" />
            <StatTile value={dashboard.projectCount} label="Active projects" />
            <StatTile value={dashboard.overdueTaskCount} label="Overdue tasks" danger />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Your tasks by status</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.values(TaskStatus).map((status) => (
                <Card key={status}>
                  <CardBody>
                    <p className="text-2xl font-semibold text-slate-900">
                      {dashboard.tasksByStatus[status]}
                    </p>
                    <p className="text-sm text-slate-500">{STATUS_LABEL[status]}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Recently updated tasks</h2>
            {dashboard.recentTasks.length === 0 ? (
              <EmptyState title="No tasks yet" description="Tasks assigned to or reported by you will show up here." />
            ) : (
              <Card>
                <ul className="divide-y divide-slate-100">
                  {dashboard.recentTasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="flex-1 font-medium text-slate-900">{task.title}</span>
                      <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
                      <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                      <span className="text-xs text-slate-500">Due {formatDate(task.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Your organizations</h2>
          {organizations.length === 0 ? (
            <EmptyState title="No organizations yet" description="You don't belong to any organization yet." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {organizations.map((org) => (
                  <li key={org.id} className="flex items-center justify-between px-5 py-3">
                    <span className="font-medium text-slate-900">{org.name}</span>
                    <span className="text-sm text-slate-400">/{org.slug}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Your workspaces</h2>
          {workspaces.length === 0 ? (
            <EmptyState title="No workspaces yet" description="You don't belong to any workspace yet." />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {workspaces.map((ws) => (
                  <li key={ws.id} className="flex items-center justify-between px-5 py-3">
                    <span className="font-medium text-slate-900">{ws.name}</span>
                    <span className="text-sm text-slate-400">/{ws.slug}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
