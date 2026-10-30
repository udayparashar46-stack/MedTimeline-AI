/**
 * App.tsx — Root component. Manages routing and backend health state.
 *
 * M2 adds:
 * - 'patients' route → PatientsPage (list + create/edit/delete)
 * - 'patient/:id' route → PatientWorkspacePage (workspace detail)
 * - Navigation from dashboard cards directly to patient workspaces
 */

import { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { StyleguidePage } from './pages/StyleguidePage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientWorkspacePage } from './pages/PatientWorkspacePage';
import { UploadPage } from './pages/UploadPage';
import { MappingPage } from './pages/MappingPage';
import { TimelinePage } from './pages/TimelinePage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';
import { authApi, getStoredToken, type UserResponse } from './lib/apiClient';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Parsed route with an optional ID parameter. */
interface Route {
  page: string;
  id?: string;
}

function parseRoute(route: string): Route {
  if (route === 'login' || route === 'register') {
    return { page: route };
  }
  if (route.startsWith('patient/')) {
    return { page: 'patient', id: route.slice('patient/'.length) };
  }
  if (route.startsWith('mapping/')) {
    return { page: 'mapping', id: route.slice('mapping/'.length) };
  }
  if (route.startsWith('timeline/')) {
    return { page: 'timeline', id: route.slice('timeline/'.length) };
  }
  return { page: route };
}

export function App() {
  const [currentRoute, setCurrentRoute] = useState<string>('dashboard');
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(() => {
    const token = getStoredToken();
    if (token) {
      return {
        id: 'user-cached',
        email: 'user@medtimeline.local',
        full_name: null,
        is_active: true,
        created_at: '',
      };
    }
    return null;
  });
  const [authLoading, setAuthLoading] = useState<boolean>(false);

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

  const loadCurrentUser = async () => {
    const token = getStoredToken();
    if (!token) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }
    try {
      const user = await authApi.me();
      setCurrentUser(user);
    } catch (err: unknown) {
      // Only logout and clear session if the server explicitly returned 401 Unauthorized
      const isUnauthorized = err instanceof Error && (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized'));
      if (isUnauthorized) {
        authApi.logout();
        setCurrentUser(null);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    loadCurrentUser();
  }, []);

  const handleLogout = () => {
    authApi.logout();
    setCurrentUser(null);
    setCurrentRoute('login');
  };

  const navigateToPatient = (patientId: string) => {
    setCurrentRoute(`patient/${patientId}`);
  };

  const renderContent = () => {
    const { page, id } = parseRoute(currentRoute);

    switch (page) {
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

      // M2: Patients list
      case 'patients':
      case 'workspaces':
        return <PatientsPage onNavigateToPatient={navigateToPatient} />;

      // M2: Individual patient workspace
      case 'patient':
        if (!id) {
          setCurrentRoute('patients');
          return null;
        }
        return (
          <PatientWorkspacePage
            patientId={id}
            onNavigateBack={() => setCurrentRoute('patients')}
            onNavigateTo={setCurrentRoute}
          />
        );

      case 'upload':
        return (
          <UploadPage
            onNavigateTo={setCurrentRoute}
            onNavigateToPatient={navigateToPatient}
          />
        );
      case 'timeline':
        return (
          <TimelinePage
            initialPatientId={id}
            onNavigateToWorkspace={navigateToPatient}
            onNavigateToReview={(patientId, _reportId) => navigateToPatient(patientId)}
          />
        );
      case 'mapping':
        return (
          <MappingPage
            initialPatientId={id}
            onNavigateToWorkspace={navigateToPatient}
          />
        );
      case 'settings':
        return <SettingsPage onNavigateTo={setCurrentRoute} />;
      case 'login':
        return (
          <AuthPage
            isRegister={false}
            onSuccess={() => {
              loadCurrentUser();
              setCurrentRoute('dashboard');
            }}
            onSwitchMode={() => setCurrentRoute('register')}
          />
        );
      case 'register':
        return (
          <AuthPage
            isRegister={true}
            onSuccess={() => {
              loadCurrentUser();
              setCurrentRoute('dashboard');
            }}
            onSwitchMode={() => setCurrentRoute('login')}
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

  if (authLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading workspace...</div>
      </div>
    );
  }

  // If unauthenticated and on a protected page, render AuthPage in an uncluttered view or inside shell
  const isAuthRoute = currentRoute === 'login' || currentRoute === 'register';

  if (!currentUser && !isAuthRoute) {
    return (
      <AppShell
        currentRoute="login"
        onRouteChange={setCurrentRoute}
        connectionStatus={status}
        onRetryConnection={checkHealth}
        currentUser={null}
        onLogout={handleLogout}
      >
        <AuthPage
          isRegister={false}
          onSuccess={() => {
            loadCurrentUser();
            setCurrentRoute('dashboard');
          }}
          onSwitchMode={() => setCurrentRoute('register')}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      currentRoute={parseRoute(currentRoute).page}
      onRouteChange={setCurrentRoute}
      connectionStatus={status}
      onRetryConnection={checkHealth}
      currentUser={currentUser}
      onLogout={handleLogout}
    >
      {renderContent()}
    </AppShell>
  );
}

export default App;
