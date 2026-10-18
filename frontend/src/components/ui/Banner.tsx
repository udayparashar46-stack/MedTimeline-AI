import React from 'react';

export type BannerVariant = 'disclaimer' | 'warning' | 'info';

export interface BannerProps {
  variant?: BannerVariant;
  children: React.ReactNode;
}

export const Banner: React.FC<BannerProps> = ({ variant = 'disclaimer', children }) => {
  const styles: Record<BannerVariant, { bg: string; border: string; text: string; icon: string }> = {
    disclaimer: {
      bg: 'var(--surface)',
      border: 'var(--border)',
      text: 'var(--text-muted)',
      icon: 'ℹ️',
    },
    warning: {
      bg: 'var(--warning-soft)',
      border: 'rgba(180, 83, 9, 0.3)',
      text: 'var(--warning)',
      icon: '⚠️',
    },
    info: {
      bg: 'var(--info-soft)',
      border: 'rgba(29, 78, 216, 0.3)',
      text: 'var(--info)',
      icon: '💡',
    },
  };

  const current = styles[variant];

  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        backgroundColor: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: 'var(--radius-input)',
        fontSize: '12px',
        color: current.text,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true">{current.icon}</span>
      <span>{children}</span>
    </div>
  );
};
