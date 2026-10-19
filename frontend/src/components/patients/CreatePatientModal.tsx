/**
 * CreatePatientModal.tsx — Modal form to create a new patient workspace.
 *
 * Uses the existing Modal component as the shell and Input/DateInput/Select
 * from the design system. Validates locally before calling the API so users
 * get instant feedback without a round-trip.
 *
 * Fields: display_name (required), date_of_birth (optional YYYY-MM-DD),
 * sex (optional enum), notes (optional free text up to 2000 chars).
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input, DateInput } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { patientsApi, type Patient, type PatientCreate } from '../../lib/apiClient';

interface CreatePatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (patient: Patient) => void;
}

const INITIAL: PatientCreate = {
  display_name: '',
  date_of_birth: null,
  sex: null,
  notes: null,
};

export const CreatePatientModal: React.FC<CreatePatientModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [form, setForm] = useState<PatientCreate>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof PatientCreate, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setForm(INITIAL);
    setErrors({});
    setApiError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Client-side validation — mirrors backend Pydantic rules
  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.display_name.trim()) {
      next.display_name = 'Name is required.';
    } else if (form.display_name.trim().length > 200) {
      next.display_name = 'Name must be 200 characters or fewer.';
    }
    if (form.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) {
      next.date_of_birth = 'Date must be in YYYY-MM-DD format.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);
    try {
      const payload: PatientCreate = {
        display_name: form.display_name.trim(),
        date_of_birth: form.date_of_birth || null,
        sex: form.sex || null,
        notes: form.notes?.trim() || null,
      };
      const created = await patientsApi.create(payload);
      reset();
      onCreated(created);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create patient workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Patient Workspace">
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Disclaimer */}
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--surface-muted)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-input)',
              margin: 0,
            }}
          >
            💡 A nickname or patient ID is encouraged instead of a full name to keep data minimal.
            Real name is optional.
          </p>

          <Input
            label="Workspace label / patient name *"
            placeholder="e.g. Dad, PT-1042, or a real name"
            value={form.display_name}
            onChange={(e) => {
              setForm((f) => ({ ...f, display_name: e.target.value }));
              if (errors.display_name) setErrors((e2) => ({ ...e2, display_name: undefined }));
            }}
            error={errors.display_name}
            autoFocus
            maxLength={200}
            required
          />

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <DateInput
                label="Date of birth (optional)"
                value={form.date_of_birth ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date_of_birth: e.target.value || null }))
                }
                error={errors.date_of_birth}
              />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <Select
                label="Sex (optional)"
                value={form.sex ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sex: e.target.value || null }))
                }
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
              htmlFor="create-patient-notes"
              style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: '6px' }}
            >
              Notes (optional)
            </label>
            <textarea
              id="create-patient-notes"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
              placeholder="Any context about this patient workspace…"
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '4px',
            }}
          >
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Create Workspace
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
