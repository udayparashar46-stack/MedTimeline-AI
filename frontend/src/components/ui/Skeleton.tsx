import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  circle = false,
  style,
  className = '',
  ...props
}) => {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: circle ? '50%' : 'var(--radius-input)',
        backgroundColor: 'var(--surface-muted)',
        backgroundImage: 'linear-gradient(90deg, var(--surface-muted) 0px, var(--border) 50%, var(--surface-muted) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        ...style,
      }}
      className={`skeleton-pulse ${className}`}
      {...props}
    />
  );
};
