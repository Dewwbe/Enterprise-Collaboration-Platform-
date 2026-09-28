import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Please wait…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{description}</p>
    </Modal>
  );
}
