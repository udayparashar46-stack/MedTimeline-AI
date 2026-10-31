import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  systemApi,
  DashboardSummaryResponse,
} from '../lib/apiClient';

export interface DashboardPageProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onNavigateTo: (route: string) => void;
  onRetryConnection: () => void;
  errorDetails: string | null;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  connectionStatus,
  onNavigateTo,
  onRetryConnection,
  errorDetails,
}) => {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    systemApi
      .getDashboardSummary()
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to fetch dashboard metrics.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const formatRelativeTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 2) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const formatEventLabel = (eventType: string): { label: string; icon: string } => {
    switch (eventType) {
      case 'report_uploaded':
        return { label: 'Report Uploaded', icon: '📄' };
      case 'report_deleted':
        return { label: 'Report Deleted', icon: '🗑️' };
      case 'patient_created':
        return { label: 'Workspace Created', icon: '👤' };
      case 'patient_updated':
        return { label: 'Workspace Updated', icon: '✏️' };
      case 'patient_deleted':
        return { label: 'Workspace Deleted', icon: '🗑️' };
      case 'result_confirmed':
        return { label: 'Result Verified', icon: '✓' };
      case 'results_bulk_confirmed':
        return { label: 'Results Bulk-Verified', icon: '✓✓' };
      case 'result_edited':
        return { label: 'Result Corrected', icon: '📝' };
      case 'timeline_exported_csv':
        return { label: 'Timeline CSV Exported', icon: '📥' };
      case 'timeline_exported_pdf':
        return { label: 'Timeline PDF Exported', icon: '📑' };
      case 'file_accessed':
        return { label: 'Report File Viewed', icon: '👁️' };
      case 'system_reset':
        return { label: 'System Reset', icon: '⚠️' };
      default:
        return { label: eventType.replace(/_/g, ' '), icon: '•' };
    }
  };

  const filteredPatients = summary?.recent_patients?.filter((p) =>
    p.display_name.toLowerCase().includes(searchTerm.toLowerCase()),
  ) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Dashboard Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Clinical Dashboard
            </h1>
            <Badge variant="info">v1.0.0-rc1</Badge>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
            Longitudinal laboratory history overview and workspace management.
          </p>
        </div>

        {/* Quick Action Shortcuts */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => onNavigateTo('patients')}>
            + New Patient
          </Button>
          <Button variant="secondary" onClick={() => onNavigateTo('upload')}>
            Upload Reports
          </Button>
          <Button variant="secondary" onClick={() => onNavigateTo('timeline')}>
            Timeline Table
          </Button>
        </div>
      </div>

      {/* Clear Product Identity Card for Practicing Clinicians */}
      <Card style={{ backgroundColor: 'var(--surface)', borderLeft: '4px solid var(--primary)' }}>
        <CardContent style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🩺</span>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Doctor-First Laboratory Intelligence
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text)', margin: '4px 0 0 0', lineHeight: 1.5, fontWeight: 500 }}>
                MedTimeline AI helps doctors organize laboratory reports and compare a patient's test results across multiple dates in one chronological timeline.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5-Step Guided Patient Workflow */}
      <Card>
        <CardHeader style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <CardTitle style={{ fontSize: '15px', fontWeight: 700 }}>
                5-Step Clinical Workflow
              </CardTitle>
              <CardDescription style={{ fontSize: '12px', marginTop: '2px' }}>
                Simple guided path from raw PDF laboratory reports to longitudinal clinical comparison
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent style={{ padding: '16px 20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            <div
              onClick={() => onNavigateTo('patients')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-muted)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>STEP 1</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>Add Patient</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Create a confidential workspace for the patient.
              </div>
            </div>

            <div
              onClick={() => onNavigateTo('upload')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-muted)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>STEP 2</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>Upload Lab Reports</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Upload PDF reports from any diagnostic laboratory.
              </div>
            </div>

            <div
              onClick={() => onNavigateTo('patients')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-muted)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>STEP 3</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>Review Extracted Results</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Confirm values alongside original PDF evidence.
              </div>
            </div>

            <div
              onClick={() => onNavigateTo('timeline')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-muted)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>STEP 4</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>View Medical Timeline</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Compare longitudinal biomarker trends over time.
              </div>
            </div>

            <div
              onClick={() => onNavigateTo('timeline')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-muted)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>STEP 5</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>Export Patient Report</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Download clean, clinical PDF summaries securely.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Warning Banner if Disconnected */}
      {connectionStatus !== 'connected' && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: connectionStatus === 'connecting' ? 'var(--info-soft, #e0f2fe)' : 'var(--danger-soft, #fee2e2)',
            border: `1px solid ${connectionStatus === 'connecting' ? 'var(--info)' : 'var(--danger)'}`,
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
          }}
        >
          <div>
            <strong>
              {connectionStatus === 'connecting' ? 'Connecting to Backend...' : 'Backend Service Disconnected'}
            </strong>
            {errorDetails && <div style={{ fontSize: '12px', marginTop: '2px' }}>{errorDetails}</div>}
          </div>
          {connectionStatus === 'disconnected' && (
            <Button size="sm" variant="secondary" onClick={onRetryConnection}>
              Retry Connection
            </Button>
          )}
        </div>
      )}

      {/* Load Error Banner */}
      {loadError && connectionStatus === 'connected' && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--danger-soft, #fee2e2)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-card)',
            fontSize: '13px',
            color: 'var(--danger)',
          }}
        >
          <strong>Failed to load dashboard metrics:</strong> {loadError}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Total Patients */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Total Patients
              </span>
              <span style={{ fontSize: '20px' }}>👥</span>
            </div>
            {isLoading ? (
              <Skeleton width="60px" height="32px" style={{ marginTop: '8px' }} />
            ) : (
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text)', marginTop: '8px' }}>
                {summary?.total_patients ?? 0}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Active patient workspaces
            </div>
          </CardContent>
        </Card>

        {/* Total Reports */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Lab Reports
              </span>
              <span style={{ fontSize: '20px' }}>📄</span>
            </div>
            {isLoading ? (
              <Skeleton width="60px" height="32px" style={{ marginTop: '8px' }} />
            ) : (
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text)', marginTop: '8px' }}>
                {summary?.total_reports ?? 0}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Uploaded PDF documents
            </div>
          </CardContent>
        </Card>

        {/* Awaiting Review */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Awaiting Review
              </span>
              <span style={{ fontSize: '20px' }}>⏳</span>
            </div>
            {isLoading ? (
              <Skeleton width="60px" height="32px" style={{ marginTop: '8px' }} />
            ) : (
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 700,
                  color: (summary?.reports_awaiting_review ?? 0) > 0 ? 'var(--warning, #b45309)' : 'var(--success, #15803d)',
                  marginTop: '8px',
                }}
              >
                {summary?.reports_awaiting_review ?? 0}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Requires clinician date/result verification
            </div>
          </CardContent>
        </Card>

        {/* Processing Failures / Health */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Processing Status
              </span>
              <span style={{ fontSize: '20px' }}>
                {(summary?.processing_failures ?? 0) > 0 ? '⚠️' : '✓'}
              </span>
            </div>
            {isLoading ? (
              <Skeleton width="60px" height="32px" style={{ marginTop: '8px' }} />
            ) : (
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 700,
                  color: (summary?.processing_failures ?? 0) > 0 ? 'var(--danger)' : 'var(--success)',
                  marginTop: '8px',
                }}
              >
                {summary?.processing_failures ?? 0}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {(summary?.processing_failures ?? 0) > 0 ? 'Upload or extraction issues' : 'All reports processed cleanly'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Layout: Two Columns (Patients & Pending Review) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Patient Workspaces Table Card */}
        <Card>
          <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle style={{ fontSize: '16px', fontWeight: 700 }}>Patient Workspaces</CardTitle>
                <CardDescription style={{ fontSize: '12px', marginTop: '2px' }}>
                  Recently accessed patient records and timelines
                </CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onNavigateTo('patients')}>
                View All
              </Button>
            </div>
            {summary && (summary.recent_patients?.length ?? 0) > 2 && (
              <div style={{ marginTop: '12px' }}>
                <input
                  type="text"
                  placeholder="Filter patients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                  aria-label="Filter patient list"
                />
              </div>
            )}
          </CardHeader>
          <CardContent style={{ padding: '0' }}>
            {isLoading ? (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Skeleton height="36px" />
                <Skeleton height="36px" />
                <Skeleton height="36px" />
              </div>
            ) : summary?.recent_patients?.length === 0 ? (
              <div style={{ padding: '36px 20px' }}>
                <EmptyState
                  icon="👤"
                  title="No Patients Created Yet"
                  description="Create a patient workspace to begin uploading and organizing lab test history."
                  actionLabel="+ Create First Patient"
                  onAction={() => onNavigateTo('patients')}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Latest Date</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell style={{ fontWeight: 600 }}>{p.display_name}</TableCell>
                      <TableCell>{p.report_count}</TableCell>
                      <TableCell style={{ color: 'var(--text-muted)' }}>
                        {p.latest_report_date || 'No Date'}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateTo(`patient/${p.id}`)}
                          >
                            Workspace
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onNavigateTo(`timeline/${p.id}`)}
                          >
                            Timeline
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Reports Awaiting Review Card */}
        <Card>
          <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle style={{ fontSize: '16px', fontWeight: 700 }}>
                  Reports Needing Review
                </CardTitle>
                <CardDescription style={{ fontSize: '12px', marginTop: '2px' }}>
                  Unverified PDF extractions awaiting clinician confirmation
                </CardDescription>
              </div>
              {summary && summary.reports_awaiting_review > 0 && (
                <Badge variant="warning">{summary.reports_awaiting_review} Pending</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent style={{ padding: '0' }}>
            {isLoading ? (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Skeleton height="36px" />
                <Skeleton height="36px" />
              </div>
            ) : summary?.recent_reports?.filter((r) => r.status === 'needs_review').length === 0 ? (
              <div style={{ padding: '36px 20px' }}>
                <EmptyState
                  icon="✓"
                  title="All Caught Up"
                  description="There are currently no uploaded reports awaiting review. All extractions are confirmed or workspaces are clean."
                  actionLabel="Upload New Reports"
                  onAction={() => onNavigateTo('upload')}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report File</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary?.recent_reports
                    ?.filter((r) => r.status === 'needs_review')
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div style={{ fontWeight: 600, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.original_filename}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {r.report_date || 'Date Unconfirmed'}
                          </div>
                        </TableCell>
                        <TableCell>{r.patient_name}</TableCell>
                        <TableCell>
                          <Badge variant="warning">Needs Review</Badge>
                        </TableCell>
                        <TableCell style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onNavigateTo(`patient/${r.patient_id}`)}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent System Audit Activity Card */}
      {summary && (summary.recent_activities?.length ?? 0) > 0 && (
        <Card>
          <CardHeader style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <CardTitle style={{ fontSize: '15px', fontWeight: 700 }}>
              Recent Workspace Activity
            </CardTitle>
            <CardDescription style={{ fontSize: '12px' }}>
              Immutable non-clinical operational audit trail
            </CardDescription>
          </CardHeader>
          <CardContent style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(summary.recent_activities ?? []).map((act) => {
                const { label, icon } = formatEventLabel(act.event_type);
                return (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '16px' }}>{icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                        {act.details && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {act.details}
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatRelativeTime(act.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clinical Safety & Legal Disclaimer */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: 'var(--surface-muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}
      >
        <strong>Clinical &amp; Regulatory Disclaimer:</strong> MedTimeline AI is a laboratory record organization and chronological comparison utility designed to assist users in tracking biomarker trends. It is not a medical device and does not produce clinical interpretations, diagnoses, or treatment recommendations. Always verify parsed values, units, and reference ranges against original laboratory documents before making clinical decisions.
      </div>
    </div>
  );
};
