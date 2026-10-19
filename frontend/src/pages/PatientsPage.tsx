/**
 * PatientsPage.tsx — The patient workspaces list page (M2).
 *
 * What this page does:
 * - Shows all patient workspaces in a searchable, sortable list.
 * - "New Patient" button opens a create form modal.
 * - Each patient row links to the patient's workspace detail view.
 * - Loading skeleton, empty state, and error state are all handled.
 *
 * Why it is structured this way:
 * - Local state only (no global store); TanStack Query would be added in a
 *   later milestone when multiple components need the same data.
 * - The API call happens in a useEffect so we can show skeleton loaders
 *   before the data arrives and a friendly error if the backend is down.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { patientsApi, type Patient } from '../lib/apiClient';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { CreatePatientModal } from '../components/patients/CreatePatientModal';
import { DeletePatientModal } from '../components/patients/DeletePatientModal';
import { EditPatientModal } from '../components/patients/EditPatientModal';

interface PatientsPageProps {
  onNavigateToPatient: (patientId: string) => void;
}

type SortKey = 'display_name' | 'created_at';
type SortDir = 'asc' | 'desc';

export const PatientsPage: React.FC<PatientsPageProps> = ({ onNavigateToPatient }) => {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [showCreate, setShowCreate] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<Patient | null>(null);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------
  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await patientsApi.list({ search: search || undefined });
      setPatients(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients.');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    // Debounce search: wait 300 ms after the user stops typing
    const timer = setTimeout(() => {
      void loadPatients();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadPatients]);

  // -------------------------------------------------------------------------
  // Client-side sorting (list is small enough in MVP)
  // -------------------------------------------------------------------------
  const sorted = [...patients].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'display_name') {
      cmp = a.display_name.localeCompare(b.display_name);
    } else {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------
  const handleCreated = (patient: Patient) => {
    setShowCreate(false);
    void loadPatients();
    // Navigate to the new patient's workspace immediately
    onNavigateToPatient(patient.id);
  };

  const handleUpdated = () => {
    setPatientToEdit(null);
    void loadPatients();
  };

  const handleDeleted = () => {
    setPatientToDelete(null);
    void loadPatients();
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const sexLabel: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
    prefer_not_to_say: 'Not specified',
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Patient Workspaces
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Each workspace holds one patient's lab reports and their timeline.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon="＋"
          onClick={() => setShowCreate(true)}
          aria-label="Create new patient workspace"
        >
          New Patient
        </Button>
      </div>

      {/* Search + stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1', minWidth: '220px', maxWidth: '360px' }}>
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftAddon="🔍"
            aria-label="Search patients"
          />
        </div>
        {!isLoading && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {total} workspace{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonRows />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void loadPatients()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="👥"
          title={search ? 'No patients match your search' : 'No patient workspaces yet'}
          description={
            search
              ? 'Try a different name or clear the search.'
              : 'Create your first patient workspace to start uploading lab reports.'
          }
          actionLabel={search ? 'Clear search' : 'New Patient'}
          onAction={search ? () => setSearch('') : () => setShowCreate(true)}
        />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse' }}
              aria-label="Patient workspaces"
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <SortableHeader
                    label="Name"
                    sortKey="display_name"
                    currentSort={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    sortIcon={sortIcon('display_name')}
                  />
                  <th
                    style={thStyle}
                    scope="col"
                  >
                    Date of Birth
                  </th>
                  <th style={thStyle} scope="col">
                    Sex
                  </th>
                  <th style={thStyle} scope="col">
                    Notes
                  </th>
                  <SortableHeader
                    label="Created"
                    sortKey="created_at"
                    currentSort={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    sortIcon={sortIcon('created_at')}
                  />
                  <th style={{ ...thStyle, textAlign: 'right' }} scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((patient, idx) => (
                  <tr
                    key={patient.id}
                    style={{
                      borderBottom:
                        idx < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                      backgroundColor: 'transparent',
                      transition: 'background-color 100ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                        'var(--surface-muted)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                        'transparent';
                    }}
                  >
                    {/* Name cell — clickable to navigate */}
                    <td style={tdStyle}>
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          fontSize: '14px',
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted',
                          textUnderlineOffset: '3px',
                        }}
                        onClick={() => onNavigateToPatient(patient.id)}
                        aria-label={`Open workspace for ${patient.display_name}`}
                      >
                        {patient.display_name}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      {patient.date_of_birth ?? <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {patient.sex ? (
                        <Badge variant="neutral">{sexLabel[patient.sex] ?? patient.sex}</Badge>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: 'var(--text-muted)',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={patient.notes ?? undefined}
                    >
                      {patient.notes ?? <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(patient.created_at)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onNavigateToPatient(patient.id)}
                          aria-label={`Open ${patient.display_name}'s workspace`}
                        >
                          Open →
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPatientToEdit(patient)}
                          aria-label={`Edit ${patient.display_name}`}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setPatientToDelete(patient)}
                          aria-label={`Delete ${patient.display_name}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modals */}
      <CreatePatientModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
      {patientToEdit && (
        <EditPatientModal
          isOpen={true}
          patient={patientToEdit}
          onClose={() => setPatientToEdit(null)}
          onUpdated={handleUpdated}
        />
      )}
      {patientToDelete && (
        <DeletePatientModal
          isOpen={true}
          patient={patientToDelete}
          onClose={() => setPatientToDelete(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textAlign: 'left',
  backgroundColor: 'var(--surface-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '14px',
  color: 'var(--text)',
  verticalAlign: 'middle',
};

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  direction: SortDir;
  onSort: (key: SortKey) => void;
  sortIcon: string;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortKey,
  currentSort,
  onSort,
  sortIcon,
}) => (
  <th style={thStyle} scope="col">
    <button
      onClick={() => onSort(sortKey)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        color: sortKey === currentSort ? 'var(--primary)' : 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span style={{ opacity: 0.6 }}>{sortIcon}</span>
    </button>
  </th>
);

const SkeletonRows: React.FC = () => (
  <Card>
    <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Skeleton width="35%" height="18px" />
          <Skeleton width="15%" height="18px" />
          <Skeleton width="10%" height="18px" />
          <Skeleton width="20%" height="18px" />
          <Skeleton width="10%" height="18px" />
        </div>
      ))}
    </CardContent>
  </Card>
);

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <Card
    style={{
      border: '1px solid var(--danger)',
      backgroundColor: 'var(--danger-soft)',
      padding: '24px',
      textAlign: 'center',
    }}
  >
    <CardContent>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--danger)', marginBottom: '8px' }}>
        Failed to load patients
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </CardContent>
  </Card>
);
