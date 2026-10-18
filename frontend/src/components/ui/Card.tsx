import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'muted' | 'interactive';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = 'default', style, className = '', ...props }, ref) => {
    const variantStyles: Record<string, React.CSSProperties> = {
      default: {
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      },
      muted: {
        backgroundColor: 'var(--surface-muted)',
        border: '1px solid var(--border)',
      },
      interactive: {
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'transform 150ms ease-out, border-color 150ms ease-out',
      },
    };

    return (
      <div
        ref={ref}
        style={{
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          ...variantStyles[variant],
          ...style,
        }}
        className={`card ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  style,
  ...props
}) => (
  <div
    style={{
      padding: '20px 24px 12px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  style,
  ...props
}) => (
  <h3
    style={{
      fontSize: '16px',
      fontWeight: 600,
      color: 'var(--text)',
      margin: 0,
      ...style,
    }}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  style,
  ...props
}) => (
  <p
    style={{
      fontSize: '13px',
      color: 'var(--text-muted)',
      margin: 0,
      ...style,
    }}
    {...props}
  >
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  style,
  ...props
}) => (
  <div
    style={{
      padding: '12px 24px 20px 24px',
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  style,
  ...props
}) => (
  <div
    style={{
      padding: '12px 24px',
      borderTop: '1px solid var(--border)',
      backgroundColor: 'var(--surface-muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '12px',
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);
