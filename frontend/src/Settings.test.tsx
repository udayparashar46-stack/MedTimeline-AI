import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from './pages/SettingsPage';
import { systemApi } from './lib/apiClient';

describe('Milestones 11 & 12: Settings, Privacy, and System Administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders privacy architecture and local security guarantees', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Settings & System Information')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1 Localhost Binding')).toBeInTheDocument();
    expect(screen.getByText('Zero External Trackers')).toBeInTheDocument();
    expect(screen.getByText('Zero AI/LLM on Patient Data')).toBeInTheDocument();
    expect(screen.getByText('Anonymous UUID Storage')).toBeInTheDocument();
  });

  it('renders the mandatory medical disclaimer', () => {
    render(<SettingsPage />);

    const disclaimerElements = screen.getAllByText(
      /"Generated from user-uploaded reports\. Not medical advice\. Verify against original reports\."/i
    );
    expect(disclaimerElements.length).toBeGreaterThan(0);
  });

  it('renders known operational limitations', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Known Operational Limitations')).toBeInTheDocument();
    expect(screen.getByText(/Text-Based PDFs Only \(No OCR\)/i)).toBeInTheDocument();
    expect(screen.getByText(/No Automatic Unit Conversion/i)).toBeInTheDocument();
  });

  it('requires typed confirmation before enabling delete everything', async () => {
    render(<SettingsPage />);

    // Click trigger to open modal
    const openBtn = screen.getByRole('button', { name: /Permanently Delete Everything/i });
    fireEvent.click(openBtn);

    // Modal opens
    expect(screen.getByText(/Confirm Complete System Reset/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirm System Reset/i });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByLabelText(/Confirm typed reset text/i);

    // Type partial or wrong text -> remains disabled
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(confirmBtn).toBeDisabled();

    // Type exact string
    fireEvent.change(input, { target: { value: 'DELETE EVERYTHING' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls systemApi.reset and displays success summary upon confirmation', async () => {
    const resetSpy = vi.spyOn(systemApi, 'reset').mockResolvedValue({
      status: 'reset_complete',
      patients_deleted: 3,
      reports_deleted: 8,
      results_deleted: 54,
      files_deleted: 8,
      message: 'All local patient records have been permanently erased.',
    });

    render(<SettingsPage />);

    const openBtn = screen.getByRole('button', { name: /Permanently Delete Everything/i });
    fireEvent.click(openBtn);

    const input = screen.getByLabelText(/Confirm typed reset text/i);
    fireEvent.change(input, { target: { value: 'DELETE EVERYTHING' } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm System Reset/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith('DELETE EVERYTHING');
    });

    // Check success banner appears with counts
    expect(
      await screen.findByText(/System Reset Completed Successfully/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Purged 3 workspace\(s\), 8 report\(s\), 54 test result\(s\)/i)).toBeInTheDocument();
  });
});
