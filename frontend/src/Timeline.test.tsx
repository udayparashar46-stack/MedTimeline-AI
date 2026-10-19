import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimelinePage } from './pages/TimelinePage';
import {
  patientsApi,
  timelineApi,
  Patient,
  TimelineResponse,
} from './lib/apiClient';

const mockPatient: Patient = {
  id: 'patient-test-timeline',
  display_name: 'Sarah Timeline',
  date_of_birth: '1980-05-12',
  sex: 'female',
  notes: 'M8 & M9 Testing',
  owner_id: null,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};

const mockTimelineResponse: TimelineResponse = {
  patient_id: 'patient-test-timeline',
  patient_name: 'Sarah Timeline',
  columns: [
    {
      report_id: 'rep-1',
      report_date: '2026-01-10',
      formatted_date: '10 Jan 2026',
      lab_name: 'Apex Lab',
      original_filename: 'apex_jan2026.pdf',
      report_status: 'reviewed',
      report_date_confirmed: true,
    },
    {
      report_id: 'rep-2',
      report_date: '2026-03-15',
      formatted_date: '15 Mar 2026',
      lab_name: 'Metro Diagnostics',
      original_filename: 'metro_mar2026.pdf',
      report_status: 'reviewed',
      report_date_confirmed: true,
    },
    {
      report_id: 'rep-3',
      report_date: '2026-03-15',
      formatted_date: '15 Mar 2026',
      lab_name: 'City Hospital',
      original_filename: 'city_mar2026.pdf',
      report_status: 'needs_review',
      report_date_confirmed: true,
    },
  ],
  rows: [
    {
      test_id: 'test-hgb',
      test_name: 'Hemoglobin',
      category: 'Complete Blood Count',
      preferred_unit: 'g/dL',
      is_canonical: true,
      has_unit_mismatch: false,
      observed_units: ['g/dL'],
      cells: {
        'rep-1': {
          result_id: 'res-hgb-1',
          report_id: 'rep-1',
          raw_test_name: 'Hb',
          effective_value_text: '13.5',
          effective_unit: 'g/dL',
          effective_reference_text: '12.0 - 16.0',
          printed_flag: null,
          review_status: 'confirmed',
          parse_confidence: 'high',
          page_number: 1,
          source_snippet: 'Hb 13.5 g/dL (12.0 - 16.0)',
          is_edited: false,
          derived_value_numeric: 13.5,
          derived_comparator: null,
        },
        'rep-2': {
          result_id: 'res-hgb-2',
          report_id: 'rep-2',
          raw_test_name: 'Haemoglobin',
          effective_value_text: '14.2',
          effective_unit: 'g/dL',
          effective_reference_text: '12.0 - 16.0',
          printed_flag: null,
          review_status: 'confirmed',
          parse_confidence: 'high',
          page_number: 1,
          source_snippet: 'Haemoglobin 14.2 g/dL',
          is_edited: false,
          derived_value_numeric: 14.2,
          derived_comparator: null,
        },
      },
    },
    {
      test_id: 'test-creat',
      test_name: 'Serum Creatinine',
      category: 'Kidney Function Tests',
      preferred_unit: 'mg/dL',
      is_canonical: true,
      has_unit_mismatch: false,
      observed_units: ['mg/dL'],
      cells: {
        'rep-1': {
          result_id: 'res-creat-1',
          report_id: 'rep-1',
          raw_test_name: 'Creatinine',
          effective_value_text: '0.9',
          effective_unit: 'mg/dL',
          effective_reference_text: '0.6 - 1.2',
          printed_flag: null,
          review_status: 'confirmed',
          parse_confidence: 'high',
          page_number: 2,
          source_snippet: 'Creatinine 0.9 mg/dL',
          is_edited: false,
          derived_value_numeric: 0.9,
          derived_comparator: null,
        },
        // rep-2 is deliberately missing! Blank cell
      },
    },
    {
      test_id: 'test-bili-tot',
      test_name: 'Bilirubin Total',
      category: 'Liver Function Tests',
      preferred_unit: 'mg/dL',
      is_canonical: true,
      has_unit_mismatch: false,
      observed_units: ['mg/dL'],
      cells: {
        'rep-1': {
          result_id: 'res-btot-1',
          report_id: 'rep-1',
          raw_test_name: 'Total Bilirubin',
          effective_value_text: '2.4',
          effective_unit: 'mg/dL',
          effective_reference_text: '0.2 - 1.2',
          printed_flag: 'H',
          review_status: 'confirmed',
          parse_confidence: 'high',
          page_number: 1,
          source_snippet: 'Total Bilirubin 2.4 mg/dL H',
          is_edited: false,
          derived_value_numeric: 2.4,
          derived_comparator: null,
        },
      },
    },
    {
      test_id: 'test-bili-dir',
      test_name: 'Bilirubin Direct',
      category: 'Liver Function Tests',
      preferred_unit: 'mg/dL',
      is_canonical: true,
      has_unit_mismatch: false,
      observed_units: ['mg/dL'],
      cells: {
        'rep-1': {
          result_id: 'res-bdir-1',
          report_id: 'rep-1',
          raw_test_name: 'Direct Bilirubin',
          effective_value_text: '0.3',
          effective_unit: 'mg/dL',
          effective_reference_text: '0.0 - 0.3',
          printed_flag: null,
          review_status: 'confirmed',
          parse_confidence: 'high',
          page_number: 1,
          source_snippet: 'Direct Bilirubin 0.3 mg/dL',
          is_edited: false,
          derived_value_numeric: 0.3,
          derived_comparator: null,
        },
      },
    },
  ],
  total_tests: 4,
  total_columns: 3,
  categories: ['Complete Blood Count', 'Kidney Function Tests', 'Liver Function Tests'],
  has_unreviewed_results: true,
  include_unreviewed: false,
};

