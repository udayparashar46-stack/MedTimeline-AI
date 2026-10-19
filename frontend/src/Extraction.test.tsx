import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientWorkspacePage } from './pages/PatientWorkspacePage';
import {
  patientsApi,
  reportsApi,
  type Patient,
  type Report,
  type ReportExtractionResponse,
} from './lib/apiClient';

describe('Milestone 4: Text Extraction & Date Detection', () => {
  const mockPatient: Patient = {
    id: 'pat-400',
    display_name: 'Arthur Dent',
    date_of_birth: '1979-10-12',
    sex: 'male',
    notes: 'Extraction verification workspace',
    owner_id: null,
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
  };

  const normalReport: Report = {
    id: 'rep-normal-1',
    patient_id: 'pat-400',
    original_filename: 'Metabolic_Panel.pdf',
    file_path: 'stored-path-1.pdf',
    file_sha256: 'hash1',
    file_size_bytes: 45000,
    page_count: 1,
    status: 'needs_review',
    failure_reason: null,
    has_text_layer: true,
    lab_name: null,
    report_date: '2026-10-18',
    report_date_source_text: 'Sample Collected: 18-Oct-2026',
    report_date_confirmed: false,
    is_date_ambiguous: false,
    date_alternatives: null,
    extraction_version: 'pymupdf-regex-v1',
    created_at: '2026-10-18T12:00:00Z',
    updated_at: '2026-10-18T12:00:00Z',
  };

  const ambiguousReport: Report = {
    id: 'rep-ambig-2',
    patient_id: 'pat-400',
    original_filename: 'Ambiguous_Dates.pdf',
    file_path: 'stored-path-2.pdf',
    file_sha256: 'hash2',
    file_size_bytes: 52000,
    page_count: 1,
    status: 'needs_review',
    failure_reason: null,
    has_text_layer: true,
    lab_name: null,
    report_date: '2026-04-03',
    report_date_source_text: 'Collected: 03/04/2026',
    report_date_confirmed: false,
    is_date_ambiguous: true,
    date_alternatives: [
      {
        date_iso: '2026-04-03',
        source_text: 'Collected: 03/04/2026',
        label_type: 'collection',
        priority: 1,
        confidence: 'medium',
        is_ambiguous_numeric: true,
      },
      {
        date_iso: '2026-03-04',
        source_text: 'Collected: 03/04/2026',
        label_type: 'collection',
        priority: 1,
        confidence: 'medium',
        is_ambiguous_numeric: true,
      },
    ],
    extraction_version: 'pymupdf-regex-v1',
    created_at: '2026-10-18T12:00:00Z',
    updated_at: '2026-10-18T12:00:00Z',
  };

  const scannedReport: Report = {
    id: 'rep-scan-3',
    patient_id: 'pat-400',
    original_filename: 'Faxed_Scan_Document.pdf',
    file_path: 'stored-path-3.pdf',
    file_sha256: 'hash3',
    file_size_bytes: 350000,
    page_count: 1,
    status: 'failed',
    failure_reason: 'Document appears to be scanned or image-only (insufficient readable text layer).',
    has_text_layer: false,
    lab_name: null,
    report_date: null,
    report_date_source_text: null,
    report_date_confirmed: false,
    is_date_ambiguous: false,
    date_alternatives: null,
    extraction_version: 'pymupdf-regex-v1',
    created_at: '2026-10-18T12:00:00Z',
    updated_at: '2026-10-18T12:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(patientsApi, 'get').mockResolvedValue(mockPatient);
  });

  it('displays detected report dates and flags scanned PDFs in table', async () => {
    vi.spyOn(reportsApi, 'list').mockResolvedValueOnce({
      items: [normalReport, scannedReport],
      total: 2,
    });

    render(
      <PatientWorkspacePage
        patientId="pat-400"
        onNavigateBack={vi.fn()}
        onNavigateTo={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Metabolic_Panel.pdf')).toBeInTheDocument();
      expect(screen.getByText('2026-10-18')).toBeInTheDocument();
      expect(screen.getByText(/scanned \(no text\)/i)).toBeInTheDocument();
    });
  });

  it('identifies ambiguous date and allows user to confirm resolution', async () => {
    vi.spyOn(reportsApi, 'list').mockResolvedValueOnce({
      items: [ambiguousReport],
      total: 1,
    });

    const updateSpy = vi.spyOn(reportsApi, 'update').mockResolvedValueOnce({
      ...ambiguousReport,
      report_date: '2026-03-04',
      report_date_confirmed: true,
      is_date_ambiguous: false,
    });

    render(
      <PatientWorkspacePage
        patientId="pat-400"
        onNavigateBack={vi.fn()}
        onNavigateTo={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/ambiguous date/i)).toBeInTheDocument();
    });

    // Click Resolve Date button
    const resolveBtn = screen.getByRole('button', { name: /resolve date/i });
    fireEvent.click(resolveBtn);

    // Expect ConfirmDateModal
    expect(screen.getByText(/resolve report date/i)).toBeInTheDocument();
    expect(screen.getByText(/date ambiguity detected/i)).toBeInTheDocument();

    // Select the second candidate (2026-03-04)
    const radioOption = screen.getByDisplayValue('2026-03-04');
    fireEvent.click(radioOption);

    // Confirm
    const confirmBtn = screen.getByRole('button', { name: /confirm date/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('rep-ambig-2', {
        report_date: '2026-03-04',
        report_date_confirmed: true,
      });
      // Verified badge appears in the table after update
      expect(screen.getByText(/✓ confirmed/i)).toBeInTheDocument();
    });
  });

  it('opens RawTextModal to inspect diagnostic extracted text and character count', async () => {
    vi.spyOn(reportsApi, 'list').mockResolvedValueOnce({
      items: [normalReport],
      total: 1,
    });

    const mockExtractionData: ReportExtractionResponse = {
      report_id: 'rep-normal-1',
      has_text_layer: true,
      char_count_total: 154,
      page_count: 1,
      detected_date: '2026-10-18',
      date_source_text: 'Sample Collected: 18-Oct-2026',
      is_date_ambiguous: false,
      date_alternatives: [
        {
          date_iso: '2026-10-18',
          source_text: 'Sample Collected: 18-Oct-2026',
          label_type: 'collection',
          priority: 1,
          confidence: 'high',
          is_ambiguous_numeric: false,
        },
      ],
      confidence: 'high',
      is_scanned: false,
      failure_reason: null,
      extracted_text: 'PATIENT: Arthur Dent\nCOLLECTED: 18-Oct-2026\nGLUCOSE: 95 mg/dL\nCREATININE: 1.0 mg/dL',
    };

    const getExtractionSpy = vi
      .spyOn(reportsApi, 'getExtraction')
      .mockResolvedValueOnce(mockExtractionData);

    render(
      <PatientWorkspacePage
        patientId="pat-400"
        onNavigateBack={vi.fn()}
        onNavigateTo={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Metabolic_Panel.pdf')).toBeInTheDocument();
    });

    // Click Raw Text button
    const rawTextBtn = screen.getByRole('button', { name: /raw text/i });
    fireEvent.click(rawTextBtn);

    await waitFor(() => {
      expect(getExtractionSpy).toHaveBeenCalledWith('rep-normal-1');
      expect(screen.getByText(/extracted text & date inspection/i)).toBeInTheDocument();
      expect(screen.getByText(/154 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/GLUCOSE: 95 mg\/dL/)).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/extracted text & date inspection/i)).not.toBeInTheDocument();
    });
  });
});
