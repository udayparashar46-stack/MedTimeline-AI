import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        border: '1px dashed var(--border)',
      }}
    >
      {icon && (
        <div
          style={{
            fontSize: '32px',
            marginBottom: '16px',
            color: 'var(--text-muted)',
          }}
        >
          {icon}
        </div>
      )}
      <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
        {title}
      </h4>
      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          maxWidth: '360px',
          marginBottom: actionLabel ? '20px' : '0',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
