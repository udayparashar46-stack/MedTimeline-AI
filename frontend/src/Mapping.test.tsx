import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MappingPage } from './pages/MappingPage';
import {
  patientsApi,
  testsApi,
  mappingApi,
  Patient,
  CanonicalTest,
  UnmatchedTestsResponse,
  UnitMismatchResponse,
  MappingResponse,
} from './lib/apiClient';

const mockPatient: Patient = {
  id: 'patient-test-m7',
  display_name: 'Alex Mapping',
  date_of_birth: '1988-06-20',
  sex: 'male',
  notes: 'M7 Testing',
  owner_id: null,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};

const mockCanonicalTests: CanonicalTest[] = [
  {
    id: 'test-hgb',
    canonical_name: 'Hemoglobin',
    category: 'Complete Blood Count',
    preferred_unit: 'g/dL',
    is_seeded: true,
    aliases_count: 5,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
  },
  {
    id: 'test-wbc',
    canonical_name: 'White Blood Cell Count',
    category: 'Complete Blood Count',
    preferred_unit: '10^3/uL',
    is_seeded: true,
    aliases_count: 3,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
  },
  {
    id: 'test-bili-tot',
    canonical_name: 'Bilirubin Total',
    category: 'Liver Function Tests',
    preferred_unit: 'mg/dL',
    is_seeded: true,
    aliases_count: 4,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
  },
  {
    id: 'test-bili-dir',
    canonical_name: 'Bilirubin Direct',
    category: 'Liver Function Tests',
    preferred_unit: 'mg/dL',
    is_seeded: true,
    aliases_count: 3,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
  },
];

const mockUnmatchedResponse: UnmatchedTestsResponse = {
  patient_id: 'patient-test-m7',
  total_unmatched: 2,
  items: [
    {
      raw_test_name: 'Haemoglobin level',
      normalized_name: 'haemoglobin level',
      occurrence_count: 3,
      reports: [
        { report_id: 'rep-1', filename: 'cbc_report.pdf', date: '2026-01-10' },
      ],
      observed_units: ['g/dL'],
      suggestions: [
        {
          test_id: 'test-hgb',
          canonical_name: 'Hemoglobin',
          category: 'Complete Blood Count',
          preferred_unit: 'g/dL',
          similarity_score: 82,
        },
      ],
    },
    {
      raw_test_name: 'Unknown Biomarker XYZ',
      normalized_name: 'unknown biomarker xyz',
      occurrence_count: 1,
      reports: [
        { report_id: 'rep-2', filename: 'special_report.pdf', date: '2026-03-15' },
      ],
      observed_units: ['ng/mL'],
      suggestions: [],
    },
  ],
};

const mockUnitMismatchResponse: UnitMismatchResponse = {
  patient_id: 'patient-test-m7',
  mismatches_count: 1,
  items: [
    {
      test_id: 'test-hgb',
      canonical_name: 'Hemoglobin',
      preferred_unit: 'g/dL',
      observed_units: ['g/dL', 'g/L'],
      affected_reports_count: 2,
      message: 'Reported in multiple units: g/dL, g/L across 2 reports (preferred: g/dL)',
    },
  ],
};

