import React from 'react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        padding: '12px 24px',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--text-muted)',
      }}
    >
      Generated from user-uploaded reports. Not medical advice. Verify against original reports.
    </footer>
  );
};
