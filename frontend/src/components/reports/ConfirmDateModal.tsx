/**
 * ConfirmDateModal.tsx — Dialog for reviewing and confirming ambiguous dates.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { reportsApi, type Report } from '../../lib/apiClient';

interface ConfirmDateModalProps {
  isOpen: boolean;
  report: Report;
  onClose: () => void;
  onConfirmed: (updated: Report) => void;
}

export const ConfirmDateModal: React.FC<ConfirmDateModalProps> = ({
  isOpen,
  report,
  onClose,
  onConfirmed,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    report.report_date || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternatives = report.date_alternatives || [];

  const handleConfirm = async () => {
    if (!selectedDate) {
      setError('Please select or specify a valid date.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await reportsApi.update(report.id, {
        report_date: selectedDate,
        report_date_confirmed: true,
      });
      onConfirmed(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update date.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Resolve Report Date"
      description={`Confirm specimen collection date for "${report.original_filename}"`}
      maxWidth="540px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--warning-soft)',
            borderRadius: 'var(--radius-card)',
            fontSize: '13px',
            color: 'var(--text)',
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '4px' }}>
            <span>⚠️</span>
            <span>Date Ambiguity Detected</span>
          </div>
          The extraction pipeline found multiple candidate dates or a symmetrical numeric date. Please confirm the correct specimen collection date.
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--danger-soft)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-input)',
              fontSize: '13px',
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
            Select Detected Date Candidate:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {alternatives.map((alt, idx) => {
              const isSelected = selectedDate === alt.date_iso;
              return (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    backgroundColor: isSelected ? 'var(--primary-soft)' : 'var(--card-bg)',
                    borderRadius: 'var(--radius-card)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="date_candidate"
                    value={alt.date_iso}
                    checked={isSelected}
                    onChange={() => setSelectedDate(alt.date_iso)}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ flex: 1, fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {alt.date_iso}
                      </span>
                      <Badge variant={alt.priority === 1 ? 'confirmed' : 'neutral'}>
                        {alt.label_type}
                      </Badge>
                      {alt.is_ambiguous_numeric && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          (Format variation)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {alt.source_text}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="custom-date-input"
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '6px' }}
          >
            Or Enter Specific Date (YYYY-MM-DD):
          </label>
          <input
            id="custom-date-input"
            type="text"
            placeholder="YYYY-MM-DD"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleConfirm()} isLoading={isSubmitting}>
            Confirm Date
          </Button>
        </div>
      </div>
    </Modal>
  );
};
