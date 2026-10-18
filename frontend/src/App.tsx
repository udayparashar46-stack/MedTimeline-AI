import { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { StyleguidePage } from './pages/StyleguidePage';
import { EmptyState } from './components/ui/EmptyState';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function App() {
  const [currentRoute, setCurrentRoute] = useState<string>('dashboard');
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
        throw new Error(`Unexpected response: ${data.status}`);
      }
    } catch (err) {
      setStatus('disconnected');
      setErrorDetails(err instanceof Error ? err.message : 'Unknown connection error');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const renderContent = () => {
    switch (currentRoute) {
      case 'dashboard':
        return (
          <DashboardPage
            connectionStatus={status}
            onNavigateTo={setCurrentRoute}
            onRetryConnection={checkHealth}
            errorDetails={errorDetails}
          />
        );
      case 'styleguide':
        return <StyleguidePage />;
      case 'workspaces':
        return (
          <EmptyState
            icon="📁"
            title="Patient Workspaces (Milestone 2)"
            description="Patient models, workspace creation, and report file lists will be implemented in Milestone 2."
            actionLabel="Return to Dashboard"
            onAction={() => setCurrentRoute('dashboard')}
          />
        );
      case 'timeline':
        return (
          <EmptyState
            icon="📈"
            title="Lab Timeline Table (Milestone 8)"
            description="The chronological date-wise matrix with sticky columns and PDF source jump will be implemented in Milestone 8."
            actionLabel="Return to Dashboard"
            onAction={() => setCurrentRoute('dashboard')}
          />
        );
      case 'mapping':
        return (
          <EmptyState
            icon="🏷️"
            title="Test Normalization & Mapping (Milestone 7)"
            description="Alias normalization and suggestions to match variations like Hb -> Hemoglobin will be implemented in Milestone 7."
            actionLabel="Return to Dashboard"
            onAction={() => setCurrentRoute('dashboard')}
          />
        );
      case 'settings':
        return (
          <EmptyState
            icon="⚙️"
            title="Settings & Privacy Statement"
            description="Local data privacy policy, version information, and 'Delete Everything' cascade will be implemented in Milestone 11."
            actionLabel="Return to Dashboard"
            onAction={() => setCurrentRoute('dashboard')}
          />
        );
      default:
        return (
          <DashboardPage
            connectionStatus={status}
            onNavigateTo={setCurrentRoute}
            onRetryConnection={checkHealth}
            errorDetails={errorDetails}
          />
        );
    }
  };

  return (
    <AppShell
      currentRoute={currentRoute}
      onRouteChange={setCurrentRoute}
      connectionStatus={status}
      onRetryConnection={checkHealth}
    >
      {renderContent()}
    </AppShell>
  );
}

export default App;
