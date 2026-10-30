/**
 * apiClient.ts — Typed HTTP client for MedTimeline AI backend.
 *
 * All API calls live here so every component uses the same base URL,
 * error structure, and TypeScript types. Types are kept in sync with
 * the Pydantic schemas in backend/app/schemas/.
 */

// ---------------------------------------------------------------------------
// Shared types (mirror backend Pydantic schemas)
// ---------------------------------------------------------------------------

export interface Patient {
  id: string;
  display_name: string;
  date_of_birth: string | null;
  sex: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientListResponse {
  items: Patient[];
  total: number;
}

export interface PatientCreate {
  display_name: string;
  date_of_birth?: string | null;
  sex?: string | null;
  notes?: string | null;
}

export interface PatientUpdate {
  display_name?: string;
  date_of_birth?: string | null;
  sex?: string | null;
  notes?: string | null;
}

export interface ApiError {
  detail: string | { msg: string; type: string }[];
}

// ---------------------------------------------------------------------------
// Base request helper
// ---------------------------------------------------------------------------

// All requests use relative path /api/v1 (same origin) so that
// the Express server (or local Vite proxy) proxies to BACKEND_URL.
const BASE = '/api/v1';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Read the stored JWT access token (set after login). */
export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

/** Persist a new token after successful login. */
export function setStoredToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

/** Clear token on logout. */
export function clearStoredToken(): void {
  localStorage.removeItem('auth_token');
}

/** Build Authorization header object if a token is available. */
function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Generic fetch wrapper that throws a human-readable Error on non-2xx responses.
 * This keeps individual API functions small and consistent.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    // Try to parse FastAPI error detail; fall back to status text
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const err = (await response.json()) as ApiError;
      if (typeof err.detail === 'string') {
        message = err.detail;
      } else if (Array.isArray(err.detail) && err.detail.length > 0) {
        message = err.detail.map((d) => d.msg).join('; ');
      }
    } catch {
      // JSON parse failed — keep the status-based message
    }
    throw new Error(message);
  }

  // 204 No Content has no body
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Patient API calls
// ---------------------------------------------------------------------------

