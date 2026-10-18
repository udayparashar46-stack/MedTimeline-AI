import React, { useState } from 'react';
import { Button } from './Button';

export interface FileDropzoneProps {
  onFilesSelected?: (files: File[]) => void;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFilesSelected,
  accept = '.pdf,application/pdf',
  maxSizeMB = 20,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected?.(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected?.(Array.from(e.target.files));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
        backgroundColor: isDragOver ? 'var(--primary-soft)' : 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        padding: '36px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 150ms ease-out',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        id="file-dropzone-input"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📑</div>
      <label
        htmlFor="file-dropzone-input"
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Drop lab report PDFs here, or click to browse
      </label>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Supports text-based PDFs up to {maxSizeMB} MB. Multi-file upload supported.
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => document.getElementById('file-dropzone-input')?.click()}
      >
        Select PDF Files
      </Button>
    </div>
  );
};
