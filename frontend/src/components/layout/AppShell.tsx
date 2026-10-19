import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { DisclaimerBanner } from './DisclaimerBanner';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';

import { UserResponse } from '../../lib/apiClient';

export interface AppShellProps {
  currentRoute: string;
  onRouteChange: (route: string) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onRetryConnection: () => void;
  currentUser?: UserResponse | null;
  onLogout?: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  onRouteChange,
  connectionStatus,
  onRetryConnection,
  currentUser,
  onLogout,
  children,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getPageTitle = (route: string) => {
    switch (route) {
      case 'dashboard':
        return 'Medical Dashboard';
      case 'patients':
      case 'workspaces':
        return 'Patients';
      case 'timeline':
        return 'Report Timeline';
      case 'upload':
        return 'Upload Reports';
      case 'mapping':
        return 'Test Mapping';
      case 'styleguide':
        return 'UI Component Styleguide';
      case 'settings':
        return 'Settings & Privacy';
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

            {currentUser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {currentUser.email}
                </span>
                {onLogout && (
                  <Button variant="ghost" size="sm" onClick={onLogout}>
                    Sign Out
                  </Button>
                )}
              </div>
            )}

            <Button variant="secondary" size="sm" onClick={onRetryConnection}>
              Check Connection
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>

        {/* FR6 Medical Disclaimer */}
        <DisclaimerBanner />
      </div>
    </div>
  );
};
