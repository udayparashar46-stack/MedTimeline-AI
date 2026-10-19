/**
 * DeletePatientModal.tsx — Confirmation dialog for deleting a patient workspace.
 *
 * Blueprint rule: "Deleting requires typed confirmation and removes the workspace's files."
 * The user must type the exact workspace label before the Delete button becomes enabled.
 * This prevents accidental permanent data deletion.
 */

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { patientsApi, type Patient } from '../../lib/apiClient';

interface DeletePatientModalProps {
  isOpen: boolean;
  patient: Patient;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeletePatientModal: React.FC<DeletePatientModalProps> = ({
  isOpen,
  patient,
  onClose,
  onDeleted,
}) => {
  const [confirmation, setConfirmation] = useState('');
  const [apiError, setApiError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset confirmation text whenever this modal opens for a (possibly different) patient
  useEffect(() => {
    if (isOpen) {
      setConfirmation('');
      setApiError('');
    }
  }, [isOpen, patient.id]);

  if (!isOpen) return null;

  const isConfirmed = confirmation === patient.display_name;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    setApiError('');
    try {
      await patientsApi.delete(patient.id);
      onDeleted();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to delete patient workspace.');
      setIsDeleting(false);
    }
  };

  return (
    /* Custom modal so we can have full control over the destructive styling */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 27, 45, 0.4)',
        backdropFilter: 'blur(2px)',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-modal)',
          border: '1px solid var(--danger)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 12px 24px' }}>
          <h2
            id="delete-modal-title"
            style={{ fontSize: '18px', fontWeight: 600, color: 'var(--danger)', margin: 0 }}
          >
            Delete Workspace
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
            This action is <strong>permanent</strong>. All uploaded reports, extracted data, and
            review history for this workspace will be deleted and cannot be recovered.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 24px 16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--danger-soft)',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--danger)',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 500 }}>
              Workspace: <strong>{patient.display_name}</strong>
            </span>
          </div>

          <Input
            label={`Type "${patient.display_name}" to confirm deletion`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={patient.display_name}
            aria-describedby="delete-confirm-hint"
            autoFocus
          />
          <p
            id="delete-confirm-hint"
            style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}
          >
            The button below will only become active once the name is typed exactly.
          </p>

          {apiError && (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--danger)',
                backgroundColor: 'var(--danger-soft)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-input)',
                margin: 0,
              }}
              role="alert"
            >
              {apiError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: 'var(--surface-muted)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={!isConfirmed || isDeleting}
            isLoading={isDeleting}
            aria-label="Permanently delete this workspace"
          >
            Delete Permanently
          </Button>
        </div>
      </div>
    </div>
  );
};
