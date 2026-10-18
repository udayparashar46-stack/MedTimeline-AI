import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { DisclaimerBanner } from './DisclaimerBanner';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';

export interface AppShellProps {
  currentRoute: string;
  onRouteChange: (route: string) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onRetryConnection: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  onRouteChange,
  connectionStatus,
  onRetryConnection,
  children,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getPageTitle = (route: string) => {
    switch (route) {
      case 'dashboard':
        return 'System Dashboard';
      case 'workspaces':
        return 'Patient Workspaces';
      case 'timeline':
        return 'Lab Timeline View';
      case 'mapping':
        return 'Canonical Test Mapping';
      case 'styleguide':
        return 'UI Component Styleguide';
      case 'settings':
        return 'Settings & Privacy Policy';
      default:
        return 'Overview';
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <Sidebar
        currentRoute={currentRoute}
        onRouteChange={onRouteChange}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header Bar */}
        <header
          style={{
            height: '60px',
            backgroundColor: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Mobile menu trigger */}
            <IconButton
              aria-label="Toggle navigation menu"
              variant="ghost"
              size="sm"
              style={{ display: window.innerWidth < 768 ? 'inline-flex' : 'none' }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              ☰
            </IconButton>

            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {getPageTitle(currentRoute)}
              </h2>
            </div>
          </div>

          {/* Right Header Status Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Badge
              variant={
                connectionStatus === 'connected'
                  ? 'confirmed'
                  : connectionStatus === 'disconnected'
                    ? 'danger'
                    : 'warning'
              }
              dot
            >
              {connectionStatus === 'connected' && 'Backend connected'}
              {connectionStatus === 'disconnected' && 'Disconnected'}
              {connectionStatus === 'connecting' && 'Connecting...'}
            </Badge>

            <Button variant="secondary" size="sm" onClick={onRetryConnection}>
              Check Connection
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>

        {/* FR6 Medical Disclaimer */}
        <DisclaimerBanner />
      </div>
    </div>
  );
};
