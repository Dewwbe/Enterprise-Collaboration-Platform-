import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Organization, Workspace } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { slugify } from '../lib/slugify';

function CreateWorkspaceModal({
  open,
  onClose,
  onCreated,
  organizations,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  organizations: Organization[];
}) {
  const [organizationId, setOrganizationId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const reset = () => {
    setOrganizationId('');
    setName('');
    setSlug('');
    setSlugTouched(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.workspaces.create({ organizationId, name, slug });
      toast.success('Workspace created.');
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create workspace.');
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
      title="New workspace"
    >
      {organizations.length === 0 ? (
        <p className="text-sm text-slate-500">
          You need to belong to an organization before creating a workspace.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Organization" htmlFor="ws-org">
            <Select
              id="ws-org"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select an organization
              </option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name" htmlFor="ws-name">
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
            />
          </Field>
          <Field label="Slug" htmlFor="ws-slug" hint="Lowercase letters, numbers, hyphens only.">
            <Input
              id="ws-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              required
            />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create workspace'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      const [ws, orgs] = await Promise.all([api.workspaces.list(), api.organizations.list()]);
      setWorkspaces(ws);
      setOrganizations(orgs);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load workspaces.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (workspaces === null) {
    return <PageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Workspaces you belong to.</p>
        <Button onClick={() => setModalOpen(true)}>+ New workspace</Button>
      </div>

      {workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Create one inside an organization to start adding projects."
          action={<Button onClick={() => setModalOpen(true)}>+ New workspace</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link key={ws.id} to={`/workspaces/${ws.id}`}>
              <Card className="h-full transition-shadow hover:shadow-popover">
                <CardBody>
                  <p className="font-semibold text-slate-900">{ws.name}</p>
                  <p className="text-sm text-slate-400">/{ws.slug}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateWorkspaceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          load();
        }}
        organizations={organizations}
      />
    </div>
  );
}
