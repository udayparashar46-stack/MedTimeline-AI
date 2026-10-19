import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import {
  patientsApi,
  reportsApi,
  Patient,
  Report,
  ReportResultsResponse,
} from './lib/apiClient';

const mockPatient: Patient = {
  id: 'patient-uuid-1',
  display_name: 'Sarah Jenkins',
  date_of_birth: '1985-04-12',
  sex: 'female',
  notes: 'Tracking routine metabolic panel',
  owner_id: null,
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T10:00:00Z',
};

const mockReport: Report = {
  id: 'report-uuid-1',
  patient_id: 'patient-uuid-1',
  original_filename: 'CBC_Report.pdf',
  file_path: 'mock-storage-key.pdf',
  file_sha256: 'abc123sha256',
  file_size_bytes: 45000,
  page_count: 1,
  status: 'needs_review',
  failure_reason: null,
  has_text_layer: true,
  lab_name: 'Quest Diagnostics',
  report_date: '2026-10-14',
  report_date_source_text: 'Sample Collected: 14/10/2026',
  report_date_confirmed: false,
  is_date_ambiguous: false,
  date_alternatives: [],
  extraction_version: 'v0.5.0-m5',
  created_at: '2026-10-18T10:05:00Z',
  updated_at: '2026-10-18T10:05:00Z',
};

const mockResultsResponse: ReportResultsResponse = {
  report_id: 'report-uuid-1',
  summary: {
    total_rows: 3,
    needs_review_count: 3,
    high_confidence_count: 2,
    medium_confidence_count: 1,
    low_confidence_count: 0,
    skipped_lines_count: 4,
    layout_strategy: 'line_layout',
  },
  results: [
    {
      id: 'res-1',
      report_id: 'report-uuid-1',
      page_number: 1,
      row_order: 0,
      section_heading: 'COMPLETE BLOOD COUNT',
      raw_test_name: 'Hemoglobin',
      raw_value_text: '14.5',
      raw_unit: 'g/dL',
      raw_reference_text: '13.0 - 17.0',
      printed_flag: null,
      source_snippet: 'Hemoglobin 14.5 g/dL 13.0 - 17.0',
      bbox: [50, 100, 200, 115],
      parse_confidence: 'high',
      test_id: null,
      review_status: 'unreviewed',
      effective_test_name: 'Hemoglobin',
      effective_value_text: '14.5',
      effective_unit: 'g/dL',
      effective_reference_text: '13.0 - 17.0',
      effective_printed_flag: null,
      value_numeric: 14.5,
      ref_low: 13.0,
      ref_high: 17.0,
      comparator: null,
      has_edits: false,
      edits: [],
      created_at: '2026-10-18T10:05:00Z',
      updated_at: '2026-10-18T10:05:00Z',
    },
    {
      id: 'res-2',
      report_id: 'report-uuid-1',
      page_number: 1,
      row_order: 1,
      section_heading: 'COMPLETE BLOOD COUNT',
      raw_test_name: 'Total WBC Count',
      raw_value_text: '12500',
      raw_unit: 'cells/mcL',
      raw_reference_text: '4000 - 11000',
      printed_flag: 'H',
      source_snippet: 'Total WBC Count 12500 cells/mcL 4000 - 11000 H',
      bbox: [50, 120, 250, 135],
      parse_confidence: 'high',
      test_id: null,
      review_status: 'unreviewed',
      effective_test_name: 'Total WBC Count',
      effective_value_text: '12500',
      effective_unit: 'cells/mcL',
      effective_reference_text: '4000 - 11000',
      effective_printed_flag: 'H',
      value_numeric: 12500,
      ref_low: 4000,
      ref_high: 11000,
      comparator: null,
      has_edits: false,
      edits: [],
      created_at: '2026-10-18T10:05:00Z',
      updated_at: '2026-10-18T10:05:00Z',
    },
    {
      id: 'res-3',
      report_id: 'report-uuid-1',
      page_number: 1,
      row_order: 2,
      section_heading: 'COMPLETE BLOOD COUNT',
      raw_test_name: 'Anion Gap',
      raw_value_text: '12',
      raw_unit: null,
      raw_reference_text: '8 - 16',
      printed_flag: null,
      source_snippet: 'Anion Gap 12 8 - 16',
      bbox: [50, 140, 180, 155],
      parse_confidence: 'medium',
      test_id: null,
      review_status: 'unreviewed',
      effective_test_name: 'Anion Gap',
      effective_value_text: '12',
      effective_unit: null,
      effective_reference_text: '8 - 16',
      effective_printed_flag: null,
      value_numeric: 12,
      ref_low: 8,
      ref_high: 16,
      comparator: null,
      has_edits: false,
      edits: [],
      created_at: '2026-10-18T10:05:00Z',
      updated_at: '2026-10-18T10:05:00Z',
    },
  ],
};

