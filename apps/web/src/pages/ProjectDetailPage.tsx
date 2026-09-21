import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  TaskPriority,
  TaskStatus,
  WorkspaceRole,
  type Project,
  type Task,
  type Workspace,
  type WorkspaceMemberSummary,
} from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import {
  Badge,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  STATUS_LABEL,
} from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { PageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Select } from '../components/ui/Select';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { hasMinRole } from '../lib/roles';
import { NEXT_STATUS } from '../lib/taskWorkflow';

const BOARD_COLUMNS = Object.values(TaskStatus);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface TaskFormValues {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  labels: string;
  assigneeId: string;
}

const EMPTY_FORM: TaskFormValues = {
  title: '',
  description: '',
  priority: TaskPriority.MEDIUM,
  dueDate: '',
  labels: '',
  assigneeId: '',
};

function TaskFormFields({
  values,
  onChange,
  members,
}: {
  values: TaskFormValues;
  onChange: (values: TaskFormValues) => void;
  members: WorkspaceMemberSummary[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" htmlFor="task-title">
        <Input
          id="task-title"
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
          required
          autoFocus
        />
      </Field>
      <Field label="Description" htmlFor="task-description">
        <Textarea
          id="task-description"
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor="task-priority">
          <Select
            id="task-priority"
            value={values.priority}
            onChange={(e) => onChange({ ...values, priority: e.target.value as TaskPriority })}
          >
            {Object.values(TaskPriority).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="task-due">
          <Input
            id="task-due"
            type="date"
            value={values.dueDate}
            onChange={(e) => onChange({ ...values, dueDate: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Assignee" htmlFor="task-assignee">
        <Select
          id="task-assignee"
          value={values.assigneeId}
          onChange={(e) => onChange({ ...values, assigneeId: e.target.value })}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user ? `${m.user.firstName} ${m.user.lastName}` : m.userId}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Labels" htmlFor="task-labels" hint="Comma-separated.">
        <Input
          id="task-labels"
          value={values.labels}
          onChange={(e) => onChange({ ...values, labels: e.target.value })}
          placeholder="backend, infra"
        />
      </Field>
    </div>
  );
}

function CreateTaskModal({
  open,
  onClose,
  onCreated,
  projectId,
  members,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projectId: string;
  members: WorkspaceMemberSummary[];
}) {
  const [values, setValues] = useState<TaskFormValues>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.tasks.create(projectId, {
        title: values.title,
        description: values.description || undefined,
        priority: values.priority,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        labels: values.labels
          ? values.labels.split(',').map((l) => l.trim()).filter(Boolean)
          : undefined,
        assigneeId: values.assigneeId || undefined,
      });
      toast.success('Task created.');
      setValues(EMPTY_FORM);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setValues(EMPTY_FORM);
        onClose();
      }}
      title="New task"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TaskFormFields values={values} onChange={setValues} members={members} />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditTaskModal({
  task,
  onClose,
  onSaved,
  members,
}: {
  task: Task | null;
  onClose: () => void;
  onSaved: () => void;
  members: WorkspaceMemberSummary[];
}) {
  const [values, setValues] = useState<TaskFormValues>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (task) {
      setValues({
        title: task.title,
        description: task.description ?? '',
        priority: task.priority,
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        labels: task.labels.join(', '),
        assigneeId: task.assigneeId ?? '',
      });
    }
  }, [task]);

  if (!task) return null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.tasks.update(task.projectId, task.id, {
        title: values.title,
        description: values.description || undefined,
        priority: values.priority,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        labels: values.labels
          ? values.labels.split(',').map((l) => l.trim()).filter(Boolean)
          : [],
        assigneeId: values.assigneeId || null,
      });
      toast.success('Task updated.');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!task} onClose={onClose} title="Edit task">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TaskFormFields values={values} onChange={setValues} members={members} />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TaskCard({
  task,
  members,
  canEdit,
  canDelete,
  onAdvance,
  onEdit,
  onDelete,
}: {
  task: Task;
  members: WorkspaceMemberSummary[];
  canEdit: boolean;
  canDelete: boolean;
  onAdvance: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const assignee = members.find((m) => m.userId === task.assigneeId);
  const nextStatus = NEXT_STATUS[task.status];
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== TaskStatus.DONE;

  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">{task.title}</p>
          {assignee && (
            <Avatar firstName={assignee.user?.firstName} lastName={assignee.user?.lastName} size="sm" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
          {task.dueDate && (
            <span className={overdue ? 'text-xs font-medium text-red-600' : 'text-xs text-slate-400'}>
              Due {formatDate(task.dueDate)}
            </span>
          )}
        </div>
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.map((label) => (
              <Badge key={label} tone="neutral">
                {label}
              </Badge>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            {nextStatus && (
              <button
                type="button"
                onClick={onAdvance}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Move to {STATUS_LABEL[nextStatus]} →
              </button>
            )}
            <button type="button" onClick={onEdit} className="text-xs text-slate-500 hover:text-slate-800">
              Edit
            </button>
            {canDelete && (
              <button type="button" onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">
                Delete
              </button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function ProjectDetailPage() {
  const { workspaceId = '', projectId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);

  const load = async () => {
    try {
      const [ws, proj, taskPage] = await Promise.all([
        api.workspaces.get(workspaceId),
        api.projects.get(workspaceId, projectId),
        api.tasks.list(projectId, { limit: 100 }),
      ]);
      setWorkspace(ws);
      setProject(proj);
      setTasks(taskPage.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load project.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, projectId]);

  const members = useMemo(() => workspace?.members ?? [], [workspace]);

  const myRole = workspace?.members?.find((m) => m.userId === user?.id)?.role;
  const canCreateTask = hasMinRole(myRole, WorkspaceRole.MEMBER);
  const canManageProject = hasMinRole(myRole, WorkspaceRole.ADMIN);
  const canDeleteProject = hasMinRole(myRole, WorkspaceRole.OWNER);

  if (!project || !workspace) {
    return <PageSpinner />;
  }

  const columns = BOARD_COLUMNS.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
              {project.isArchived && <Badge tone="yellow">Archived</Badge>}
            </div>
            {project.description && <p className="text-sm text-slate-500">{project.description}</p>}
          </div>
          <div className="flex gap-2">
            {canManageProject && !project.isArchived && (
              <Button variant="secondary" size="sm" onClick={() => setArchiveOpen(true)}>
                Archive
              </Button>
            )}
            {canManageProject && project.isArchived && (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await api.projects.restore(workspaceId, projectId);
                    toast.success('Project restored.');
                    load();
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : 'Could not restore project.');
                  }
                }}
              >
                Restore
              </Button>
            )}
            {canDeleteProject && (
              <Button variant="danger" size="sm" onClick={() => setDeleteProjectOpen(true)}>
                Delete
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Tasks by status</p>
        {canCreateTask && <Button onClick={() => setCreateOpen(true)}>+ New task</Button>}
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Create the first task for this project." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map(({ status, tasks: columnTasks }) => (
            <div key={status} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">{STATUS_LABEL[status]}</h3>
                <span className="text-xs text-slate-400">{columnTasks.length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    members={members}
                    canEdit={canCreateTask}
                    canDelete={canManageProject}
                    onAdvance={async () => {
                      const next = NEXT_STATUS[task.status];
                      if (!next) return;
                      try {
                        await api.tasks.update(projectId, task.id, { status: next });
                        load();
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'Could not update status.');
                      }
                    }}
                    onEdit={() => setEditingTask(task)}
                    onDelete={() => setDeletingTask(task)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
        projectId={projectId}
        members={members}
      />

      <EditTaskModal
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={() => {
          setEditingTask(null);
          load();
        }}
        members={members}
      />

      <ConfirmDialog
        open={!!deletingTask}
        title="Delete task"
        description={`Delete "${deletingTask?.title}"? This can be undone by an administrator later.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeletingTask(null)}
        onConfirm={async () => {
          if (!deletingTask) return;
          try {
            await api.tasks.remove(deletingTask.projectId, deletingTask.id);
            toast.success('Task deleted.');
            setDeletingTask(null);
            load();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not delete task.');
          }
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        title="Archive project"
        description={`Archive "${project.name}"? It can be restored later from this page.`}
        confirmLabel="Archive"
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          try {
            await api.projects.archive(workspaceId, projectId);
            toast.success('Project archived.');
            setArchiveOpen(false);
            load();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not archive project.');
          }
        }}
      />

      <ConfirmDialog
        open={deleteProjectOpen}
        title="Delete project"
        description={`Permanently delete "${project.name}" and all its tasks? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteProjectOpen(false)}
        onConfirm={async () => {
          try {
            await api.projects.remove(workspaceId, projectId);
            toast.success('Project deleted.');
            navigate(`/workspaces/${workspaceId}`);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not delete project.');
          }
        }}
      />
    </div>
  );
}
