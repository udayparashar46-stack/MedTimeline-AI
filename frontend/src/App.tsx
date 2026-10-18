import { useEffect, useState } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const checkHealth = async () => {
    setStatus('connecting');
    setErrorDetails(null);
    try {
      const response = await fetch('/api/v1/health');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = (await response.json()) as { status: string };
      if (data.status === 'ok') {
        setStatus('connected');
      } else {
        throw new Error(`Unexpected status response: ${data.status}`);
      }
    } catch (err) {
      setStatus('disconnected');
      setErrorDetails(err instanceof Error ? err.message : 'Unknown connection error');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Disclaimer Banner (FR6) */}
      <header
        style={{
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
            }}
          />
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
            MedTimeline AI
          </h1>
          <span
            style={{
              fontSize: '12px',
              backgroundColor: 'var(--surface-muted)',
              color: 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: '999px',
            }}
          >
            Milestone 0: Foundations
          </span>
        </div>

        {/* Backend Connection Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            data-testid="status-indicator"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 500,
              padding: '4px 12px',
              borderRadius: '999px',
              backgroundColor:
                status === 'connected'
                  ? 'rgba(21, 128, 61, 0.1)'
                  : status === 'disconnected'
                    ? 'rgba(180, 35, 24, 0.1)'
                    : 'rgba(180, 83, 9, 0.1)',
              color:
                status === 'connected'
                  ? 'var(--success)'
                  : status === 'disconnected'
                    ? 'var(--danger)'
                    : 'var(--warning)',
              border: `1px solid ${
                status === 'connected'
                  ? 'var(--success)'
                  : status === 'disconnected'
                    ? 'var(--danger)'
                    : 'var(--warning)'
              }`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'currentColor',
              }}
            />
            {status === 'connected' && 'Backend connected'}
            {status === 'disconnected' && 'Disconnected'}
            {status === 'connecting' && 'Connecting...'}
          </div>

          <button
            type="button"
            onClick={checkHealth}
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '48px 24px',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            System Foundation Shell
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
            Milestone 0 verifies that the frontend development environment and the local FastAPI
            backend communicate reliably over localhost.
          </p>

          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--surface-muted)',
              borderRadius: '6px',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            <div>
              <strong>Target Health Endpoint:</strong> <code>GET /api/v1/health</code>
            </div>
            <div>
              <strong>Backend Binding:</strong> <code>127.0.0.1:8000</code>
            </div>
            <div>
              <strong>Current Status:</strong>{' '}
              <span
                data-testid="status-text"
                style={{
                  fontWeight: 600,
                  color:
                    status === 'connected'
                      ? 'var(--success)'
                      : status === 'disconnected'
                        ? 'var(--danger)'
                        : 'var(--warning)',
                }}
              >
                {status === 'connected' && 'Backend connected'}
                {status === 'disconnected' && 'Disconnected'}
                {status === 'connecting' && 'Connecting...'}
              </span>
            </div>
            {errorDetails && (
              <div style={{ marginTop: '8px', color: 'var(--danger)' }}>
                <strong>Error:</strong> {errorDetails}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Disclaimer */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        Generated from user-uploaded reports. Not medical advice. Verify against original reports.
      </footer>
    </div>
  );
}

export default App;
