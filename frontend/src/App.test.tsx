import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App Shell & Backend Connection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders app title and initial connecting state', () => {
    // Return a pending promise to observe the connecting state
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<App />);
    expect(screen.getByText('MedTimeline AI')).toBeInTheDocument();
    expect(screen.getAllByText('Connecting...').length).toBeGreaterThan(0);
  });

  it('displays "Backend connected" when health check returns ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Backend connected').length).toBeGreaterThan(0);
    });
  });

  it('displays "Disconnected" when health check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Disconnected').length).toBeGreaterThan(0);
    });
  });
});
