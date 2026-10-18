import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App Shell, Navigation & Health Status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders app title and initial connecting state', () => {
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

  it('navigates to the Styleguide and displays design system components', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Backend connected').length).toBeGreaterThan(0);
    });

    // Click on UI Styleguide in the sidebar navigation
    const styleguideNavBtn = screen.getByRole('button', { name: /ui styleguide/i });
    fireEvent.click(styleguideNavBtn);

    expect(screen.getByText('Design System & Component Styleguide')).toBeInTheDocument();
    expect(screen.getByText('Buttons & IconButtons')).toBeInTheDocument();
  });

  it('switches tabs within the Styleguide', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Backend connected').length).toBeGreaterThan(0);
    });

    // Navigate to styleguide
    fireEvent.click(screen.getByRole('button', { name: /ui styleguide/i }));

    // Switch to Timeline Table States tab
    fireEvent.click(screen.getByRole('tab', { name: /timeline table states/i }));
    expect(screen.getByText('Timeline Table Signature States (Section 4 & 5)')).toBeInTheDocument();
    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
  });
});
