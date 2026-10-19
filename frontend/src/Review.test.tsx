import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import {
  patientsApi,
  reportsApi,
  resultsApi,
  Patient,
  Report,
  ExtractedResult,
  ReportResultsResponse,
} from './lib/apiClient';

const mockPatient: Patient = {
  id: 'patient-uuid-m6',
  display_name: 'Jane Reviewer',
  date_of_birth: '1990-01-15',
  sex: 'female',
  notes: 'Testing M6 Review & Correction UI',
  owner_id: null,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};

const mockReportNeedsReview: Report = {
  id: 'report-uuid-m6',
  patient_id: 'patient-uuid-m6',
  original_filename: 'Lipid_Panel_Report.pdf',
  file_path: 'mock-storage-lipid.pdf',
  file_sha256: 'sha256-mock-lipid',
  file_size_bytes: 52000,
  page_count: 2,
  status: 'needs_review',
  failure_reason: null,
  has_text_layer: true,
  lab_name: 'Metro Diagnostics',
  report_date: '2026-10-15',
  report_date_source_text: 'Sample Collected: 15/10/2026',
  report_date_confirmed: false,
  is_date_ambiguous: false,
  date_alternatives: [],
  extraction_version: 'v0.6.0-m6',
  created_at: '2026-10-19T10:05:00Z',
  updated_at: '2026-10-19T10:05:00Z',
};

const mockResults: ExtractedResult[] = [
  {
    id: 'res-cholesterol',
    report_id: 'report-uuid-m6',
    page_number: 1,
    row_order: 0,
    section_heading: 'LIPID PROFILE',
    raw_test_name: 'Total Cholesterol',
    raw_value_text: '220',
    raw_unit: 'mg/dL',
    raw_reference_text: '125 - 200',
    printed_flag: 'H',
    source_snippet: 'Total Cholesterol 220 mg/dL 125 - 200 H',
    bbox: [50, 100, 250, 115],
    parse_confidence: 'high',
    test_id: null,
    review_status: 'unreviewed',
    effective_test_name: 'Total Cholesterol',
    effective_value_text: '220',
    effective_unit: 'mg/dL',
    effective_reference_text: '125 - 200',
    effective_printed_flag: 'H',
    value_numeric: 220,
    ref_low: 125,
    ref_high: 200,
    comparator: null,
    has_edits: false,
    edits: [],
    created_at: '2026-10-19T10:05:00Z',
    updated_at: '2026-10-19T10:05:00Z',
  },
  {
    id: 'res-triglycerides',
    report_id: 'report-uuid-m6',
    page_number: 2,
    row_order: 1,
    section_heading: 'LIPID PROFILE',
    raw_test_name: 'Triglycerides',
    raw_value_text: '150',
    raw_unit: 'mg/dL',
    raw_reference_text: '< 150',
    printed_flag: null,
    source_snippet: 'Triglycerides 150 mg/dL < 150',
    bbox: [50, 130, 250, 145],
    parse_confidence: 'medium',
    test_id: null,
    review_status: 'unreviewed',
    effective_test_name: 'Triglycerides',
    effective_value_text: '150',
    effective_unit: 'mg/dL',
    effective_reference_text: '< 150',
    effective_printed_flag: null,
    value_numeric: 150,
    ref_low: null,
    ref_high: 150,
    comparator: '<',
    has_edits: false,
    edits: [],
    created_at: '2026-10-19T10:05:00Z',
    updated_at: '2026-10-19T10:05:00Z',
  },
];

const mockResultsResponse: ReportResultsResponse = {
  report_id: 'report-uuid-m6',
  summary: {
    total_rows: 2,
    needs_review_count: 2,
    high_confidence_count: 1,
    medium_confidence_count: 1,
    low_confidence_count: 0,
    skipped_lines_count: 0,
    layout_strategy: 'line_layout',
  },
  results: mockResults,
};

