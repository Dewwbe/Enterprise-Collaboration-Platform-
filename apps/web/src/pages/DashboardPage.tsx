import { useEffect, useState } from 'react';
import type { Organization, UserDashboard, Workspace } from '@ecp/shared-types';
import { TaskPriority, TaskStatus } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'To do',
  [TaskStatus.IN_PROGRESS]: 'In progress',
  [TaskStatus.REVIEW]: 'Review',
  [TaskStatus.DONE]: 'Done',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Low',
  [TaskPriority.MEDIUM]: 'Medium',
  [TaskPriority.HIGH]: 'High',
  [TaskPriority.URGENT]: 'Urgent',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
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
        setError(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p>Loading…</p>;
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Welcome, {user?.firstName}</h1>
        <button onClick={logout}>Sign out</button>
      </header>

      {error && <p className="error">{error}</p>}

      {dashboard && (
        <>
          <section className="stats">
            <div className="stat-tile">
              <span className="stat-value">{dashboard.workspaceCount}</span>
              <span className="stat-label">Workspaces</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{dashboard.projectCount}</span>
              <span className="stat-label">Active projects</span>
            </div>
            <div className={`stat-tile ${dashboard.overdueTaskCount > 0 ? 'overdue' : ''}`}>
              <span className="stat-value">{dashboard.overdueTaskCount}</span>
              <span className="stat-label">Overdue tasks</span>
            </div>
          </section>

          <section>
            <h2>Your tasks by status</h2>
            <div className="status-breakdown">
              {Object.values(TaskStatus).map((status) => (
                <div key={status} className="status-tile">
                  <span className="stat-value">{dashboard.tasksByStatus[status]}</span>
                  <span className="stat-label">{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Recently updated tasks</h2>
            {dashboard.recentTasks.length === 0 ? (
              <p>No tasks assigned to or reported by you yet.</p>
            ) : (
              <ul className="task-list">
                {dashboard.recentTasks.map((task) => (
                  <li key={task.id}>
                    <span className="task-title">{task.title}</span>
                    <span className={`badge badge-status-${task.status.toLowerCase()}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    <span className={`badge badge-priority-${task.priority.toLowerCase()}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span className="task-due">Due {formatDate(task.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section>
        <h2>Your organizations</h2>
        {organizations.length === 0 ? (
          <p>You don't belong to any organization yet.</p>
        ) : (
          <ul>
            {organizations.map((org) => (
              <li key={org.id}>
                <strong>{org.name}</strong> <span>/{org.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Your workspaces</h2>
        {workspaces.length === 0 ? (
          <p>You don't belong to any workspace yet.</p>
        ) : (
          <ul>
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <strong>{ws.name}</strong> <span>/{ws.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
