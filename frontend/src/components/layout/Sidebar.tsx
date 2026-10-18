import React from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: string;
}

export interface SidebarProps {
  currentRoute: string;
  onRouteChange: (route: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onRouteChange,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'patients', label: 'Patients', icon: '👥', badge: '12' },
    { id: 'timeline', label: 'Report Timeline', icon: '📈' },
    { id: 'upload', label: 'Upload Reports', icon: '📤' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'styleguide', label: 'UI Styleguide', icon: '🎨', badge: 'M1' },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            zIndex: 40,
          }}
          onClick={onCloseMobile}
        />
      )}

      <aside
        style={{
          width: '240px',
          backgroundColor: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 45,
          position: isOpenMobile ? 'fixed' : 'relative',
          top: 0,
          bottom: 0,
          left: 0,
          transform: isOpenMobile || window.innerWidth >= 768 ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        {/* Brand header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '4px',
              backgroundColor: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: '10px',
              fontWeight: 700,
            }}
          >
            +
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              MedTimeline AI
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Lab Report Intelligence</div>
          </div>
        </div>

        {/* Navigation list */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const isActive = currentRoute === item.id || (item.id === 'patients' && currentRoute === 'workspaces');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onRouteChange(item.id);
                  onCloseMobile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-input)',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--primary-soft)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text)',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 150ms ease-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '1px 7px',
                      borderRadius: '999px',
                      backgroundColor: isActive ? 'rgba(15, 118, 110, 0.15)' : 'var(--surface-muted)',
                      color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface-muted)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ fontWeight: 500, color: 'var(--text)' }}>MedTimeline SaaS v0.1.0</div>
          <div>Localhost • 127.0.0.1:8000</div>
        </div>
      </aside>
    </>
  );
};