describe('M8 & M9: TimelinePage and CSV Export UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });
    vi.spyOn(timelineApi, 'get').mockResolvedValue(mockTimelineResponse);
  });

  it('renders chronological timeline table with report date headers and tests', async () => {
    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    expect(screen.getByText('Chronological Lab Timeline')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sarah Timeline')).toBeInTheDocument();
    });

    // Check report date headers
    expect(screen.getByText('10 Jan 2026')).toBeInTheDocument();
    // 15 Mar 2026 appears for both same-date reports (FR5)
    const marHeaders = screen.getAllByText('15 Mar 2026');
    expect(marHeaders.length).toBe(2);

    // Check test rows
    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    expect(screen.getByText('Serum Creatinine')).toBeInTheDocument();

    // Check values
    expect(screen.getByText('13.5')).toBeInTheDocument();
    expect(screen.getByText('14.2')).toBeInTheDocument();
    expect(screen.getByText('0.9')).toBeInTheDocument();
  });

  it('keeps Bilirubin Total and Bilirubin Direct as separate rows', async () => {
    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByText('Bilirubin Total')).toBeInTheDocument();
    });

    expect(screen.getByText('Bilirubin Direct')).toBeInTheDocument();
    expect(screen.getByText('2.4')).toBeInTheDocument();
    expect(screen.getByText('0.3')).toBeInTheDocument();
  });

  it('renders blank cells as dashes for missing results', async () => {
    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByText('Serum Creatinine')).toBeInTheDocument();
    });

    // Creatinine is missing in rep-2 and rep-3, should have blank dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('opens Source Drawer with evidence when a timeline cell is clicked', async () => {
    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByText('13.5')).toBeInTheDocument();
    });

    // Click on 13.5 cell
    fireEvent.click(screen.getByText('13.5'));

    // Drawer should open with evidence details
    await waitFor(() => {
      expect(screen.getByText('Evidence: Hemoglobin')).toBeInTheDocument();
    });

    expect(screen.getByText('Hb 13.5 g/dL (12.0 - 16.0)')).toBeInTheDocument();
    expect(screen.getByText(/Page 1/)).toBeInTheDocument();
  });

  it('toggling include_unreviewed refetches timeline with unreviewed filter', async () => {
    const getSpy = vi.spyOn(timelineApi, 'get').mockResolvedValue(mockTimelineResponse);

    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Include Unreviewed Results/i)).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText(/Include Unreviewed Results/i);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('patient-test-timeline', true);
    });
  });

  it('filters tests by search input', async () => {
    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search test name or category/i);
    fireEvent.change(searchInput, { target: { value: 'Creatinine' } });

    expect(screen.getByText('Serum Creatinine')).toBeInTheDocument();
    expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument();
  });

  it('clicking Export CSV triggers download', async () => {
    const mockBlob = new Blob(['mock csv content'], { type: 'text/csv' });
    const downloadSpy = vi.spyOn(timelineApi, 'downloadCsv').mockResolvedValue({
      blob: mockBlob,
      filename: 'SarahTimeline_lab_timeline.csv',
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Export Timeline CSV/i });
    expect(exportBtn).not.toBeDisabled();
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith('patient-test-timeline', false);
      expect(anchorClickSpy).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/Exported SarahTimeline_lab_timeline.csv successfully!/i)
    ).toBeInTheDocument();
  });

  it('shows empty state when workspace has no timeline data', async () => {
    vi.spyOn(timelineApi, 'get').mockResolvedValue({
      patient_id: 'patient-test-timeline',
      patient_name: 'Sarah Timeline',
      columns: [],
      rows: [],
      total_tests: 0,
      total_columns: 0,
      categories: [],
      has_unreviewed_results: false,
      include_unreviewed: false,
    });

    render(<TimelinePage initialPatientId="patient-test-timeline" />);

    await waitFor(() => {
      expect(screen.getByText('No Timeline Data Available')).toBeInTheDocument();
    });
  });
});
