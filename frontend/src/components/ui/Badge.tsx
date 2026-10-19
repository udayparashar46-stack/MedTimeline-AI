import React from 'react';

export type BadgeVariant =
  | 'confirmed'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'edited'
  | 'flag-high'
  | 'flag-low';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  dot = false,
  style,
  className = '',
  ...props
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; color: string; border: string; label?: string }> = {
    confirmed: {
      bg: 'rgba(21, 128, 61, 0.1)',
      color: 'var(--success)',
      border: 'rgba(21, 128, 61, 0.3)',
    },
    success: {
      bg: 'rgba(21, 128, 61, 0.1)',
      color: 'var(--success)',
      border: 'rgba(21, 128, 61, 0.3)',
    },

    warning: {
      bg: 'rgba(180, 83, 9, 0.1)',
      color: 'var(--warning)',
      border: 'rgba(180, 83, 9, 0.3)',
    },
    danger: {
      bg: 'rgba(180, 35, 24, 0.1)',
      color: 'var(--danger)',
      border: 'rgba(180, 35, 24, 0.3)',
    },
    info: {
      bg: 'rgba(29, 78, 216, 0.1)',
      color: 'var(--info)',
      border: 'rgba(29, 78, 216, 0.3)',
    },
    neutral: {
      bg: 'var(--surface-muted)',
      color: 'var(--text-muted)',
      border: 'var(--border)',
    },
    edited: {
      bg: 'var(--primary-soft)',
      color: 'var(--primary)',
      border: 'rgba(15, 118, 110, 0.3)',
    },
    'flag-high': {
      bg: 'var(--flag-high)',
      color: 'var(--danger)',
      border: 'rgba(180, 35, 24, 0.25)',
    },
    'flag-low': {
      bg: 'var(--flag-low)',
      color: 'var(--info)',
      border: 'rgba(29, 78, 216, 0.25)',
    },
  };

  const current = variantStyles[variant] || variantStyles.neutral;


  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 10px',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: 'var(--radius-badge)',
        backgroundColor: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        lineHeight: 1.4,
        ...style,
      }}
      className={`status-badge ${className}`}
      {...props}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'currentColor',
          }}
        />
      )}
      {children}
    </span>
  );
};
