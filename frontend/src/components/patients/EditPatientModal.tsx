/**
 * EditPatientModal.tsx — Modal form to rename a patient workspace or update notes.
 *
 * Pre-populates all fields from the existing patient object so the user
 * only edits what they want to change. Calls PATCH /patients/{id}.
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input, DateInput } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { patientsApi, type Patient } from '../../lib/apiClient';

interface EditPatientModalProps {
  isOpen: boolean;
  patient: Patient;
  onClose: () => void;
  onUpdated: (updated: Patient) => void;
}

export const EditPatientModal: React.FC<EditPatientModalProps> = ({
  isOpen,
  patient,
  onClose,
  onUpdated,
}) => {
  const [displayName, setDisplayName] = useState(patient.display_name);
  const [dob, setDob] = useState(patient.date_of_birth ?? '');
  const [sex, setSex] = useState(patient.sex ?? '');
  const [notes, setNotes] = useState(patient.notes ?? '');
  const [nameError, setNameError] = useState('');
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Re-sync when the patient prop changes (e.g., after a successful previous edit)
  useEffect(() => {
    setDisplayName(patient.display_name);
    setDob(patient.date_of_birth ?? '');
    setSex(patient.sex ?? '');
    setNotes(patient.notes ?? '');
    setNameError('');
    setApiError('');
  }, [patient]);

  const handleClose = () => {
    setNameError('');
    setApiError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setNameError('Name is required.');
      return;
    }
    setIsSubmitting(true);
    setApiError('');
    try {
      const updated = await patientsApi.update(patient.id, {
        display_name: displayName.trim(),
        date_of_birth: dob || null,
        sex: sex || null,
        notes: notes.trim() || null,
      });
      onUpdated(updated);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update patient workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Patient Workspace">
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Workspace label / patient name *"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (nameError) setNameError('');
            }}
            error={nameError}
            autoFocus
            maxLength={200}
            required
          />

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <DateInput
                label="Date of birth (optional)"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <Select
                label="Sex (optional)"
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                options={[
                  { value: '', label: 'Not specified' },
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'other', label: 'Other' },
                  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                ]}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-patient-notes"
              style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: '6px' }}
            >
              Notes (optional)
            </label>
            <textarea
              id="edit-patient-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--text)',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px' }}>
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
