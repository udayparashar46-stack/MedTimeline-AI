import React from 'react';

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  children,
  style,
  className = '',
  ...props
}) => (
  <div
    style={{
      width: '100%',
      overflowX: 'auto',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      backgroundColor: 'var(--surface)',
    }}
  >
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        textAlign: 'left',
        fontSize: '13px',
        ...style,
      }}
      className={`data-table ${className}`}
      {...props}
    >
      {children}
    </table>
  </div>
);

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  style,
  ...props
}) => (
  <thead
    style={{
      backgroundColor: 'var(--surface-muted)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      ...style,
    }}
    {...props}
  >
    {children}
  </thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  style,
  ...props
}) => (
  <tbody style={{ ...style }} {...props}>
    {children}
  </tbody>
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  style,
  ...props
}) => (
  <tr
    style={{
      borderBottom: '1px solid var(--border)',
      transition: 'background-color 100ms ease-out',
      ...style,
    }}
    {...props}
  >
    {children}
  </tr>
);

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  style,
  ...props
}) => (
  <th
    style={{
      padding: '10px 16px',
      fontWeight: 600,
      color: 'var(--text-muted)',
      fontSize: '12px',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      ...style,
    }}
    {...props}
  >
    {children}
  </th>
);

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  cellState?: 'default' | 'blank' | 'unreviewed' | 'edited' | 'flag-high' | 'flag-low';
  isStickyColumn?: boolean;
}

export const TableCell: React.FC<TableCellProps> = ({
  children,
  cellState = 'default',
  isStickyColumn = false,
  style,
  ...props
}) => {
  const stateStyles: Record<string, React.CSSProperties> = {
    default: {},
    blank: {
      color: 'var(--text-muted)',
      fontStyle: 'italic',
    },
    unreviewed: {
      textDecoration: 'underline dashed var(--warning)',
      textUnderlineOffset: '3px',
    },
    edited: {
      position: 'relative',
    },
    'flag-high': {
      backgroundColor: 'var(--flag-high)',
      color: 'var(--danger)',
      fontWeight: 500,
    },
    'flag-low': {
      backgroundColor: 'var(--flag-low)',
      color: 'var(--info)',
      fontWeight: 500,
    },
  };

  const stickyStyle: React.CSSProperties = isStickyColumn
    ? {
        position: 'sticky',
        left: 0,
        backgroundColor: 'inherit',
        zIndex: 5,
        boxShadow: '2px 0 4px -2px rgba(15, 27, 45, 0.08)',
      }
    : {};

  return (
    <td
      style={{
        padding: '10px 16px',
        color: 'var(--text)',
        ...stickyStyle,
        ...stateStyles[cellState],
        ...style,
      }}
      className="tabular-nums"
      {...props}
    >
      {cellState === 'edited' && (
        <span
          title="Edited value"
          style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary)',
            marginRight: '6px',
            verticalAlign: 'middle',
          }}
        />
      )}
      {children}
    </td>
  );
};
