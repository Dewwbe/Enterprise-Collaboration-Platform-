import { useState, type FormEvent } from 'react';
import { WorkspaceRole } from '@ecp/shared-types';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input } from './ui/Input';
import { Select } from './ui/Select';
import { ROLE_OPTIONS } from '../lib/roles';

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
  /** Looks the invitee up by email, then invites them with the chosen role. */
  invite: (userId: string, role: WorkspaceRole) => Promise<unknown>;
}

export function InviteMemberModal({ open, onClose, onInvited, invite }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>(WorkspaceRole.MEMBER);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const reset = () => {
    setEmail('');
    setRole(WorkspaceRole.MEMBER);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const user = await api.users.lookup(email);
      await invite(user.id, role);
      toast.success(`Invited ${user.firstName} ${user.lastName}.`);
      reset();
      onInvited();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not invite that user.');
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
      title="Invite a member"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="invite-email" hint="Must already have an ECP account.">
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <Select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Inviting…' : 'Send invite'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
