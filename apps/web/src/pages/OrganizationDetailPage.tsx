import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WorkspaceRole, type Organization } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { PageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InviteMemberModal } from '../components/InviteMemberModal';
import { hasMinRole, ROLE_TONE } from '../lib/roles';

export function OrganizationDetailPage() {
  const { organizationId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [org, setOrg] = useState<Organization | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    try {
      setOrg(await api.organizations.get(organizationId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load organization.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  if (!org) {
    return <PageSpinner />;
  }

  const myRole = org.members?.find((m) => m.userId === user?.id)?.role;
  const canManage = hasMinRole(myRole, WorkspaceRole.ADMIN);
  const canDelete = hasMinRole(myRole, WorkspaceRole.OWNER);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{org.name}</h2>
              {org.isArchived && <Badge tone="yellow">Archived</Badge>}
            </div>
            <p className="text-sm text-slate-400">/{org.slug}</p>
          </div>
          {canDelete && !org.isArchived && (
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
        <CardBody>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Members</h3>
            {canManage && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                + Invite member
              </Button>
            )}
          </div>

          {!org.members || org.members.length === 0 ? (
            <EmptyState title="No members" description="Invite teammates to this organization." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {org.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {member.user ? `${member.user.firstName} ${member.user.lastName}` : member.userId}
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

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          load();
        }}
        invite={(userId, role) => api.organizations.inviteMember(organizationId, { userId, role })}
      />

      <ConfirmDialog
        open={archiveOpen}
        title="Archive organization"
        description={`Archive "${org.name}"? It will be hidden from members' organization lists.`}
        confirmLabel="Archive"
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          try {
            await api.organizations.archive(organizationId);
            toast.success('Organization archived.');
            setArchiveOpen(false);
            load();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not archive organization.');
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete organization"
        description={`Permanently delete "${org.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await api.organizations.remove(organizationId);
            toast.success('Organization deleted.');
            navigate('/organizations');
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not delete organization.');
          }
        }}
      />
    </div>
  );
}
