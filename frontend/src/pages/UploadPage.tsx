/**
 * UploadPage.tsx — Dedicated Upload Lab Reports page for the '/upload' route.
 *
 * Allows:
 * - Selecting an active patient workspace
 * - Dropping or selecting multiple PDF reports (up to 25 files, 20 MB each)
 * - Displaying live per-file upload progress and duplicate warnings
 * - Linking directly to the patient's workspace once uploaded
 */

import React, { useState, useEffect } from 'react';
import {
  patientsApi,
  reportsApi,
  type Patient,
  type ReportUploadItem,
} from '../lib/apiClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { FileDropzone } from '../components/ui/FileDropzone';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

interface UploadPageProps {
  onNavigateTo: (route: string) => void;
  onNavigateToPatient: (patientId: string) => void;
}

interface QueuedFile {
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'duplicate_skipped' | 'failed';
  message?: string | null;
}

export const UploadPage: React.FC<UploadPageProps> = ({
  onNavigateTo,
  onNavigateToPatient,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<{
    uploaded: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPatients(true);
    patientsApi
      .list({ limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setPatients(res.items);
          if (res.items.length > 0) {
            setSelectedPatientId(res.items[0].id);
          }
        }
      })
      .catch(() => {
        // Handled via empty list
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPatients(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFilesSelected = (files: File[]) => {
    const batch = files.slice(0, 25);
    setQueue(batch.map((f) => ({ file: f, status: 'pending' })));
    setSummary(null);
    setErrorMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedPatientId || queue.length === 0 || isUploading) return;

    setIsUploading(true);
    setErrorMessage(null);
    setQueue((prev) => prev.map((item) => ({ ...item, status: 'uploading' })));

    try {
      const filesToSend = queue.map((item) => item.file);
      const res = await reportsApi.upload(selectedPatientId, filesToSend);

      const resultMap = new Map<string, ReportUploadItem>();
      for (const item of res.items) {
        resultMap.set(item.filename, item);
      }

      setQueue((prev) =>
        prev.map((item) => {
          const matched = resultMap.get(item.file.name);
          if (matched) {
            return {
              ...item,
              status: matched.status,
              message: matched.message,
            };
          }
          return {
            ...item,
            status: 'failed',
            message: 'Status unconfirmed by server.',
          };
        }),
      );

      setSummary({
        uploaded: res.uploaded_count,
        skipped: res.skipped_count,
        failed: res.failed_count,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch upload failed.';
      setErrorMessage(msg);
      setQueue((prev) =>
        prev.map((item) => ({
          ...item,
          status: 'failed',
          message: msg,
        })),
      );
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoadingPatients) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton width="220px" height="28px" />
        <Card>
          <CardContent style={{ padding: '24px' }}>
            <Skeleton width="100%" height="80px" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="No patient workspaces found"
        description="Before uploading lab reports, create a patient workspace to hold them."
        actionLabel="Create Patient Workspace"
        onAction={() => onNavigateTo('patients')}
      />
    );
  }

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          Upload Lab Reports
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Select a patient workspace and drop text-based PDF reports to extract results.
        </p>
      </div>

      {/* Patient Workspace Selector Card */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: '15px' }}>1. Target Patient Workspace</CardTitle>
          <CardDescription>
            Reports will be stored and associated with this patient's chronological timeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ maxWidth: '400px' }}>
            <Select
              label="Select Patient *"
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value);
                setSummary(null);
                setQueue([]);
              }}
              options={patients.map((p) => ({
                value: p.id,
                label: `${p.display_name}${p.date_of_birth ? ` (DOB: ${p.date_of_birth})` : ''}`,
              }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Zone Card */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: '15px' }}>2. Select PDF Reports</CardTitle>
          <CardDescription>
            Multi-file upload (up to 25 files). Text-based PDFs up to 20 MB each.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <FileDropzone
              onFilesSelected={handleFilesSelected}
              accept=".pdf,application/pdf"
              maxSizeMB={20}
              disabled={isUploading}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  {queue.length} file{queue.length !== 1 ? 's' : ''} queued for {selectedPatient?.display_name}
                </span>
                {!isUploading && (
                  <Button variant="ghost" size="sm" onClick={() => setQueue([])}>
                    Clear Queue
                  </Button>
                )}
              </div>

              {/* Queue Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {queue.map((item, idx) => (
                  <div
                    key={`${item.file.name}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      backgroundColor: 'var(--surface-muted)',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border)',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{ fontSize: '18px' }}>📄</span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '300px',
                          }}
                        >
                          {item.file.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {formatSize(item.file.size)}
                          {item.message && ` • ${item.message}`}
                        </div>
                      </div>
                    </div>

                    <div>
                      {item.status === 'pending' && <Badge variant="neutral">Ready</Badge>}
                      {item.status === 'uploading' && (
                        <Badge variant="warning" dot>
                          Uploading...
                        </Badge>
                      )}
                      {item.status === 'uploaded' && (
                        <Badge variant="confirmed">✓ Uploaded</Badge>
                      )}
                      {item.status === 'duplicate_skipped' && (
                        <Badge variant="warning" dot>
                          Duplicate (Skipped)
                        </Badge>
                      )}
                      {item.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary message */}
              {summary && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-input)',
                    backgroundColor:
                      summary.failed > 0
                        ? 'var(--warning-soft)'
                        : summary.uploaded > 0
                          ? 'var(--success-soft)'
                          : 'var(--surface-muted)',
                    border: `1px solid ${
                      summary.failed > 0
                        ? 'var(--warning)'
                        : summary.uploaded > 0
                          ? 'var(--success)'
                          : 'var(--border)'
                    }`,
                    fontSize: '13px',
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <strong>Upload Complete:</strong> {summary.uploaded} report(s) uploaded
                    {summary.skipped > 0 && `, ${summary.skipped} duplicate(s) skipped`}
                    {summary.failed > 0 && `, ${summary.failed} failed`}
                  </div>

                  {selectedPatientId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigateToPatient(selectedPatientId)}
                    >
                      Open Workspace →
                    </Button>
                  )}
                </div>
              )}

              {errorMessage && (
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
                  {errorMessage}
                </p>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                {!summary ? (
                  <Button
                    variant="primary"
                    onClick={() => void handleUpload()}
                    isLoading={isUploading}
                    leftIcon="📤"
                  >
                    Upload {queue.length} File{queue.length !== 1 ? 's' : ''}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setQueue([])}>
                    Upload More Files
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
