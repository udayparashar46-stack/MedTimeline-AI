import React from 'react';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, variant = 'info', onDismiss }) => {
  const borderColors: Record<ToastVariant, string> = {
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
  };

  return (
    <div
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        borderRadius: 'var(--radius-input)',
        backgroundColor: 'var(--surface)',
        borderLeft: `4px solid ${borderColors[variant]}`,
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        fontSize: '13px',
        color: 'var(--text)',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
