import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftAddon, id, disabled, style, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            {label}
          </label>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            width: '100%',
          }}
        >
          {leftAddon && (
            <span
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              {leftAddon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            style={{
              width: '100%',
              padding: leftAddon ? '8px 12px 8px 36px' : '8px 12px',
              fontSize: '14px',
              borderRadius: 'var(--radius-input)',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              backgroundColor: disabled ? 'var(--surface-muted)' : 'var(--surface)',
              color: 'var(--text)',
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'not-allowed' : 'text',
              transition: 'border-color 150ms ease-out',
              ...style,
            }}
            className={`input-control ${className}`}
            {...props}
          />
        </div>
        {error && (
          <span id={`${inputId}-error`} style={{ fontSize: '12px', color: 'var(--danger)' }}>
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={`${inputId}-helper`} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export interface DateInputProps extends Omit<InputProps, 'type'> {}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>((props, ref) => {
  return <Input ref={ref} type="date" {...props} />;
});

DateInput.displayName = 'DateInput';
