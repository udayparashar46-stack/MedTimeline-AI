import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';
import * as apiClient from './lib/apiClient';

// Ensure a default authenticated user exists in Vitest environment
beforeEach(() => {
  localStorage.setItem('auth_token', 'test-vitest-jwt-token');
  vi.spyOn(apiClient.authApi, 'me').mockResolvedValue({
    id: 'test-user-vitest',
    email: 'test@medtimeline.local',
    full_name: 'Test Clinician',
    is_active: true,
    created_at: '2026-10-18T00:00:00Z',
  });
});
