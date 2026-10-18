import React, { forwardRef, useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, id, disabled, style, className = '', ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && (
          <label
            htmlFor={selectId}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: 'var(--radius-input)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            backgroundColor: disabled ? 'var(--surface-muted)' : 'var(--surface)',
            color: 'var(--text)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            transition: 'border-color 150ms ease-out',
            ...style,
          }}
          className={`select-control ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <span id={`${selectId}-error`} style={{ fontSize: '12px', color: 'var(--danger)' }}>
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={`${selectId}-helper`} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
