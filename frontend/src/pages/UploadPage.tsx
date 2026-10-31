/**
 * UploadPage.tsx — Dedicated Upload Lab Reports page with reliable per-file progress and retry.
 */

import React, { useState, useEffect } from 'react';
import {
  patientsApi,
  reportsApi,
  type Patient,
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
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'uploaded' | 'duplicate_skipped' | 'failed';
  progress: number;
  message?: string | null;
}

const formatDoctorFriendlyError = (rawMsg: string | null | undefined): string => {
  if (!rawMsg) return 'Unable to process this file. Please verify it is a valid PDF, image, or Word report and retry.';
  const lower = rawMsg.toLowerCase();
  if (lower.includes('invalid file format') || lower.includes('unsupported file format') || lower.includes('missing %pdf header')) {
    return 'Unsupported or invalid format. Supported formats: PDF, JPG, PNG, TIFF, and DOCX.';
  }
  if (lower.includes('legacy') || lower.includes('.doc')) {
    return 'Legacy .doc format cannot be processed directly. Please save or export as PDF or .docx and upload.';
  }
  if (lower.includes('decompression bomb') || lower.includes('dimensions')) {
    return 'Image dimensions exceed safety limits. Please upload a standard laboratory report image or PDF.';
  }
  if (lower.includes('exceeds maximum allowed size') || lower.includes('exceeds maximum allowed limit') || lower.includes('50 mb')) {
    return 'This report exceeds the 25 MB file size limit. Please upload a compressed or individual report.';
  }
  if (lower.includes('password') || lower.includes('encrypted')) {
    return 'This PDF is password-protected. Please remove the password and retry.';
  }
  if (lower.includes('corrupted')) {
    return 'This document appears corrupted or unreadable. Please download a clean copy and retry.';
  }
  return rawMsg;
};

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
    setQueue(
      batch.map((f, i) => ({
        id: `${f.name}-${f.size}-${Date.now()}-${i}`,
        file: f,
        status: 'pending',
        progress: 0,
      })),
    );
    setSummary(null);
    setErrorMessage(null);
  };

  const uploadSingleItem = async (item: QueuedFile): Promise<{ status: string }> => {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 0, message: null } : q)),
    );

    try {
      const resItem = await reportsApi.uploadSingle(selectedPatientId, item.file, (pct) => {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progress: pct, status: pct === 100 ? 'processing' : 'uploading' } : q)),
        );
      });

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: resItem.status,
                progress: 100,
                message: resItem.message,
              }
            : q,
        ),
      );
      return { status: resItem.status };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Upload failed.';
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'failed',
                progress: 0,
                message: errMsg,
              }
            : q,
        ),
      );
      return { status: 'failed' };
    }
  };

  const handleUpload = async () => {
    if (!selectedPatientId || queue.length === 0 || isUploading) return;

    setIsUploading(true);
    setErrorMessage(null);

    let uploadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const item of queue) {
      if (item.status === 'uploaded' || item.status === 'duplicate_skipped') {
        if (item.status === 'uploaded') uploadedCount++;
        else skippedCount++;
        continue;
      }

      const res = await uploadSingleItem(item);
      if (res.status === 'uploaded') {
        uploadedCount++;
      } else if (res.status === 'duplicate_skipped') {
        skippedCount++;
      } else {
        failedCount++;
      }
    }

    setSummary({
      uploaded: uploadedCount,
      skipped: skippedCount,
      failed: failedCount,
    });

    setIsUploading(false);
  };

  const handleRetrySingle = async (item: QueuedFile) => {
    if (isUploading) return;
    setIsUploading(true);
    await uploadSingleItem(item);
    setIsUploading(false);
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Upload Lab Reports</h1>
        <Card>
          <CardContent style={{ padding: '40px 24px' }}>
            <EmptyState
              icon="👥"
              title="No Patient Workspaces Available"
              description="You need to create a patient workspace before uploading laboratory PDF reports."
              actionLabel="Create Patient Workspace"
              onAction={() => onNavigateTo('patients')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const patientOptions = patients.map((p) => ({
    value: p.id,
    label: p.display_name,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Title & Clinical Guidance */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Upload Lab Reports</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
          Upload the patient's laboratory reports in PDF format.
        </p>
      </div>

      {/* Doctor Guidance Banner */}
      <Card style={{ backgroundColor: 'var(--surface)', borderLeft: '4px solid var(--primary)' }}>
        <CardContent style={{ padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', fontSize: '12px' }}>
            <div>
              <strong style={{ color: 'var(--text)', display: 'block' }}>📄 Supported Format</strong>
              <span style={{ color: 'var(--text-muted)' }}>Original digital PDF or scanned image reports from any diagnostic laboratory.</span>
            </div>
            <div>
              <strong style={{ color: 'var(--text)', display: 'block' }}>⚖️ Maximum File Size</strong>
              <span style={{ color: 'var(--text-muted)' }}>Up to 25 MB per PDF report. Multiple reports can be uploaded together.</span>
            </div>
            <div>
              <strong style={{ color: 'var(--text)', display: 'block' }}>🔍 Automatic Processing</strong>
              <span style={{ color: 'var(--text-muted)' }}>Report dates, test names, values, and reference ranges are automatically extracted.</span>
            </div>
            <div>
              <strong style={{ color: 'var(--text)', display: 'block' }}>🛡️ Clinician Verification</strong>
              <span style={{ color: 'var(--text-muted)' }}>Extracted values remain unverified until confirmed by a clinician.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Target Patient Workspace Card */}
      <Card>
        <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <CardTitle style={{ fontSize: '16px', fontWeight: 600 }}>1. Select Target Patient Workspace</CardTitle>
          <CardDescription style={{ fontSize: '13px' }}>
            Uploaded lab reports will be securely assigned and isolated to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent style={{ padding: '20px' }}>
          <div style={{ maxWidth: '400px' }}>
            <Select
              label="Target Patient"
              options={patientOptions}
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value);
                setQueue([]);
                setSummary(null);
                setErrorMessage(null);
              }}
              disabled={isUploading}
            />
          </div>
        </CardContent>
      </Card>

      {/* File Dropzone & Queue Card */}
      <Card>
        <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <CardTitle style={{ fontSize: '16px', fontWeight: 600 }}>2. Select Report Files</CardTitle>
          <CardDescription style={{ fontSize: '13px' }}>
            Select or drag lab reports (PDF, JPG, PNG, TIFF, DOCX) into the dropzone. Each report is processed individually with live status and retry.
          </CardDescription>
        </CardHeader>
        <CardContent style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {queue.length === 0 ? (
            <FileDropzone
              onFilesSelected={handleFilesSelected}
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.docx,application/pdf,image/jpeg,image/png,image/tiff,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              maxSizeMB={25}
              disabled={isUploading}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {queue.length} file{queue.length !== 1 ? 's' : ''} in upload queue
                </span>
                {!isUploading && !summary && (
                  <Button variant="ghost" size="sm" onClick={() => setQueue([])}>
                    Clear Queue
                  </Button>
                )}
              </div>

              {/* Queue List with progress */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                }}
              >
                {queue.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px 16px',
                      backgroundColor: 'var(--surface-muted)',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border)',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{ fontSize: '18px' }}>📄</span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '300px',
                            }}
                            title={item.file.name}
                          >
                            {item.file.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatSize(item.file.size)}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge & Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item.status === 'pending' && <Badge variant="neutral">Ready</Badge>}
                        {item.status === 'uploading' && (
                          <Badge variant="warning" dot>
                            Uploading {item.progress}%
                          </Badge>
                        )}
                        {item.status === 'processing' && (
                          <Badge variant="warning" dot>
                            Parsing Text...
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
                        {item.status === 'failed' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Badge variant="danger">Failed</Badge>
                            {!isUploading && (
                              <Button size="sm" variant="secondary" onClick={() => void handleRetrySingle(item)}>
                                Retry
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(item.status === 'uploading' || item.status === 'processing') && (
                      <div
                        style={{
                          width: '100%',
                          height: '4px',
                          backgroundColor: 'var(--border)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${item.progress}%`,
                            height: '100%',
                            backgroundColor: 'var(--primary)',
                            transition: 'width 0.2s ease-out',
                          }}
                        />
                      </div>
                    )}

                    {item.message && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: item.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
                        }}
                      >
                        {formatDoctorFriendlyError(item.message)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Batch Summary */}
              {summary && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-input)',
                    backgroundColor:
                      summary.failed > 0
                        ? 'var(--warning-soft, #fef3c7)'
                        : 'var(--success-soft, #dcfce7)',
                    border: `1px solid ${
                      summary.failed > 0
                        ? 'var(--warning, #b45309)'
                        : 'var(--success, #15803d)'
                    }`,
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <strong>Upload Completed:</strong> {summary.uploaded} uploaded
                    {summary.skipped > 0 && `, ${summary.skipped} duplicate(s) skipped`}
                    {summary.failed > 0 && `, ${summary.failed} failed`}
                  </div>
                  {summary.uploaded > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onNavigateToPatient(selectedPatientId)}
                    >
                      View in Workspace →
                    </Button>
                  )}
                </div>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--danger-soft, #fee2e2)',
                    border: '1px solid var(--danger)',
                    borderRadius: 'var(--radius-input)',
                    color: 'var(--danger)',
                    fontSize: '13px',
                  }}
                >
                  {errorMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                {!summary ? (
                  <Button
                    variant="primary"
                    onClick={() => void handleUpload()}
                    isLoading={isUploading}
                    disabled={isUploading || queue.length === 0}
                  >
                    Start Upload ({queue.length} {queue.length === 1 ? 'file' : 'files'})
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQueue([]);
                      setSummary(null);
                    }}
                  >
                    Upload More Reports
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
