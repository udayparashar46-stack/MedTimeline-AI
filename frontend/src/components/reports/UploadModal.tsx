/**
 * UploadModal.tsx — Multi-PDF report upload modal for a patient workspace.
 *
 * Implements M3 requirements:
 * - Multi-file drag-and-drop or file browser via FileDropzone
 * - Validates PDF extension, size limit (20 MB), and content on server
 * - Live per-file progress and result items (Uploaded, Duplicate Skipped, Failed)
 * - Clear warning when duplicate SHA-256 files are detected
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { FileDropzone } from '../ui/FileDropzone';
import { reportsApi, type ReportUploadItem } from '../../lib/apiClient';

interface UploadModalProps {
  isOpen: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface FileUploadState {
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'duplicate_skipped' | 'failed';
  message?: string | null;
}

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
    // Only accept up to 25 files
    const validBatch = files.slice(0, 25);
    setFileQueue(
      validBatch.map((f) => ({
        file: f,
        status: 'pending',
      })),
    );
    setSummary(null);
    setBatchError(null);
  };

  const handleStartUpload = async () => {
    if (fileQueue.length === 0 || isUploading) return;

    setIsUploading(true);
    setBatchError(null);

    // Mark all as uploading
    setFileQueue((prev) => prev.map((item) => ({ ...item, status: 'uploading' })));

    try {
      const filesToSend = fileQueue.map((item) => item.file);
      const res = await reportsApi.upload(patientId, filesToSend);

      // Match results back to queue items
      const resultMap = new Map<string, ReportUploadItem>();
      for (const item of res.items) {
        resultMap.set(item.filename, item);
      }

      setFileQueue((prev) =>
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
            message: 'Server did not report status for this file.',
          };
        }),
      );

      setSummary({
        uploaded: res.uploaded_count,
        skipped: res.skipped_count,
        failed: res.failed_count,
      });

      if (res.uploaded_count > 0) {
        onUploadComplete();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setBatchError(msg);
      setFileQueue((prev) =>
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Upload Lab Reports — ${patientName}`}
      description="Upload PDF lab reports. Text-based PDFs up to 20 MB are supported."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {fileQueue.length === 0 ? (
          <FileDropzone
            onFilesSelected={handleFilesSelected}
            accept=".pdf,application/pdf"
            maxSizeMB={20}
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
                {fileQueue.length} file{fileQueue.length !== 1 ? 's' : ''} selected
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

            {/* List of files in queue */}
            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
              }}
            >
              {fileQueue.map((item, idx) => (
                <div
                  key={`${item.file.name}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: 'var(--surface-muted)',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    gap: '12px',
                  }}
                >
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
                          maxWidth: '240px',
                        }}
                        title={item.file.name}
                      >
                        {item.file.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {formatSize(item.file.size)}
                        {item.message && ` • ${item.message}`}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
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
                  padding: '12px 14px',
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
                }}
              >
                <strong>Upload Summary:</strong> {summary.uploaded} uploaded
                {summary.skipped > 0 && `, ${summary.skipped} duplicate(s) skipped`}
                {summary.failed > 0 && `, ${summary.failed} failed`}
              </div>
            )}

            {batchError && (
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
                {batchError}
              </p>
            )}
          </div>
        )}

        {/* Modal footer actions */}
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
