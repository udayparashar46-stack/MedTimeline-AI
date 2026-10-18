import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      style,
      className = '',
      ...props
    },
    ref,
  ) => {
    const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
      sm: { padding: '6px 12px', fontSize: '12px', borderRadius: 'var(--radius-input)' },
      md: { padding: '8px 16px', fontSize: '14px', borderRadius: 'var(--radius-input)' },
      lg: { padding: '12px 20px', fontSize: '16px', borderRadius: 'var(--radius-input)' },
    };

    const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
      primary: {
        backgroundColor: 'var(--primary)',
        color: '#FFFFFF',
        border: '1px solid transparent',
      },
      secondary: {
        backgroundColor: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: 'var(--text-muted)',
        border: '1px solid transparent',
      },
      danger: {
        backgroundColor: 'var(--danger)',
        color: '#FFFFFF',
        border: '1px solid transparent',
      },
    };

    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontWeight: 500,
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.6 : 1,
      transition: 'background-color 150ms ease-out, border-color 150ms ease-out, opacity 150ms ease-out',
      lineHeight: 1.4,
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={baseStyle}
        className={`btn-interactive ${className}`}
        {...props}
      >
        {isLoading && (
          <span
            data-testid="loading-spinner"
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.7s linear infinite',
            }}
          />
        )}
        {!isLoading && leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  },
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, variant = 'ghost', size = 'md', style, ...props }, ref) => {
    const iconSizes: Record<ButtonSize, { width: string; height: string }> = {
      sm: { width: '28px', height: '28px' },
      md: { width: '36px', height: '36px' },
      lg: { width: '44px', height: '44px' },
    };

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        style={{
          ...iconSizes[size],
          padding: 0,
          borderRadius: 'var(--radius-input)',
          ...style,
        }}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

IconButton.displayName = 'IconButton';
