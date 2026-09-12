import { useEffect, useState } from 'react';
import type { Organization, Workspace } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [orgs, ws] = await Promise.all([
          api.organizations.list(),
          api.workspaces.list(),
        ]);
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
