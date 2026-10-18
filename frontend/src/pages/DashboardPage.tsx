import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';

export interface DashboardPageProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onNavigateTo: (route: string) => void;
  onRetryConnection: () => void;
  errorDetails: string | null;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  connectionStatus,
  onNavigateTo,
  onRetryConnection,
  errorDetails,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Welcome & Overview Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Medical Timeline Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Deterministic lab report timeline extraction with complete user review and evidence tracking.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Button variant="secondary" onClick={() => onNavigateTo('styleguide')}>
            Open Styleguide
          </Button>
          <Button variant="primary" onClick={() => onNavigateTo('workspaces')}>
            + New Workspace
          </Button>
        </div>
      </div>

      {/* System Health Card */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>System & Health Status</CardTitle>
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
          </div>
          <CardDescription>Live health probe checking backend liveness at /api/v1/health</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--surface-muted)',
              borderRadius: 'var(--radius-input)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div>
              <strong>Target Health Endpoint:</strong> <code>GET /api/v1/health</code>
            </div>
            <div>
              <strong>Backend Host:</strong> <code>http://127.0.0.1:8000</code> (Localhost strictly)
            </div>
            <div>
              <strong>Connection State:</strong>{' '}
              <span
                data-testid="status-text"
                style={{
                  fontWeight: 600,
                  color:
                    connectionStatus === 'connected'
                      ? 'var(--success)'
                      : connectionStatus === 'disconnected'
                        ? 'var(--danger)'
                        : 'var(--warning)',
                }}
              >
                {connectionStatus === 'connected' && 'Backend connected'}
                {connectionStatus === 'disconnected' && 'Disconnected'}
                {connectionStatus === 'connecting' && 'Connecting...'}
              </span>
            </div>
            {errorDetails && (
              <div style={{ color: 'var(--danger)', marginTop: '4px' }}>
                <strong>Error details:</strong> {errorDetails}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="sm" onClick={onRetryConnection}>
            Re-test Health Check
          </Button>
        </CardFooter>
      </Card>

      {/* Guiding Principles Banner */}
      <Banner variant="info">
        <strong>Guiding Principles:</strong> Deterministic parsing first. A blank cell is always
        better than a wrong number. Nothing is invented, guessed, or silently modified.
      </Banner>

      {/* Feature Navigation Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        <Card
          variant="interactive"
          onClick={() => onNavigateTo('workspaces')}
          style={{ cursor: 'pointer' }}
        >
          <CardHeader>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📁</div>
            <CardTitle>Patient Workspaces</CardTitle>
            <CardDescription>
              Create and manage isolated workspaces for individual patients. (M2)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Organize multiple lab reports under patient labels with nickname support for privacy.
            </p>
          </CardContent>
        </Card>

        <Card
          variant="interactive"
          onClick={() => onNavigateTo('timeline')}
          style={{ cursor: 'pointer' }}
        >
          <CardHeader>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
            <CardTitle>Timeline Matrix</CardTitle>
            <CardDescription>
              Chronological test comparison across dates and laboratories. (M8)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Tests as rows, dates as columns. Inspect source snippets and jump directly to PDF pages.
            </p>
          </CardContent>
        </Card>

        <Card
          variant="interactive"
          onClick={() => onNavigateTo('styleguide')}
          style={{ cursor: 'pointer' }}
        >
          <CardHeader>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎨</div>
            <CardTitle>Design System</CardTitle>
            <CardDescription>
              Explore all components, badges, forms, and states in the styleguide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Deep teal tokens, WCAG AA contrast, accessible focus rings, and modular UI kit.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