describe('Milestone 5: Row Parsing & Confidence Scoring UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens ResultsTableModal and displays summary and extracted rows with confidence', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });
    vi.spyOn(patientsApi, 'get').mockResolvedValue(mockPatient);
    vi.spyOn(reportsApi, 'list').mockResolvedValue({
      items: [mockReport],
      total: 1,
    });
    const resultsSpy = vi.spyOn(reportsApi, 'getResults').mockResolvedValue(mockResultsResponse);

    render(<App />);

    // Navigate to patients
    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
    });

    // Open workspace
    fireEvent.click(screen.getByRole('button', { name: /open sarah jenkins's workspace/i }));

    // Verify report row renders
    await waitFor(() => {
      expect(screen.getByText('CBC_Report.pdf')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /🔬 test rows/i })).toBeInTheDocument();
    });

    // Click "🔬 Test Rows" button
    fireEvent.click(screen.getByRole('button', { name: /🔬 test rows/i }));

    // Verify modal appears
    await waitFor(() => {
      expect(resultsSpy).toHaveBeenCalledWith('report-uuid-1');
      expect(screen.getByRole('heading', { name: /extracted test results — cbc_report\.pdf/i })).toBeInTheDocument();
      expect(screen.getByText(/3 rows found/i)).toBeInTheDocument();
      expect(screen.getByText(/3 need review/i)).toBeInTheDocument();
      expect(screen.getByText(/✓ 2 high/i)).toBeInTheDocument();
      expect(screen.getByText(/⚠ 1 medium/i)).toBeInTheDocument();
    });

    // Verify rows are listed
    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    expect(screen.getByText('14.5')).toBeInTheDocument();
    expect(screen.getByText('g/dL')).toBeInTheDocument();
    expect(screen.getByText('13.0 - 17.0')).toBeInTheDocument();

    expect(screen.getByText('Total WBC Count')).toBeInTheDocument();
    expect(screen.getByText('12500')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();

    expect(screen.getByText('Anion Gap')).toBeInTheDocument();
    expect(screen.getByText('Medium Confidence')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /extracted test results/i })).not.toBeInTheDocument();
    });
  });

  it('displays empty state for scanned PDF without text layer in ResultsTableModal', async () => {
    const scannedReport: Report = {
      ...mockReport,
      id: 'scanned-report-1',
      original_filename: 'Scanned_Image.pdf',
      has_text_layer: false,
    };

    const emptyResultsResponse: ReportResultsResponse = {
      report_id: 'scanned-report-1',
      summary: {
        total_rows: 0,
        needs_review_count: 0,
        high_confidence_count: 0,
        medium_confidence_count: 0,
        low_confidence_count: 0,
        skipped_lines_count: 0,
        layout_strategy: 'none',
      },
      results: [],
    };

    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });
    vi.spyOn(patientsApi, 'get').mockResolvedValue(mockPatient);
    vi.spyOn(reportsApi, 'list').mockResolvedValue({
      items: [scannedReport],
      total: 1,
    });
    vi.spyOn(reportsApi, 'getResults').mockResolvedValue(emptyResultsResponse);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /patients/i }));
    await waitFor(() => expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /open sarah jenkins's workspace/i }));
    await waitFor(() => expect(screen.getByText('Scanned_Image.pdf')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /🔬 test rows/i }));

    await waitFor(() => {
      expect(screen.getByText(/no structured test results found/i)).toBeInTheDocument();
      expect(screen.getByText(/scanned image or photo without selectable text/i)).toBeInTheDocument();
    });
  });
});
