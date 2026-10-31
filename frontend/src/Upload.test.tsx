import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  patientsApi,
  reportsApi,
  systemApi,
  type Patient,
  type Report,
} from './lib/apiClient';

describe('Milestone 3: PDF Upload & Storage', () => {
  const mockPatient: Patient = {
    id: 'patient-uuid-1',
    display_name: 'Sarah Jenkins',
    date_of_birth: '1988-06-12',
    sex: 'female',
    notes: 'Serial monitoring',
    owner_id: null,
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
  };

  const mockReport: Report = {
    id: 'report-uuid-1',
    patient_id: 'patient-uuid-1',
    original_filename: 'CBC_Oct2026.pdf',
    file_path: 'mock-storage-key.pdf',
    file_sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    file_size_bytes: 145000,
    page_count: 2,
    status: 'needs_review',
    failure_reason: null,
    has_text_layer: true,
    lab_name: 'Quest Diagnostics',
    report_date: '2026-10-18',
    report_date_source_text: 'Reported: 18-Oct-2026',
    report_date_confirmed: false,
    is_date_ambiguous: false,
    date_alternatives: null,
    extraction_version: null,
    created_at: '2026-10-18T11:00:00Z',
    updated_at: '2026-10-18T11:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/health')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ok' }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Not found' }),
      } as Response;
    });

    // Mock dashboard API so DashboardPage doesn't cause errors
    vi.spyOn(systemApi, 'getDashboardSummary').mockResolvedValue({
      total_patients: 0,
      total_reports: 0,
      reports_awaiting_review: 0,
      processing_failures: 0,
      recent_patients: [],
      recent_reports: [],
      recent_activities: [],
    });
  });

  it('navigates to Upload page and displays target patient workspace selector', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValueOnce({
      items: [mockPatient],
      total: 1,
    });

    render(<App />);

    // Click Upload Reports in sidebar — scope to sidebar to avoid ambiguity with header button
    const sidebar = screen.getByRole('complementary');
    fireEvent.click(within(sidebar).getByRole('button', { name: /upload reports/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /upload lab reports/i })).toBeInTheDocument();
      expect(screen.getByText(/1\. select target patient workspace/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. select/i)).toBeInTheDocument();
      expect(screen.getByText(/drop laboratory reports here/i)).toBeInTheDocument();
    });
  });

  it('uploads multiple PDFs and displays live success status and summary', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });

    // Mock uploadSingle for per-file progress uploads
    const uploadSingleSpy = vi.spyOn(reportsApi, 'uploadSingle').mockResolvedValue({
      filename: 'report_panel1.pdf',
      status: 'uploaded',
      report: mockReport,
    });

    render(<App />);

    // Navigate to Upload page via sidebar
    await act(async () => {
      const sidebar2 = screen.getByRole('complementary');
      fireEvent.click(within(sidebar2).getByRole('button', { name: /upload reports/i }));
      await Promise.resolve();
    });

    // Wait for the Upload page to fully render with the patient list loaded
    await waitFor(() => {
      expect(screen.getByText(/drop laboratory reports here/i)).toBeInTheDocument();
      expect(document.getElementById('file-dropzone-input')).toBeInTheDocument();
    });

    // Explicitly select the patient to ensure selectedPatientId state is set
    const selectEl = screen.getByRole('combobox');
    fireEvent.change(selectEl, { target: { value: 'patient-uuid-1' } });

    // Simulate selecting 2 files through file input
    const file1 = new File(['%PDF-1.4 dummy content 1'], 'report_panel1.pdf', { type: 'application/pdf' });
    const file2 = new File(['%PDF-1.4 dummy content 2'], 'report_panel2.pdf', { type: 'application/pdf' });

    const input = document.getElementById('file-dropzone-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() => {
      expect(screen.getByText('report_panel1.pdf')).toBeInTheDocument();
      expect(screen.getByText('report_panel2.pdf')).toBeInTheDocument();
      // New button label: "Start Upload (N files)"
      expect(screen.getByRole('button', { name: /start upload \(2 files\)/i })).toBeInTheDocument();
    });

    // Mock uploadSingle to also succeed for second file
    uploadSingleSpy.mockResolvedValue({
      filename: 'report_panel2.pdf',
      status: 'uploaded',
      report: { ...mockReport, id: 'report-uuid-2', original_filename: 'report_panel2.pdf' },
    });

    // Trigger upload
    fireEvent.click(screen.getByRole('button', { name: /start upload \(2 files\)/i }));

    await waitFor(() => {
      expect(screen.getByText('Upload Completed:')).toBeInTheDocument();
    });
  });

  it('handles duplicate skipped files with warning badge and message', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });

    vi.spyOn(reportsApi, 'uploadSingle').mockResolvedValueOnce({
      filename: 'duplicate_report.pdf',
      status: 'duplicate_skipped',
      report: mockReport,
      message: "Duplicate skipped: file matches report 'CBC_Oct2026.pdf' already in this workspace.",
    });

    render(<App />);

    await act(async () => {
      const sidebar3 = screen.getByRole('complementary');
      fireEvent.click(within(sidebar3).getByRole('button', { name: /upload reports/i }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/drop laboratory reports here/i)).toBeInTheDocument();
      expect(document.getElementById('file-dropzone-input')).toBeInTheDocument();
    });

    // Explicitly select the patient to ensure selectedPatientId state is set
    const selectEl3 = screen.getByRole('combobox');
    fireEvent.change(selectEl3, { target: { value: 'patient-uuid-1' } });

    const file = new File(['%PDF-1.4 existing'], 'duplicate_report.pdf', { type: 'application/pdf' });
    const input = document.getElementById('file-dropzone-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // New button label: "Start Upload (N files)"
      expect(screen.getByRole('button', { name: /start upload \(1 file\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /start upload \(1 file\)/i }));

    await waitFor(() => {
      expect(screen.getByText('Duplicate (Skipped)')).toBeInTheDocument();
      expect(screen.getByText(/1 duplicate\(s\) skipped/i)).toBeInTheDocument();
    });
  });

  it('renders uploaded reports inside patient workspace and allows deletion', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });
    vi.spyOn(patientsApi, 'get').mockResolvedValue(mockPatient);
    vi.spyOn(reportsApi, 'list').mockResolvedValue({
      items: [mockReport],
      total: 1,
    });
    const deleteSpy = vi.spyOn(reportsApi, 'delete').mockResolvedValueOnce(undefined);

    render(<App />);

    // Go to patients list
    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
    });

    // Open workspace
    fireEvent.click(screen.getByRole('button', { name: /open sarah jenkins's workspace/i }));

    // Verify workspace reports table renders report
    await waitFor(() => {
      expect(screen.getByText('CBC_Oct2026.pdf')).toBeInTheDocument();
      expect(screen.getByText('2 pg')).toBeInTheDocument();
      expect(screen.getByText('Ready for review')).toBeInTheDocument();
    });

    // Click delete on report
    const deleteReportBtn = screen.getByRole('button', { name: /delete report cbc_oct2026\.pdf/i });
    fireEvent.click(deleteReportBtn);

    expect(screen.getByRole('heading', { name: 'Delete Lab Report' })).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete Report' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('report-uuid-1');
    });
  });
});