export const patientsApi = {
  /** List all patient workspaces, optionally filtered by display_name. */
  list(params?: { search?: string; skip?: number; limit?: number }): Promise<PatientListResponse> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.skip !== undefined) qs.set('skip', String(params.skip));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<PatientListResponse>(`/patients${query}`);
  },

  /** Fetch a single patient workspace by ID. */
  get(id: string): Promise<Patient> {
    return request<Patient>(`/patients/${id}`);
  },

  /** Create a new patient workspace. */
  create(data: PatientCreate): Promise<Patient> {
    return request<Patient>('/patients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Partially update a patient workspace (rename, change notes, etc.). */
  update(id: string, data: PatientUpdate): Promise<Patient> {
    return request<Patient>(`/patients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Permanently soft-delete a patient workspace and all its data. */
  delete(id: string): Promise<void> {
    return request<void>(`/patients/${id}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// Report API types & calls (Milestone 3)
// ---------------------------------------------------------------------------

export type ReportStatus = 'queued' | 'processing' | 'needs_review' | 'reviewed' | 'failed';

export interface DateCandidate {
  date_iso: string;
  source_text: string;
  label_type: string;
  priority: number;
  confidence: string;
  is_ambiguous_numeric: boolean;
}

export interface Report {
  id: string;
  patient_id: string;
  original_filename: string;
  file_path: string;
  file_sha256: string;
  file_size_bytes: number;
  page_count: number;
  status: ReportStatus;
  failure_reason: string | null;
  has_text_layer: boolean;
  lab_name: string | null;
  report_date: string | null;
  report_date_source_text: string | null;
  report_date_confirmed: boolean;
  is_date_ambiguous: boolean;
  date_alternatives: DateCandidate[] | null;
  extraction_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportUpdate {
  report_date?: string | null;
  report_date_confirmed?: boolean;
  lab_name?: string | null;
  status?: ReportStatus;
}

export interface ReportExtractionResponse {
  report_id: string;
  has_text_layer: boolean;
  char_count_total: number;
  page_count: number;
  detected_date: string | null;
  date_source_text: string | null;
  is_date_ambiguous: boolean;
  date_alternatives: DateCandidate[];
  confidence: string;
  is_scanned: boolean;
  failure_reason: string | null;
  extracted_text: string;
}

export interface ReportListResponse {
  items: Report[];
  total: number;
}

export interface ReportUploadItem {
  filename: string;
  status: 'uploaded' | 'duplicate_skipped' | 'failed';
  report?: Report | null;
  message?: string | null;
}

export interface BatchUploadResponse {
  items: ReportUploadItem[];
  uploaded_count: number;
  skipped_count: number;
  failed_count: number;
}

export const reportsApi = {
  /** List all reports for a specific patient workspace. */
  list(patientId: string): Promise<ReportListResponse> {
    return request<ReportListResponse>(`/patients/${patientId}/reports`);
  },

  /** Upload one or more PDF files for a patient workspace. */
  async upload(patientId: string, files: File[]): Promise<BatchUploadResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(`${BASE}/patients/${patientId}/reports`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const err = (await response.json()) as ApiError;
        if (typeof err.detail === 'string') {
          message = err.detail;
        } else if (Array.isArray(err.detail) && err.detail.length > 0) {
          message = err.detail.map((d) => d.msg).join('; ');
        }
      } catch {
        // Fallback to generic status
      }
      throw new Error(message);
    }

    return response.json() as Promise<BatchUploadResponse>;
  },

  /** Get single report metadata. */
  get(reportId: string): Promise<Report> {
    return request<Report>(`/reports/${reportId}`);
  },

  /** Partially update report fields (e.g. confirm date). */
  update(reportId: string, data: ReportUpdate): Promise<Report> {
    return request<Report>(`/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Trigger extraction pipeline for an uploaded report. */
  extract(reportId: string): Promise<Report> {
    return request<Report>(`/reports/${reportId}/extract`, {
      method: 'POST',
    });
  },

  /** Get raw text and extraction debug details. */
  getExtraction(reportId: string): Promise<ReportExtractionResponse> {
    return request<ReportExtractionResponse>(`/reports/${reportId}/extract`);
  },

  /** Retrieve all parsed test rows and confidence summary for a report. */
  getResults(reportId: string): Promise<ReportResultsResponse> {
    return request<ReportResultsResponse>(`/reports/${reportId}/results`);
  },

  /** Stream PDF file URL for split-view. */
  getPdfUrl(reportId: string): string {
    return `${BASE}/reports/${reportId}/file`;
  },

  /** Manually add a clinical test row to a report. */
  addManualResult(reportId: string, data: ManualResultCreate): Promise<ExtractedResult> {
    return request<ExtractedResult>(`/reports/${reportId}/results`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Permanently delete an uploaded report and its storage file. */
  delete(reportId: string): Promise<void> {
    return request<void>(`/reports/${reportId}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// Milestone 6: Result Edit & Review Types
// ---------------------------------------------------------------------------

export interface ResultEdit {
  id: string;
  result_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: string | null;
  created_at: string;
}

export interface ExtractedResult {
  id: string;
  report_id: string;
  page_number: number;
  row_order: number;
  section_heading: string | null;

  // Raw immutable values from PDF
  raw_test_name: string;
  raw_value_text: string;
  raw_unit: string | null;
  raw_reference_text: string | null;
  printed_flag: string | null;
  source_snippet: string;
  bbox: number[] | null;

  parse_confidence: 'high' | 'medium' | 'low';
  test_id: string | null;
  canonical_name?: string | null;
  review_status: 'unreviewed' | 'confirmed' | 'edited' | 'rejected' | 'manual';

  // Effective values (latest edit or raw value)
  effective_test_name: string;
  effective_value_text: string;
  effective_unit: string | null;
  effective_reference_text: string | null;
  effective_printed_flag: string | null;

  value_numeric: number | null;
  ref_low: number | null;
  ref_high: number | null;
  comparator: string | null;

  // Audit history
  has_edits: boolean;
  edits: ResultEdit[];

  created_at: string;
  updated_at: string;
}

export interface ResultUpdate {
  test_name?: string;
  value_text?: string;
  unit?: string;
  reference_text?: string;
  printed_flag?: string;
  review_status?: 'unreviewed' | 'confirmed' | 'edited' | 'rejected' | 'manual';
}

export interface ManualResultCreate {
  page_number?: number;
  test_name: string;
  value_text: string;
  unit?: string | null;
  reference_text?: string | null;
  printed_flag?: string | null;
  section_heading?: string | null;
}

export interface BulkConfirmRequest {
  report_id: string;
  confidence?: string;
  result_ids?: string[];
}

export interface BulkConfirmResponse {
  report_id: string;
  confirmed_count: number;
  results: ExtractedResult[];
}

export interface ReportResultsSummary {
  total_rows: number;
  needs_review_count: number;
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
  skipped_lines_count: number;
  layout_strategy?: string | null;
}

export interface ReportResultsResponse {
  report_id: string;
  summary: ReportResultsSummary;
  results: ExtractedResult[];
}

export const resultsApi = {
  /** Update test row fields or review status. Creates audit log. */
  update(resultId: string, data: ResultUpdate): Promise<ExtractedResult> {
    return request<ExtractedResult>(`/results/${resultId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Revert the most recent edit applied to this result row. */
  undo(resultId: string): Promise<ExtractedResult> {
    return request<ExtractedResult>(`/results/${resultId}/undo`, {
      method: 'POST',
    });
  },

  /** Bulk confirm unreviewed rows in a report. */
  bulkConfirm(data: BulkConfirmRequest): Promise<BulkConfirmResponse> {
    return request<BulkConfirmResponse>('/results/bulk-confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ---------------------------------------------------------------------------
// Milestone 7: Canonical Test & Alias Mapping Types & APIs
// ---------------------------------------------------------------------------

export interface CanonicalTest {
  id: string;
  canonical_name: string;
  category: string | null;
  preferred_unit: string | null;
  is_seeded: boolean;
  aliases_count: number;
  created_at: string;
  updated_at: string;
}

export interface CanonicalTestCreate {
  canonical_name: string;
  category?: string | null;
  preferred_unit?: string | null;
}

export interface TestAlias {
  id: string;
  test_id: string;
  alias_normalized: string;
  raw_alias: string;
  source: 'seed' | 'user';
  patient_id: string | null;
  created_at: string;
}

export interface TestSuggestion {
  test_id: string;
  canonical_name: string;
  category: string | null;
  preferred_unit: string | null;
  similarity_score: number;
}

export interface UnmatchedTestItem {
  raw_test_name: string;
  normalized_name: string;
  occurrence_count: number;
  reports: Array<{ report_id: string; filename: string; date: string | null }>;
  observed_units: string[];
  suggestions: TestSuggestion[];
}

export interface UnmatchedTestsResponse {
  patient_id: string;
  total_unmatched: number;
  items: UnmatchedTestItem[];
}

export interface MappingCreate {
  raw_test_name: string;
  test_id: string;
  is_global?: boolean;
}

export interface MappingResponse {
  alias: TestAlias;
  updated_results_count: number;
}

export interface UnitMismatchItem {
  test_id: string;
  canonical_name: string;
  preferred_unit: string | null;
  observed_units: string[];
  affected_reports_count: number;
  message: string;
}

export interface UnitMismatchResponse {
  patient_id: string;
  mismatches_count: number;
  items: UnitMismatchItem[];
}

export const testsApi = {
  /** List canonical tests (supports search and category filters). */
  list(params?: { search?: string; category?: string }): Promise<CanonicalTest[]> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<CanonicalTest[]>(`/tests${query}`);
  },

  /** Get single canonical test with aliases. */
  get(testId: string): Promise<CanonicalTest & { aliases: TestAlias[] }> {
    return request<CanonicalTest & { aliases: TestAlias[] }>(`/tests/${testId}`);
  },

  /** Create a new user-defined canonical test. */
  create(data: CanonicalTestCreate): Promise<CanonicalTest> {
    return request<CanonicalTest>('/tests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export const mappingApi = {
  /** Retrieve distinct unmatched raw test names for a patient workspace. */
  getUnmatched(patientId: string): Promise<UnmatchedTestsResponse> {
    return request<UnmatchedTestsResponse>(`/patients/${patientId}/mapping/unmatched`);
  },

  /** Link a raw test name to a canonical test. */
  createMapping(patientId: string, data: MappingCreate): Promise<MappingResponse> {
    return request<MappingResponse>(`/patients/${patientId}/mapping`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Delete a user alias mapping. */
  deleteMapping(patientId: string, aliasId: string): Promise<void> {
    return request<void>(`/patients/${patientId}/mapping/${aliasId}`, {
      method: 'DELETE',
    });
  },

  /** Check for unit discrepancies across reports for this patient. */
  getUnitMismatches(patientId: string): Promise<UnitMismatchResponse> {
    return request<UnitMismatchResponse>(`/patients/${patientId}/mapping/unit-mismatches`);
  },
};

// ---------------------------------------------------------------------------
// Milestones 8 & 9: Timeline Table & CSV Export Types & APIs
// ---------------------------------------------------------------------------

export interface TimelineReportColumn {
  report_id: string;
  report_date: string | null;
  formatted_date: string;
  lab_name: string | null;
  original_filename: string;
  report_status: string;
  report_date_confirmed: boolean;
}

export interface TimelineCell {
  result_id: string;
  report_id: string;
  raw_test_name: string;
  effective_value_text: string;
  effective_unit: string | null;
  effective_reference_text: string | null;
  printed_flag: string | null;
  review_status: 'unreviewed' | 'confirmed' | 'edited' | 'manual' | 'rejected';
  parse_confidence: 'high' | 'medium' | 'low';
  page_number: number;
  source_snippet: string;
  is_edited: boolean;
  derived_value_numeric: number | null;
  derived_comparator: string | null;
}

export interface TimelineRow {
  test_id: string | null;
  test_name: string;
  category: string;
  preferred_unit: string | null;
  is_canonical: boolean;
  cells: Record<string, TimelineCell>;
  has_unit_mismatch: boolean;
  observed_units: string[];
}

export interface TimelineResponse {
  patient_id: string;
  patient_name: string;
  columns: TimelineReportColumn[];
  rows: TimelineRow[];
  total_tests: number;
  total_columns: number;
  categories: string[];
  has_unreviewed_results: boolean;
  include_unreviewed: boolean;
}

export const timelineApi = {
  /** Fetch the chronological timeline matrix for a patient workspace. */
  get(patientId: string, includeUnreviewed = false): Promise<TimelineResponse> {
    const qs = includeUnreviewed ? '?include_unreviewed=true' : '';
    return request<TimelineResponse>(`/patients/${patientId}/timeline${qs}`);
  },

  /** Get CSV download URL with appropriate filter parameter. */
  getCsvExportUrl(patientId: string, includeUnreviewed = false): string {
    const qs = includeUnreviewed ? '?include_unreviewed=true' : '';
    return `${BASE}/patients/${patientId}/export/csv${qs}`;
  },

  /** Download CSV file directly as blob. */
  async downloadCsv(patientId: string, includeUnreviewed = false): Promise<{ blob: Blob; filename: string }> {
    const qs = includeUnreviewed ? '?include_unreviewed=true' : '';
    const res = await fetch(`${BASE}/patients/${patientId}/export/csv${qs}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Export failed: ${res.status} ${res.statusText}`);
    }
    const blob = await res.blob();
    const dispo = res.headers.get('content-disposition');
    let filename = 'timeline.csv';
    if (dispo) {
      const match = dispo.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    return { blob, filename };
  },

  /** Get PDF download URL with appropriate filter parameter. */
  getPdfExportUrl(patientId: string, includeUnreviewed = false): string {
    const qs = includeUnreviewed ? '?include_unreviewed=true' : '';
    return `${BASE}/patients/${patientId}/export/pdf${qs}`;
  },

  /** Download PDF file directly as blob. */
  async downloadPdf(patientId: string, includeUnreviewed = false): Promise<{ blob: Blob; filename: string }> {
    const qs = includeUnreviewed ? '?include_unreviewed=true' : '';
    const res = await fetch(`${BASE}/patients/${patientId}/export/pdf${qs}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`PDF Export failed: ${res.status} ${res.statusText}`);
    }
    const blob = await res.blob();
    const dispo = res.headers.get('content-disposition');
    let filename = 'timeline.pdf';
    if (dispo) {
      const match = dispo.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    return { blob, filename };
  },
};

export interface ResetSummaryResponse {
  status: string;
  patients_deleted: number;
  reports_deleted: number;
  results_deleted: number;
  files_deleted: number;
  message: string;
}

export interface AuditEventItem {
  id: string;
  patient_id: string | null;
  event_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: string;
}

export interface AuditEventListResponse {
  items: AuditEventItem[];
  total: number;
}

export const systemApi = {
  /** Execute 'Delete Everything' cascade to permanently erase all records and files. */
  reset(confirm: string): Promise<ResetSummaryResponse> {
    return request<ResetSummaryResponse>('/system/reset', {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    });
  },

  /** Export complete workspace as a JSON backup archive. */
  exportArchive(patientId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/patients/${patientId}/export/archive`);
  },

  /** Restore workspace from JSON backup archive. */
  importArchive(archive: Record<string, unknown>): Promise<{ status: string; patient_id: string; patient_name: string }> {
    return request<{ status: string; patient_id: string; patient_name: string }>('/patients/import/archive', {
      method: 'POST',
      body: JSON.stringify(archive),
    });
  },
};

export const auditApi = {
  /** List non-clinical lifecycle audit events. */
  list(patientId?: string, eventType?: string): Promise<AuditEventListResponse> {
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);
    if (eventType) params.append('event_type', eventType);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<AuditEventListResponse>(`/audit-events${qs}`);
  },
};

// ---------------------------------------------------------------------------
// Auth API namespace
// ---------------------------------------------------------------------------

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

export const authApi = {
  async register(email: string, password: string, fullName?: string): Promise<UserResponse> {
    return request<UserResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName ?? null }),
    });
  },

  async login(email: string, password: string): Promise<AuthToken> {
    const token = await request<AuthToken>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(token.access_token);
    return token;
  },

  async me(): Promise<UserResponse> {
    return request<UserResponse>('/auth/me');
  },

  logout(): void {
    clearStoredToken();
  },
};

