import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  TaskStatus,
  WorkspaceRole,
  type Project,
  type Workspace,
  type WorkspaceStats,
} from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge, STATUS_LABEL } from '../components/ui/Badge';
import { PageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InviteMemberModal } from '../components/InviteMemberModal';
import { hasMinRole, ROLE_TONE } from '../lib/roles';

function CreateProjectModal({
  open,
  onClose,
  onCreated,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  workspaceId: string;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const reset = () => {
    setName('');
    setDescription('');
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.projects.create(workspaceId, { name, description: description || undefined });
      toast.success('Project created.');
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New project"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="proj-name">
          <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Description" htmlFor="proj-description">
          <Textarea
            id="proj-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const load = async () => {
    try {
      const [ws, st, projectPage] = await Promise.all([
        api.workspaces.get(workspaceId),
        api.workspaces.getStats(workspaceId),
        api.projects.list(workspaceId, { limit: 50 }),
      ]);
      setWorkspace(ws);
      setStats(st);
      setProjects(projectPage.items);
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

      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Projects</h3>
            {canManage && (
              <Button size="sm" onClick={() => setCreateProjectOpen(true)}>
                + New project
              </Button>
            )}
          </div>

          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create a project to start adding tasks."
            />
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link key={project.id} to={`/workspaces/${workspaceId}/projects/${project.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-popover">
                    <CardBody>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{project.name}</p>
                        {project.isArchived && <Badge tone="yellow">Archived</Badge>}
                      </div>
                      {project.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                          {project.description}
                        </p>
                      )}
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={() => {
          setCreateProjectOpen(false);
          load();
        }}
        workspaceId={workspaceId}
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
