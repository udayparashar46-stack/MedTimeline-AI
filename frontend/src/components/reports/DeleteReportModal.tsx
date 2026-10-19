/**
 * DeleteReportModal.tsx — Confirmation dialog to permanently delete an uploaded report.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { reportsApi, type Report } from '../../lib/apiClient';

interface DeleteReportModalProps {
  isOpen: boolean;
  report: Report;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteReportModal: React.FC<DeleteReportModalProps> = ({
  isOpen,
  report,
  onClose,
  onDeleted,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await reportsApi.delete(report.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report.');
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Lab Report"
      description="Permanently remove this report and its stored PDF file."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>
          Are you sure you want to delete{' '}
          <strong>{report.original_filename}</strong>? This action cannot be undone.
        </p>

        {error && (
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
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} isLoading={isDeleting}>
            Delete Report
          </Button>
        </div>
      </div>
    </Modal>
  );
};
