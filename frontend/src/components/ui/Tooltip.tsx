import React, { useState } from 'react';

export interface TooltipProps {
  content: string;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            backgroundColor: 'var(--text)',
            color: '#FFFFFF',
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            zIndex: 30,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};
