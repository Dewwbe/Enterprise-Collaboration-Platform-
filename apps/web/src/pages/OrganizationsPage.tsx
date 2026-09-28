import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Organization } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Input';
import { slugify } from '../lib/slugify';

function CreateOrganizationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.organizations.create({ name, slug });
      toast.success('Organization created.');
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create organization.');
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
      title="New organization"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="org-name">
          <Input
            id="org-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
            autoFocus
          />
        </Field>
        <Field label="Slug" htmlFor="org-slug" hint="Lowercase letters, numbers, hyphens only.">
          <Input
            id="org-slug"
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
            {submitting ? 'Creating…' : 'Create organization'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      setOrganizations(await api.organizations.list());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load organizations.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (organizations === null) {
    return <PageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Organizations you belong to.</p>
        <Button onClick={() => setModalOpen(true)}>+ New organization</Button>
      </div>

      {organizations.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create one to start inviting your team."
          action={<Button onClick={() => setModalOpen(true)}>+ New organization</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Link key={org.id} to={`/organizations/${org.id}`}>
              <Card className="h-full transition-shadow hover:shadow-popover">
                <CardBody>
                  <p className="font-semibold text-slate-900">{org.name}</p>
                  <p className="text-sm text-slate-400">/{org.slug}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateOrganizationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
