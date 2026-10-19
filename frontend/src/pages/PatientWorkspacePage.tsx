/**
 * PatientWorkspacePage.tsx — The per-patient detail/workspace view.
 *
 * M2: Displays patient profile metadata (name, DOB, sex, notes).
 * M3: Displays uploaded lab report PDFs with live status, page count,
 *     file size, upload button with dropzone, and secure deletion.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  patientsApi,
  reportsApi,
  type Patient,
  type Report,
  type ReportStatus,
} from '../lib/apiClient';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { EditPatientModal } from '../components/patients/EditPatientModal';
import { DeletePatientModal } from '../components/patients/DeletePatientModal';
import {
  UploadModal,
  DeleteReportModal,
  RawTextModal,
  ConfirmDateModal,
  ResultsTableModal,
  ReviewModal,
} from '../components/reports';

interface PatientWorkspacePageProps {
  patientId: string;
  onNavigateBack: () => void;
  onNavigateTo: (route: string) => void;
}

export const PatientWorkspacePage: React.FC<PatientWorkspacePageProps> = ({
  patientId,
  onNavigateBack,
  onNavigateTo,
}) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [patientError, setPatientError] = useState<string | null>(null);

  // Reports state (M3)
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  // Modals
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<Report | null>(null);
  const [reportForRawText, setReportForRawText] = useState<Report | null>(null);
  const [reportForDateConfirm, setReportForDateConfirm] = useState<Report | null>(null);
  const [reportForResults, setReportForResults] = useState<Report | null>(null);
  const [reportForReview, setReportForReview] = useState<Report | null>(null);


  // Load patient metadata
  useEffect(() => {
    let cancelled = false;
    setIsLoadingPatient(true);
    setPatientError(null);

    patientsApi
      .get(patientId)
      .then((p) => {
        if (!cancelled) setPatient(p);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setPatientError(err instanceof Error ? err.message : 'Failed to load patient workspace.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPatient(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Load reports list (M3)
  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    setReportsError(null);
    try {
      const res = await reportsApi.list(patientId);
      setReports(res.items);
    } catch (err) {
      setReportsError(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setIsLoadingReports(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleUpdated = (updated: Patient) => {
    setPatient(updated);
    setShowEdit(false);
  };

  const handleDeleted = () => {
    onNavigateBack();
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sexLabel: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
    prefer_not_to_say: 'Not specified',
  };

  const statusBadgeVariant = (
    status: ReportStatus,
  ): 'neutral' | 'warning' | 'confirmed' | 'danger' => {
    switch (status) {
      case 'queued':
        return 'neutral';
      case 'processing':
        return 'warning';
      case 'needs_review':
        return 'warning';
      case 'reviewed':
        return 'confirmed';
      case 'failed':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const statusLabel = (status: ReportStatus): string => {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'processing':
        return 'Processing';
      case 'needs_review':
        return 'Ready for review';
      case 'reviewed':
        return 'Reviewed';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoadingPatient) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <Skeleton width="240px" height="28px" />
        <Card>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Skeleton width="60%" height="20px" />
            <Skeleton width="40%" height="16px" />
            <Skeleton width="80%" height="16px" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (patientError || !patient) {
    return (
      <EmptyState
        icon="⚠️"
        title="Workspace not found"
        description={patientError ?? 'This patient workspace does not exist or has been deleted.'}
        actionLabel="← Back to Patients"
        onAction={onNavigateBack}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Workspace view
  // -------------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Breadcrumb navigation */}
      <nav aria-label="Breadcrumb">
        <button
          onClick={onNavigateBack}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          aria-label="Back to Patients list"
        >
          ← Patients
        </button>
      </nav>

      {/* Patient header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {patient.display_name}
            </h1>
            {patient.sex && (
              <Badge variant="neutral">{sexLabel[patient.sex] ?? patient.sex}</Badge>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Workspace created {formatDate(patient.created_at)}
            {patient.date_of_birth && ` · DOB: ${patient.date_of_birth}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            leftIcon="📤"
            onClick={() => setShowUpload(true)}
            aria-label="Upload PDF reports for this patient"
          >
            Upload Reports
          </Button>
          <Button variant="secondary" size="md" onClick={() => setShowEdit(true)}>
            Edit Details
          </Button>
          <Button variant="danger" size="md" onClick={() => setShowDelete(true)}>
            Delete Workspace
          </Button>
        </div>
      </div>

      {/* Notes card (only if notes exist) */}
      {patient.notes && (
        <Card>
          <CardHeader>
            <CardTitle style={{ fontSize: '14px' }}>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p style={{ fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0 }}>
              {patient.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick navigation summary cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Card
          variant="interactive"
          style={{ flex: 1, minWidth: '180px', cursor: 'pointer' }}
          onClick={() => setShowUpload(true)}
        >
          <CardHeader>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>📤</div>
            <CardTitle style={{ fontSize: '15px' }}>Upload Reports</CardTitle>
            <CardDescription>
              {reports.length} report{reports.length !== 1 ? 's' : ''} in workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowUpload(true);
              }}
            >
              Add PDFs
            </Button>
          </CardContent>
        </Card>

        <Card
          variant="interactive"
          style={{ flex: 1, minWidth: '180px', cursor: 'pointer' }}
          onClick={() => onNavigateTo(`mapping/${patient.id}`)}
        >
          <CardHeader>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>🏷️</div>
            <CardTitle style={{ fontSize: '15px' }}>Test Mapping</CardTitle>
            <CardDescription>Resolve raw test names to canonical tests</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateTo(`mapping/${patient.id}`);
              }}
              aria-label="Manage Test Mappings"
            >
              Resolve Names
            </Button>
          </CardContent>
        </Card>

        <Card
          variant="interactive"
          style={{ flex: 1, minWidth: '180px', cursor: 'pointer' }}
          onClick={() => onNavigateTo(`timeline/${patient.id}`)}
        >
          <CardHeader>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>📈</div>
            <CardTitle style={{ fontSize: '15px' }}>View Timeline</CardTitle>
            <CardDescription>Chronological biomarker matrix &amp; CSV export</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateTo(`timeline/${patient.id}`);
              }}
              aria-label="Go to Timeline"
            >
              Open Timeline
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Lab Reports Card (M3) */}
      <Card>
        <CardHeader
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <CardTitle>Lab Reports</CardTitle>
            <CardDescription>
              Uploaded PDF reports associated with this patient workspace.
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon="+"
            onClick={() => setShowUpload(true)}
          >
            Upload Reports
          </Button>
        </CardHeader>

        <CardContent style={{ padding: '0 0 8px 0' }}>
          {isLoadingReports ? (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton width="100%" height="24px" />
              <Skeleton width="100%" height="24px" />
              <Skeleton width="100%" height="24px" />
            </div>
          ) : reportsError ? (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '12px' }}>
                {reportsError}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void loadReports()}>
                Retry
              </Button>
            </div>
          ) : reports.length === 0 ? (
            <div style={{ padding: '24px' }}>
              <EmptyState
                icon="📄"
                title="No reports uploaded yet"
                description="Upload text-based PDF lab reports to extract test rows and build the patient timeline."
                actionLabel="Upload First Report"
                onAction={() => setShowUpload(true)}
              />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table aria-label="Uploaded reports">
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Report Date</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Pages</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell style={{ fontWeight: 600, color: 'var(--text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>📄</span>
                          <span>{report.original_filename}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {report.report_date ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                              {report.report_date}
                            </span>
                            {report.report_date_confirmed ? (
                              <Badge variant="confirmed">✓ Confirmed</Badge>
                            ) : report.is_date_ambiguous ? (
                              <Badge
                                variant="warning"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setReportForDateConfirm(report)}
                                title="Ambiguous date detected. Click to resolve."
                              >
                                ⚠️ Ambiguous Date
                              </Badge>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {report.report_date_source_text ? 'Detected' : 'Extracted'}
                              </span>
                            )}
                          </div>
                        ) : !report.has_text_layer ? (
                          <span style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 500 }}>
                            ⚠️ Scanned (No Text)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            Not detected
                          </span>
                        )}
                      </TableCell>
                      <TableCell style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(report.created_at)}
                      </TableCell>
                      <TableCell>{report.page_count} pg</TableCell>
                      <TableCell style={{ color: 'var(--text-muted)' }}>
                        {formatSize(report.file_size_bytes)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusBadgeVariant(report.status)}
                          dot={report.status === 'processing'}
                        >
                          {statusLabel(report.status)}
                        </Badge>
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {report.is_date_ambiguous && !report.report_date_confirmed && (
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--warning)' }}
                              onClick={() => setReportForDateConfirm(report)}
                              title="Resolve ambiguous report date"
                            >
                              Resolve Date
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                            onClick={() => setReportForRawText(report)}
                            title="Inspect raw extracted text"
                          >
                            Raw Text
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                            onClick={() => setReportForResults(report)}
                            title="Inspect parsed test results and confidence scoring"
                          >
                            🔬 Test Rows
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            style={{ fontSize: '12px', padding: '4px 10px' }}
                            onClick={() => setReportForReview(report)}
                            title="Review and correct extracted test results in split-view"
                          >
                            Review
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                            onClick={() => setReportToDelete(report)}
                            aria-label={`Delete report ${report.original_filename}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <EditPatientModal
        isOpen={showEdit}
        patient={patient}
        onClose={() => setShowEdit(false)}
        onUpdated={(updated) => handleUpdated(updated)}
      />
      <DeletePatientModal
        isOpen={showDelete}
        patient={patient}
        onClose={() => setShowDelete(false)}
        onDeleted={handleDeleted}
      />
      <UploadModal
        isOpen={showUpload}
        patientId={patient.id}
        patientName={patient.display_name}
        onClose={() => setShowUpload(false)}
        onUploadComplete={() => void loadReports()}
      />
      {reportToDelete && (
        <DeleteReportModal
          isOpen={true}
          report={reportToDelete}
          onClose={() => setReportToDelete(null)}
          onDeleted={() => {
            setReportToDelete(null);
            void loadReports();
          }}
        />
      )}
      {reportForRawText && (
        <RawTextModal
          isOpen={true}
          report={reportForRawText}
          onClose={() => setReportForRawText(null)}
        />
      )}
      {reportForDateConfirm && (
        <ConfirmDateModal
          isOpen={true}
          report={reportForDateConfirm}
          onClose={() => setReportForDateConfirm(null)}
          onConfirmed={(updated) => {
            setReports((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
          }}
        />
      )}
      {reportForResults && (
        <ResultsTableModal
          isOpen={true}
          report={reportForResults}
          onClose={() => setReportForResults(null)}
        />
      )}
      {reportForReview && (
        <ReviewModal
          isOpen={true}
          report={reportForReview}
          onClose={() => setReportForReview(null)}
          onReportUpdated={(updated) => {
            setReports((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
            setReportForReview(updated);
          }}
        />
      )}
    </div>

  );
};
