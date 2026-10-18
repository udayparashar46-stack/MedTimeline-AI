import React from 'react';
import { Badge } from './Badge';

export type ReportStatus = 'queued' | 'processing' | 'needs_review' | 'reviewed' | 'failed';

export interface ProgressRowProps {
  filename: string;
  status: ReportStatus;
  pageCount?: number;
  extractedCount?: number;
  failureReason?: string;
}

export const ProgressRow: React.FC<ProgressRowProps> = ({
  filename,
  status,
  pageCount,
  extractedCount,
  failureReason,
}) => {
  const statusBadges: Record<ReportStatus, { label: string; variant: 'neutral' | 'warning' | 'confirmed' | 'danger' }> = {
    queued: { label: 'Queued', variant: 'neutral' },
    processing: { label: 'Processing', variant: 'warning' },
    needs_review: { label: 'Ready for review', variant: 'warning' },
    reviewed: { label: 'Reviewed', variant: 'confirmed' },
    failed: { label: 'Failed', variant: 'danger' },
  };

  const badgeInfo = statusBadges[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-input)',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <span style={{ fontSize: '18px', color: 'var(--primary)' }}>📄</span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {filename}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {pageCount !== undefined && `${pageCount} pages`}
            {extractedCount !== undefined && ` • ${extractedCount} rows extracted`}
            {failureReason && ` • ${failureReason}`}
          </div>
        </div>
      </div>

      <Badge variant={badgeInfo.variant} dot={status === 'processing'}>
        {badgeInfo.label}
      </Badge>
    </div>
  );
};