describe('Milestone 6: Review and Correction UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAndOpenReviewModal = async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });
    vi.spyOn(patientsApi, 'get').mockResolvedValue(mockPatient);
    vi.spyOn(reportsApi, 'list').mockResolvedValue({
      items: [mockReportNeedsReview],
      total: 1,
    });
    vi.spyOn(reportsApi, 'getResults').mockResolvedValue(mockResultsResponse);

    render(<App />);

    // Navigate to patients
    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByText('Jane Reviewer')).toBeInTheDocument();
    });

    // Open workspace
    fireEvent.click(screen.getByRole('button', { name: /open jane reviewer's workspace/i }));

    await waitFor(() => {
      expect(screen.getByText('Lipid_Panel_Report.pdf')).toBeInTheDocument();
    });

    // Click "Review" button
    const reviewBtn = screen.getByRole('button', { name: /^review$/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Review & Correct — Lipid_Panel_Report.pdf/i)
      ).toBeInTheDocument();
    });
  };

  it('opens split-view modal with PDF iframe and extracted rows', async () => {
    await setupAndOpenReviewModal();

    // Verify PDF viewer iframe rendered with report stream URL
    const iframe = screen.getByTitle('Original PDF Report');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toContain('/api/v1/reports/report-uuid-m6/file');

    // Verify test rows rendered
    expect(screen.getByText('Total Cholesterol')).toBeInTheDocument();
    expect(screen.getByText('Triglycerides')).toBeInTheDocument();
    expect(screen.getByText('220')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('clicking a row jumps PDF active page', async () => {
    await setupAndOpenReviewModal();

    // Triglycerides is on page 2
    const trigRow = screen.getByText('Triglycerides');
    fireEvent.click(trigRow);

    await waitFor(() => {
      const iframe = screen.getByTitle('Original PDF Report');
      expect(iframe.getAttribute('src')).toContain('#page=2');
    });
  });

  it('edits a row and shows raw value on hover', async () => {
    await setupAndOpenReviewModal();

    const updateSpy = vi.spyOn(resultsApi, 'update').mockResolvedValue({
      ...mockResults[0],
      effective_value_text: '225',
      value_numeric: 225,
      review_status: 'edited',
      has_edits: true,
      edits: [
        {
          id: 'edit-1',
          result_id: 'res-cholesterol',
          field: 'raw_value_text',
          old_value: '220',
          new_value: '225',
          edited_by: 'user',
          created_at: '2026-10-19T10:10:00Z',
        },
      ],
    });

    // Click edit button for the first row
    const editButtons = screen.getAllByTitle(/edit test name, value, unit/i);
    fireEvent.click(editButtons[0]);

    // Value input appears
    const valueInputs = screen.getAllByDisplayValue('220');
    expect(valueInputs.length).toBeGreaterThan(0);

    fireEvent.change(valueInputs[0], { target: { value: '225' } });

    // Click Save
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'res-cholesterol',
        expect.objectContaining({ value_text: '225' })
      );
    });

    // Verify updated effective value and raw indicator
    await waitFor(() => {
      expect(screen.getByText('225')).toBeInTheDocument();
      expect(screen.getByText('(raw: 220)')).toBeInTheDocument();
    });
  });

  it('confirms a row when confirm button is clicked', async () => {
    await setupAndOpenReviewModal();

    const confirmSpy = vi.spyOn(resultsApi, 'update').mockResolvedValue({
      ...mockResults[0],
      review_status: 'confirmed',
    });

    const confirmBtns = screen.getAllByTitle('Confirm this test result');
    fireEvent.click(confirmBtns[0]);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('res-cholesterol', {
        review_status: 'confirmed',
      });
    });
  });

  it('rejects a row and undoes to restore it', async () => {
    await setupAndOpenReviewModal();

    const rejectSpy = vi.spyOn(resultsApi, 'update').mockResolvedValue({
      ...mockResults[0],
      review_status: 'rejected',
      has_edits: true,
      edits: [
        {
          id: 'edit-rej',
          result_id: 'res-cholesterol',
          field: 'review_status',
          old_value: 'unreviewed',
          new_value: 'rejected',
          edited_by: 'user',
          created_at: '2026-10-19T10:12:00Z',
        },
      ],
    });

    const undoSpy = vi.spyOn(resultsApi, 'undo').mockResolvedValue({
      ...mockResults[0],
      review_status: 'unreviewed',
      has_edits: false,
      edits: [],
    });

    // Reject row
    const rejectBtns = screen.getAllByTitle('Reject this test result');
    fireEvent.click(rejectBtns[0]);

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith('res-cholesterol', {
        review_status: 'rejected',
      });
    });

    // Now undo button should be present
    await waitFor(() => {
      expect(screen.getByTitle('Undo most recent edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Undo most recent edit'));

    await waitFor(() => {
      expect(undoSpy).toHaveBeenCalledWith('res-cholesterol');
    });
  });

  it('bulk confirms high confidence rows', async () => {
    await setupAndOpenReviewModal();

    const bulkSpy = vi.spyOn(resultsApi, 'bulkConfirm').mockResolvedValue({
      report_id: 'report-uuid-m6',
      confirmed_count: 1,
      results: [
        {
          ...mockResults[0],
          review_status: 'confirmed',
        },
      ],
    });

    const bulkBtn = screen.getByRole('button', {
      name: /bulk confirm high confidence/i,
    });
    fireEvent.click(bulkBtn);

    await waitFor(() => {
      expect(bulkSpy).toHaveBeenCalledWith({
        report_id: 'report-uuid-m6',
        confidence: 'high',
      });
    });
  });

  it('adds a manual row', async () => {
    await setupAndOpenReviewModal();

    const addManualSpy = vi.spyOn(reportsApi, 'addManualResult').mockResolvedValue({
      id: 'res-manual-1',
      report_id: 'report-uuid-m6',
      page_number: 1,
      row_order: 2,
      section_heading: null,
      raw_test_name: 'Serum Iron',
      raw_value_text: '85',
      raw_unit: 'ug/dL',
      raw_reference_text: '60 - 170',
      printed_flag: null,
      source_snippet: 'Manual user entry',
      bbox: null,
      parse_confidence: 'high',
      test_id: null,
      review_status: 'manual',
      effective_test_name: 'Serum Iron',
      effective_value_text: '85',
      effective_unit: 'ug/dL',
      effective_reference_text: '60 - 170',
      effective_printed_flag: null,
      value_numeric: 85,
      ref_low: 60,
      ref_high: 170,
      comparator: null,
      has_edits: false,
      edits: [],
      created_at: '2026-10-19T10:15:00Z',
      updated_at: '2026-10-19T10:15:00Z',
    });

    // Open Add Row form
    fireEvent.click(screen.getByRole('button', { name: /✚ add row/i }));

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/test name/i), {
      target: { value: 'Serum Iron' },
    });
    fireEvent.change(screen.getByPlaceholderText(/observed value/i), {
      target: { value: '85' },
    });
    fireEvent.change(screen.getByPlaceholderText(/unit/i), {
      target: { value: 'ug/dL' },
    });

    // Click Save Row
    fireEvent.click(screen.getByRole('button', { name: /save row/i }));

    await waitFor(() => {
      expect(addManualSpy).toHaveBeenCalledWith(
        'report-uuid-m6',
        expect.objectContaining({
          test_name: 'Serum Iron',
          value_text: '85',
        })
      );
    });

    // Verify row appears
    await waitFor(() => {
      expect(screen.getByText('Serum Iron')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
    });
  });

  it('enforces date confirmation gating before marking report reviewed', async () => {
    await setupAndOpenReviewModal();

    // Initially date is unconfirmed, so Mark as Reviewed button is disabled
    const markReviewedBtn = screen.getByRole('button', { name: /mark as reviewed/i });
    expect(markReviewedBtn).toBeDisabled();

    // Confirm date
    const confirmDateSpy = vi.spyOn(reportsApi, 'update').mockResolvedValueOnce({
      ...mockReportNeedsReview,
      report_date_confirmed: true,
    });

    const confirmDateBtn = screen.getByRole('button', { name: /^confirm date$/i });
    fireEvent.click(confirmDateBtn);

    await waitFor(() => {
      expect(confirmDateSpy).toHaveBeenCalledWith(
        'report-uuid-m6',
        expect.objectContaining({ report_date_confirmed: true })
      );
    });

    // Mark as Reviewed button should now be enabled
    await waitFor(() => {
      expect(markReviewedBtn).not.toBeDisabled();
    });

    const markReviewedSpy = vi.spyOn(reportsApi, 'update').mockResolvedValueOnce({
      ...mockReportNeedsReview,
      report_date_confirmed: true,
      status: 'reviewed',
    });

    fireEvent.click(markReviewedBtn);

    await waitFor(() => {
      expect(markReviewedSpy).toHaveBeenCalledWith(
        'report-uuid-m6',
        expect.objectContaining({ status: 'reviewed' })
      );
    });
  });
});