describe('M7: MappingPage and Normalization UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [mockPatient],
      total: 1,
    });
    vi.spyOn(testsApi, 'list').mockResolvedValue(mockCanonicalTests);
    vi.spyOn(mappingApi, 'getUnmatched').mockResolvedValue(mockUnmatchedResponse);
    vi.spyOn(mappingApi, 'getUnitMismatches').mockResolvedValue(mockUnitMismatchResponse);
  });

  it('renders page header and workspace selector', async () => {
    render(<MappingPage initialPatientId="patient-test-m7" />);

    // Page header is immediate
    expect(screen.getByText('Test Normalization & Mapping')).toBeInTheDocument();

    // After async loads, the patient name appears inside the <select>
    await waitFor(() => {
      expect(screen.getByText('Alex Mapping')).toBeInTheDocument();
    });

    // select element is now rendered (not a skeleton)
    expect(screen.getByRole('option', { name: 'Alex Mapping' })).toBeInTheDocument();
  });

  it('displays unmatched test items and suggestion chips', async () => {
    render(<MappingPage initialPatientId="patient-test-m7" />);

    await waitFor(() => {
      expect(screen.getByText('Haemoglobin level')).toBeInTheDocument();
    });

    expect(screen.getByText('Unknown Biomarker XYZ')).toBeInTheDocument();
    expect(screen.getByText(/3 across 1 report\(s\)/)).toBeInTheDocument();

    // "Hemoglobin" appears twice: in the unit-mismatch banner and in the suggestion chip
    const hemoglobinNodes = screen.getAllByText('Hemoglobin');
    expect(hemoglobinNodes.length).toBeGreaterThanOrEqual(2);

    // Similarity score badge
    expect(screen.getByText('82% match')).toBeInTheDocument();
  });

  it('clicking "Accept Match" maps the variant to the canonical test', async () => {
    const mockMappingRes: MappingResponse = {
      alias: {
        id: 'alias-new-1',
        test_id: 'test-hgb',
        alias_normalized: 'haemoglobin level',
        raw_alias: 'Haemoglobin level',
        source: 'user',
        patient_id: 'patient-test-m7',
        created_at: '2026-10-19T10:00:00Z',
      },
      updated_results_count: 3,
    };

    const createMappingSpy = vi
      .spyOn(mappingApi, 'createMapping')
      .mockResolvedValue(mockMappingRes);

    render(<MappingPage initialPatientId="patient-test-m7" />);

    await waitFor(() => {
      expect(screen.getByText('Accept Match')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Accept Match'));

    await waitFor(() => {
      expect(createMappingSpy).toHaveBeenCalledWith('patient-test-m7', {
        raw_test_name: 'Haemoglobin level',
        test_id: 'test-hgb',
        is_global: false,
      });
    });
  });

  it('renders unit mismatch alert banner when detected', async () => {
    render(<MappingPage initialPatientId="patient-test-m7" />);

    await waitFor(() => {
      // Heading is split across spans, match the partial text
      expect(screen.getByText(/Unit Discrepancy Warnings/i)).toBeInTheDocument();
    });

    // "Hemoglobin" appears in banner (<strong>) and possibly elsewhere — use getAllByText
    const hemoglobinNodes = screen.getAllByText('Hemoglobin');
    expect(hemoglobinNodes.length).toBeGreaterThanOrEqual(1);

    // The mismatch message sentence
    expect(
      screen.getByText(/Reported in multiple units: g\/dL, g\/L across 2 reports \(preferred: g\/dL\)/i)
    ).toBeInTheDocument();
  });

  it('shows empty state when there are no unmatched tests', async () => {
    vi.spyOn(mappingApi, 'getUnmatched').mockResolvedValue({
      patient_id: 'patient-test-m7',
      total_unmatched: 0,
      items: [],
    });

    render(<MappingPage initialPatientId="patient-test-m7" />);

    // The actual empty state heading rendered by MappingPage
    await waitFor(() => {
      expect(screen.getByText('All extracted tests are resolved!')).toBeInTheDocument();
    });
  });

  it('switches to Canonical Test Catalog tab; Bilirubin Total and Direct remain separate', async () => {
    render(<MappingPage initialPatientId="patient-test-m7" />);

    // Wait for the tab strip to show the loaded counts
    await waitFor(() => {
      expect(screen.getByText(/Canonical Test Catalog \(4\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Canonical Test Catalog \(4\)/));

    // Catalog entries visible
    await waitFor(() => {
      expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
    });

    // M7 requirement: these must be separate entries, never merged
    expect(screen.getByText('Bilirubin Total')).toBeInTheDocument();
    expect(screen.getByText('Bilirubin Direct')).toBeInTheDocument();
  });

  it('filters catalog by search term', async () => {
    render(<MappingPage initialPatientId="patient-test-m7" />);

    await waitFor(() => {
      expect(screen.getByText(/Canonical Test Catalog \(4\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Canonical Test Catalog \(4\)/));

    await waitFor(() => {
      expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search canonical tests...');
    fireEvent.change(searchInput, { target: { value: 'Direct' } });

    expect(screen.getByText('Bilirubin Direct')).toBeInTheDocument();
    expect(screen.queryByText('White Blood Cell Count')).not.toBeInTheDocument();
  });

  it('opens Create Canonical Test modal from catalog tab and calls testsApi.create', async () => {
    const createTestSpy = vi.spyOn(testsApi, 'create').mockResolvedValue({
      id: 'test-custom-1',
      canonical_name: 'Custom Peptide Test',
      category: 'Special Chemistry',
      preferred_unit: 'pg/mL',
      is_seeded: false,
      aliases_count: 0,
      created_at: '2026-10-19T12:00:00Z',
      updated_at: '2026-10-19T12:00:00Z',
    });

    render(<MappingPage initialPatientId="patient-test-m7" />);

    await waitFor(() => {
      expect(screen.getByText(/Canonical Test Catalog \(4\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Canonical Test Catalog \(4\)/));

    // "✚ Create Canonical Test" button appears in the catalog tab header
    await waitFor(() => {
      expect(screen.getByText('✚ Create Canonical Test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('✚ Create Canonical Test'));

    // Modal: title "Create New Canonical Test"
    await waitFor(() => {
      expect(screen.getByText('Create New Canonical Test')).toBeInTheDocument();
    });

    // Actual input placeholders from MappingPage
    fireEvent.change(screen.getByPlaceholderText('e.g. Total Testosterone'), {
      target: { value: 'Custom Peptide Test' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Hormones, Biochemistry, Immunology'), {
      target: { value: 'Special Chemistry' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. ng/dL, mg/dL, mmol/L'), {
      target: { value: 'pg/mL' },
    });

    fireEvent.click(screen.getByText('Create Test'));

    await waitFor(() => {
      expect(createTestSpy).toHaveBeenCalledWith({
        canonical_name: 'Custom Peptide Test',
        category: 'Special Chemistry',
        preferred_unit: 'pg/mL',
      });
    });
  });
});
