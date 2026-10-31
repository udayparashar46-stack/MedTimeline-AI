/**
 * UploadModal.tsx — Reliable Multi-PDF report upload modal with per-file progress and retry.
 *
 * Implements:
 * - Multi-file drag-and-drop or file browser via FileDropzone
 * - Individual transmission progress bar (0% to 100%)
 * - Live status indicators (Pending, Uploading, Processing, Uploaded, Duplicate Skipped, Failed)
 * - Per-file retry button on failure without losing successful uploads
 * - Detailed error messages and batch summary
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { FileDropzone } from '../ui/FileDropzone';
import { reportsApi } from '../../lib/apiClient';

interface UploadModalProps {
  isOpen: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface FileUploadState {
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

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  patientId,
  patientName,
  onClose,
  onUploadComplete,
}) => {
  const [fileQueue, setFileQueue] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    uploaded: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const reset = () => {
    setFileQueue([]);
    setIsUploading(false);
    setBatchError(null);
    setSummary(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFilesSelected = (files: File[]) => {
    const validBatch = files.slice(0, 25);
    setFileQueue(
      validBatch.map((f, i) => ({
        id: `${f.name}-${f.size}-${Date.now()}-${i}`,
        file: f,
        status: 'pending',
        progress: 0,
      })),
    );
    setSummary(null);
    setBatchError(null);
  };

  const uploadSingleItem = async (item: FileUploadState): Promise<{ status: string }> => {
    // Set status to uploading with 0% progress
    setFileQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 0, message: null } : q)),
    );

    try {
      const resItem = await reportsApi.uploadSingle(patientId, item.file, (pct) => {
        setFileQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progress: pct, status: pct === 100 ? 'processing' : 'uploading' } : q)),
        );
      });

      setFileQueue((prev) =>
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
      setFileQueue((prev) =>
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

  const handleStartUpload = async () => {
    if (fileQueue.length === 0 || isUploading) return;

    setIsUploading(true);
    setBatchError(null);

    let uploadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Process files sequentially to maintain predictable server load and accurate progress
    for (const item of fileQueue) {
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

    if (uploadedCount > 0) {
      onUploadComplete();
    }
  };

  const handleRetrySingle = async (item: FileUploadState) => {
    if (isUploading) return;
    setIsUploading(true);
    const res = await uploadSingleItem(item);
    setIsUploading(false);

    if (res.status === 'uploaded') {
      onUploadComplete();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Upload Lab Reports — ${patientName}`}
      description="Upload the patient's laboratory reports in PDF format (up to 25 MB per report)."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {fileQueue.length === 0 ? (
          <FileDropzone
            onFilesSelected={handleFilesSelected}
            accept=".pdf,application/pdf"
            maxSizeMB={25}
            disabled={isUploading}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                {fileQueue.length} file{fileQueue.length !== 1 ? 's' : ''} in queue
              </span>
              {!isUploading && !summary && (
                <button
                  type="button"
                  onClick={() => setFileQueue([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '12px',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Choose different files
                </button>
              )}
            </div>

            {/* List of files with progress */}
            <div
              style={{
                maxHeight: '280px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
              }}
            >
              {fileQueue.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px 14px',
                    backgroundColor: 'var(--surface-muted)',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{ fontSize: '16px' }}>📄</span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '220px',
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

                  {/* Progress bar when uploading */}
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

                  {/* Message detail if available */}
                  {item.message && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: item.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {formatDoctorFriendlyError(item.message)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary notification banner */}
            {summary && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-input)',
                  backgroundColor:
                    summary.failed > 0
                      ? 'var(--warning-soft, #fef3c7)'
                      : summary.uploaded > 0
                        ? 'var(--success-soft, #dcfce7)'
                        : 'var(--surface-muted)',
                  border: `1px solid ${
                    summary.failed > 0
                      ? 'var(--warning, #b45309)'
                      : summary.uploaded > 0
                        ? 'var(--success, #15803d)'
                        : 'var(--border)'
                  }`,
                  fontSize: '13px',
                  color: 'var(--text)',
                }}
              >
                <strong>Batch Results:</strong> {summary.uploaded} report(s) uploaded and parsed
                {summary.skipped > 0 && `, ${summary.skipped} duplicate(s) skipped`}
                {summary.failed > 0 && `, ${summary.failed} failed`}
              </div>
            )}

            {batchError && (
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--danger)',
                  backgroundColor: 'var(--danger-soft, #fee2e2)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-input)',
                  margin: 0,
                }}
                role="alert"
              >
                {batchError}
              </p>
            )}
          </div>
        )}

        {/* Modal actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '8px',
          }}
        >
          <Button variant="secondary" onClick={handleClose} disabled={isUploading}>
            {summary ? 'Done' : 'Cancel'}
          </Button>

          {fileQueue.length > 0 && !summary && (
            <Button
              variant="primary"
              onClick={() => void handleStartUpload()}
              isLoading={isUploading}
            >
              Upload {fileQueue.length} File{fileQueue.length !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
