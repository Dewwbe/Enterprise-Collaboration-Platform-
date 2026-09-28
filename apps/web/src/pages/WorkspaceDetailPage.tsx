import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TaskStatus, WorkspaceRole, type Workspace, type WorkspaceStats } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge, STATUS_LABEL } from '../components/ui/Badge';
import { PageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InviteMemberModal } from '../components/InviteMemberModal';
import { hasMinRole, ROLE_TONE } from '../lib/roles';

export function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    try {
      const [ws, st] = await Promise.all([
        api.workspaces.get(workspaceId),
        api.workspaces.getStats(workspaceId),
      ]);
      setWorkspace(ws);
      setStats(st);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load workspace.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (!workspace) {
    return <PageSpinner />;
  }

  const myRole = workspace.members?.find((m) => m.userId === user?.id)?.role;
  const canManage = hasMinRole(myRole, WorkspaceRole.ADMIN);
  const canDelete = hasMinRole(myRole, WorkspaceRole.OWNER);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{workspace.name}</h2>
              {workspace.isArchived && <Badge tone="yellow">Archived</Badge>}
            </div>
            <p className="text-sm text-slate-400">/{workspace.slug}</p>
          </div>
          {canDelete && !workspace.isArchived && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setArchiveOpen(true)}>
                Archive
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>

      {stats && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Overview</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-2xl font-semibold text-slate-900">{stats.memberCount}</p>
                <p className="text-sm text-slate-500">Members</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-2xl font-semibold text-slate-900">{stats.projectCount}</p>
                <p className="text-sm text-slate-500">Active projects</p>
              </CardBody>
            </Card>
            {Object.values(TaskStatus).map((status) => (
              <Card key={status}>
                <CardBody>
                  <p className="text-2xl font-semibold text-slate-900">
                    {stats.taskCounts[status]}
                  </p>
                  <p className="text-sm text-slate-500">{STATUS_LABEL[status]}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Members</h3>
            {canManage && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                + Invite member
              </Button>
            )}
          </div>

          {!workspace.members || workspace.members.length === 0 ? (
            <EmptyState title="No members" description="Invite teammates to this workspace." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {workspace.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {member.user
                        ? `${member.user.firstName} ${member.user.lastName}`
                        : member.userId}
                    </p>
                    {member.user && <p className="text-xs text-slate-400">{member.user.email}</p>}
                  </div>
                  <Badge tone={ROLE_TONE[member.role]}>{member.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <EmptyState
        title="Projects — coming soon"
        description="Project and task management for this workspace lands in the next update."
      />

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          load();
        }}
        invite={(userId, role) => api.workspaces.inviteMember(workspaceId, { userId, role })}
      />

      <ConfirmDialog
        open={archiveOpen}
        title="Archive workspace"
        description={`Archive "${workspace.name}"? It will be hidden from members' workspace lists.`}
        confirmLabel="Archive"
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          try {
            await api.workspaces.archive(workspaceId);
            toast.success('Workspace archived.');
            setArchiveOpen(false);
            load();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not archive workspace.');
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete workspace"
        description={`Permanently delete "${workspace.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await api.workspaces.remove(workspaceId);
            toast.success('Workspace deleted.');
            navigate('/workspaces');
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not delete workspace.');
          }
        }}
      />
    </div>
  );
}
