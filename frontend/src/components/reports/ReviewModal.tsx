import React, { useEffect, useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Report,
  reportsApi,
  resultsApi,
  ExtractedResult,
  ReportResultsSummary,
  ManualResultCreate,
  ResultUpdate,
} from '../../lib/apiClient';

interface ReviewModalProps {
  report: Report;
  isOpen: boolean;
  onClose: () => void;
  onReportUpdated?: (updated: Report) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  report: initialReport,
  isOpen,
  onClose,
  onReportUpdated,
}) => {
  const [report, setReport] = useState<Report>(initialReport);
  const [results, setResults] = useState<ExtractedResult[]>([]);
  const [summary, setSummary] = useState<ReportResultsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [activePage, setActivePage] = useState<number>(1);

  // Row inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    test_name: string;
    value_text: string;
    unit: string;
    reference_text: string;
    printed_flag: string;
  }>({
    test_name: '',
    value_text: '',
    unit: '',
    reference_text: '',
    printed_flag: '',
  });

  // Manual row add state
  const [showAddRow, setShowAddRow] = useState(false);
  const [addRowForm, setAddRowForm] = useState<ManualResultCreate>({
    page_number: 1,
    test_name: '',
    value_text: '',
    unit: '',
    reference_text: '',
    printed_flag: '',
    section_heading: '',
  });

  // Date inline confirmation state
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateInputValue, setDateInputValue] = useState(report.report_date || '');

  // Audit history modal/popover state
  const [activeAuditResult, setActiveAuditResult] = useState<ExtractedResult | null>(null);

  // Authenticated PDF streaming state
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);

  // Load authenticated PDF as blob to guarantee preview rendering with auth headers
  useEffect(() => {
    if (!isOpen || !report?.id) return;

    let cancelled = false;
    let createdUrl: string | null = null;
    setIsPdfLoading(true);
    setPdfLoadError(null);

    reportsApi
      .fetchReportBlob(report.id)
      .then((blob) => {
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          createdUrl = url;
          setPdfBlobUrl(url);
          setIsPdfLoading(false);
        }
      })
      .catch((_err) => {
        if (!cancelled) {
          // If blob fetch failed, fall back to token query parameter URL
          const fallback = reportsApi.getPdfUrl(report.id);
          setPdfBlobUrl(fallback);
          setIsPdfLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isOpen, report?.id]);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setReport(initialReport);
    setDateInputValue(initialReport.report_date || '');
    setIsEditingDate(false);
    setEditingId(null);
    setShowAddRow(false);
    setError(null);
    setSuccessMsg(null);
    setActivePage(1);

    let cancelled = false;
    setIsLoading(true);

    reportsApi
      .getResults(initialReport.id)
      .then((res) => {
        if (!cancelled) {
          setResults(res.results);
          setSummary(res.summary);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load test results.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialReport]);

  // Recalculate summary locally when results change
  const refreshSummaryCounts = (updatedResults: ExtractedResult[]) => {
    setResults(updatedResults);
    setSummary((prev) => ({
      total_rows: updatedResults.length,
      needs_review_count: updatedResults.filter((r) => r.review_status === 'unreviewed').length,
      high_confidence_count: updatedResults.filter((r) => r.parse_confidence === 'high').length,
      medium_confidence_count: updatedResults.filter((r) => r.parse_confidence === 'medium').length,
      low_confidence_count: updatedResults.filter((r) => r.parse_confidence === 'low').length,
      skipped_lines_count: prev?.skipped_lines_count || 0,
      layout_strategy: prev?.layout_strategy || 'line_layout',
    }));
  };

  const filteredResults = useMemo(() => {
    if (!filterText.trim()) return results;
    const term = filterText.toLowerCase();
    return results.filter(
      (r) =>
        r.effective_test_name.toLowerCase().includes(term) ||
        r.effective_value_text.toLowerCase().includes(term) ||
        r.raw_test_name.toLowerCase().includes(term) ||
        r.raw_value_text.toLowerCase().includes(term) ||
        (r.section_heading && r.section_heading.toLowerCase().includes(term)) ||
        (r.effective_unit && r.effective_unit.toLowerCase().includes(term))
    );
  }, [results, filterText]);

  // Handle clicking a row -> jump PDF to row's page
  const handleSelectRow = (r: ExtractedResult) => {
    if (r.page_number && r.page_number !== activePage) {
      setActivePage(r.page_number);
    }
  };

  // Start inline edit
  const handleStartEdit = (r: ExtractedResult) => {
    setEditingId(r.id);
    setEditForm({
      test_name: r.effective_test_name,
      value_text: r.effective_value_text,
      unit: r.effective_unit || '',
      reference_text: r.effective_reference_text || '',
      printed_flag: r.effective_printed_flag || '',
    });
    setError(null);
  };

  // Save inline edit
  const handleSaveEdit = async (resultId: string) => {
    if (!editForm.test_name.trim() || !editForm.value_text.trim()) {
      setError('Test name and result value cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload: ResultUpdate = {
        test_name: editForm.test_name.trim(),
        value_text: editForm.value_text.trim(),
        unit: editForm.unit.trim() || undefined,
        reference_text: editForm.reference_text.trim() || undefined,
        printed_flag: editForm.printed_flag.trim() || undefined,
        review_status: 'edited',
      };
      const updated = await resultsApi.update(resultId, payload);
      const nextResults = results.map((r) => (r.id === updated.id ? updated : r));
      refreshSummaryCounts(nextResults);
      setEditingId(null);
      setSuccessMsg('Row updated and audit record saved.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save edits.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm row
  const handleConfirmRow = async (resultId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await resultsApi.update(resultId, { review_status: 'confirmed' });
      const nextResults = results.map((r) => (r.id === updated.id ? updated : r));
      refreshSummaryCounts(nextResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm row.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject row
  const handleRejectRow = async (resultId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await resultsApi.update(resultId, { review_status: 'rejected' });
      const nextResults = results.map((r) => (r.id === updated.id ? updated : r));
      refreshSummaryCounts(nextResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject row.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Undo last edit
  const handleUndo = async (resultId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await resultsApi.undo(resultId);
      const nextResults = results.map((r) => (r.id === updated.id ? updated : r));
      refreshSummaryCounts(nextResults);
      setSuccessMsg('Previous edit undone.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo edit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bulk confirm high confidence
  const handleBulkConfirmHighConfidence = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const resp = await resultsApi.bulkConfirm({
        report_id: report.id,
        confidence: 'high',
      });
      const updatedMap = new Map(resp.results.map((r) => [r.id, r]));
      const nextResults = results.map((r) => updatedMap.get(r.id) || r);
      refreshSummaryCounts(nextResults);
      setSuccessMsg(`Bulk confirmed ${resp.confirmed_count} high-confidence rows.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk confirm failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add manual row
  const handleAddManualRow = async () => {
    if (!addRowForm.test_name.trim() || !addRowForm.value_text.trim()) {
      setError('Test name and value are required to add a row.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await reportsApi.addManualResult(report.id, {
        page_number: addRowForm.page_number || 1,
        test_name: addRowForm.test_name.trim(),
        value_text: addRowForm.value_text.trim(),
        unit: addRowForm.unit?.trim() || null,
        reference_text: addRowForm.reference_text?.trim() || null,
        printed_flag: addRowForm.printed_flag?.trim() || null,
        section_heading: addRowForm.section_heading?.trim() || null,
      });
      const nextResults = [...results, created];
      refreshSummaryCounts(nextResults);
      setShowAddRow(false);
      setAddRowForm({
        page_number: 1,
        test_name: '',
        value_text: '',
        unit: '',
        reference_text: '',
        printed_flag: '',
        section_heading: '',
      });
      setSuccessMsg('Manual row added successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add manual row.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm report date
  const handleConfirmReportDate = async () => {
    if (!dateInputValue.trim()) {
      setError('Please provide a valid report date before confirming.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await reportsApi.update(report.id, {
        report_date: dateInputValue.trim(),
        report_date_confirmed: true,
      });
      setReport(updated);
      setIsEditingDate(false);
      onReportUpdated?.(updated);
      setSuccessMsg('Report collection date confirmed.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm report date.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark report as reviewed (gated by date confirmation)
  const handleMarkAsReviewed = async () => {
    if (!report.report_date_confirmed) {
      setError('Cannot mark report as reviewed: report collection date must be confirmed first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await reportsApi.update(report.id, { status: 'reviewed' });
      setReport(updated);
      onReportUpdated?.(updated);
      setSuccessMsg('Report marked as fully reviewed!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pdfSrc = pdfBlobUrl
    ? `${pdfBlobUrl}#page=${activePage}`
    : `${reportsApi.getPdfUrl(report.id)}#page=${activePage}`;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge variant="confirmed">✓ Doctor Verified</Badge>;
      case 'edited':
        return <Badge variant="edited">✏️ Doctor Edited</Badge>;
      case 'rejected':
        return <Badge variant="danger">✕ Rejected</Badge>;
      case 'manual':
        return <Badge variant="info">✚ Manual Entry</Badge>;
      case 'unreviewed':
      default:
        return <Badge variant="warning">Needs Review</Badge>;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="success">High</Badge>;
      case 'medium':
        return <Badge variant="warning">Medium</Badge>;
      case 'low':
        return <Badge variant="danger">Low</Badge>;
      default:
        return <Badge variant="neutral">{confidence}</Badge>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Review & Correct — ${report.original_filename}`}
      maxWidth="95vw"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '82vh' }}>
        {/* Top Header / Metadata & Gating Banner */}
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--surface-muted)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Date info & confirmation gating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              Collection Date:
            </span>
            {isEditingDate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Input
                  type="date"
                  value={dateInputValue}
                  onChange={(e) => setDateInputValue(e.target.value)}
                  style={{ padding: '2px 8px', fontSize: '12px', width: '150px' }}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleConfirmReportDate}
                  disabled={isSubmitting}
                >
                  Save &amp; Confirm
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsEditingDate(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  {report.report_date || 'No Date Detected'}
                </span>
                {report.report_date_confirmed ? (
                  <Badge variant="confirmed">✓ Confirmed</Badge>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Badge variant="warning">⚠️ Unconfirmed</Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (report.report_date) {
                          handleConfirmReportDate();
                        } else {
                          setIsEditingDate(true);
                        }
                      }}
                      disabled={isSubmitting}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      {report.report_date ? 'Confirm Date' : 'Set Date'}
                    </Button>
                  </div>
                )}
                {!report.report_date_confirmed && (
                  <button
                    onClick={() => setIsEditingDate(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            {report.lab_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Laboratory:</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                  🏥 {report.lab_name}
                </span>
              </div>
            )}
          </div>

          {/* Report status & Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
              <Badge variant={report.status === 'reviewed' ? 'confirmed' : 'warning'}>
                {report.status === 'reviewed' ? 'Reviewed' : 'Needs Review'}
              </Badge>
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleBulkConfirmHighConfidence}
              disabled={
                isSubmitting ||
                !summary ||
                summary.high_confidence_count === 0 ||
                results.filter((r) => r.parse_confidence === 'high' && r.review_status === 'unreviewed').length === 0
              }
              title="Confirm all unreviewed rows that have high parser confidence"
            >
              ✓ Bulk Confirm High Confidence
            </Button>

            <Button
              size="sm"
              variant={report.status === 'reviewed' ? 'secondary' : 'primary'}
              onClick={handleMarkAsReviewed}
              disabled={isSubmitting || !report.report_date_confirmed}
              title={
                !report.report_date_confirmed
                  ? 'Confirm report collection date before marking as reviewed'
                  : 'Mark report as reviewed'
              }
            >
              {report.status === 'reviewed' ? '✓ Report Reviewed' : 'Mark as Reviewed'}
            </Button>
          </div>
        </div>

        {/* Alerts & Notifications */}
        {report.failure_reason && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: report.failure_reason.includes('Cross-Patient') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${report.failure_reason.includes('Cross-Patient') ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.25)'}`,
              color: report.failure_reason.includes('Cross-Patient') ? '#b91c1c' : '#92400e',
              borderRadius: 'var(--radius-card)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{report.failure_reason.includes('Cross-Patient') ? '🚨' : 'ℹ️'}</span>
            <span>{report.failure_reason}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--danger-soft)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-card)',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--success-soft)',
              color: 'var(--success)',
              borderRadius: 'var(--radius-card)',
              fontSize: '13px',
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Main Split-Screen Workspace (PDF Left, Rows Right) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(400px, 48%) minmax(500px, 52%)',
            gap: '16px',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Left Panel: PDF Viewer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--surface-muted)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--surface)',
              }}
            >
              <span>
                <strong>Original Document</strong> ({report.page_count} page
                {report.page_count !== 1 ? 's' : ''})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Viewing Page:</span>
                <select
                  value={activePage}
                  onChange={(e) => setActivePage(Number(e.target.value))}
                  style={{
                    padding: '2px 6px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                >
                  {Array.from({ length: report.page_count || 1 }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>
                      Page {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {isPdfLoading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  Loading document preview...
                </div>
              )}
              {pdfLoadError && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    padding: '16px',
                    textAlign: 'center',
                    color: 'var(--danger)',
                    fontSize: '13px',
                    gap: '8px',
                  }}
                >
                  <span>⚠️ {pdfLoadError}</span>
                  <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                    Refresh Session
                  </Button>
                </div>
              )}
              {pdfSrc && !pdfLoadError && (
                <iframe
                  key={`${report.id}-p${activePage}`}
                  src={pdfSrc}
                  title="Original PDF Report"
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: isPdfLoading ? 'none' : 'block',
                  }}
                  onLoad={() => setIsPdfLoading(false)}
                />
              )}
            </div>
          </div>

          {/* Right Panel: Extracted Results Table & Review Controls */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minHeight: 0,
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border)',
              padding: '12px',
            }}
          >
            {/* Summary & Toolbar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {summary?.total_rows || results.length} Tests
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--warning-soft)',
                    color: 'var(--warning)',
                    fontWeight: 600,
                  }}
                >
                  {summary?.needs_review_count ?? 0} Unreviewed
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--success-soft)',
                    color: 'var(--success)',
                    fontWeight: 600,
                  }}
                >
                  {results.filter((r) => r.review_status === 'confirmed').length} Confirmed
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Input
                  placeholder="Filter tests..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  style={{ width: '160px', padding: '4px 8px', fontSize: '12px' }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowAddRow(!showAddRow)}
                  style={{ fontSize: '12px' }}
                >
                  {showAddRow ? '✕ Cancel' : '✚ Add Row'}
                </Button>
              </div>
            </div>

            {/* Manual Add Row Form */}
            {showAddRow && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--surface-muted)',
                  border: '1px dashed var(--primary)',
                  borderRadius: 'var(--radius-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>
                  Add Clinical Test Row Manually
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <Input
                    placeholder="Test Name (e.g. Hemoglobin)*"
                    value={addRowForm.test_name}
                    onChange={(e) => setAddRowForm({ ...addRowForm, test_name: e.target.value })}
                    style={{ fontSize: '12px' }}
                  />
                  <Input
                    placeholder="Observed Value (e.g. 14.2)*"
                    value={addRowForm.value_text}
                    onChange={(e) => setAddRowForm({ ...addRowForm, value_text: e.target.value })}
                    style={{ fontSize: '12px' }}
                  />
                  <Input
                    placeholder="Unit (e.g. g/dL)"
                    value={addRowForm.unit || ''}
                    onChange={(e) => setAddRowForm({ ...addRowForm, unit: e.target.value })}
                    style={{ fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '6px' }}>
                  <Input
                    placeholder="Reference Range (e.g. 12.0 - 16.0)"
                    value={addRowForm.reference_text || ''}
                    onChange={(e) => setAddRowForm({ ...addRowForm, reference_text: e.target.value })}
                    style={{ fontSize: '12px' }}
                  />
                  <Input
                    placeholder="Printed Flag (e.g. H or L)"
                    value={addRowForm.printed_flag || ''}
                    onChange={(e) => setAddRowForm({ ...addRowForm, printed_flag: e.target.value })}
                    style={{ fontSize: '12px' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleAddManualRow}
                      disabled={isSubmitting}
                    >
                      Save Row
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Scrollable Results Table */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              {isLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading parsed test rows...
                </div>
              ) : filteredResults.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No test results found matching filter.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--surface-muted)',
                        borderBottom: '1px solid var(--border)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                      }}
                    >
                      <th style={{ padding: '6px 8px', textAlign: 'left', width: '36px' }}>Pg</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Test Name</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Value</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Unit</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Ref Range</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '40px' }}>Flag</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center' }}>Confidence</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r, idx) => {
                      const isEditing = editingId === r.id;
                      const hasEdits = r.has_edits;
                      const isRowSelected = r.page_number === activePage;

                      return (
                        <tr
                          key={r.id}
                          onClick={() => handleSelectRow(r)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: isEditing
                              ? 'var(--surface-muted)'
                              : isRowSelected
                              ? 'rgba(37, 99, 235, 0.04)'
                              : idx % 2 === 0
                              ? 'var(--surface)'
                              : 'var(--bg)',
                            cursor: 'pointer',
                          }}
                        >
                          {/* Page # */}
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                            p.{r.page_number}
                          </td>

                          {/* Test Name */}
                          <td style={{ padding: '6px 8px' }}>
                            {isEditing ? (
                              <Input
                                value={editForm.test_name}
                                onChange={(e) => setEditForm({ ...editForm, test_name: e.target.value })}
                                style={{ fontSize: '12px', padding: '2px 6px' }}
                              />
                            ) : (
                              <div>
                                <span
                                  style={{ fontWeight: 600, color: 'var(--text)' }}
                                  title={
                                    hasEdits && r.raw_test_name !== r.effective_test_name
                                      ? `Original: "${r.raw_test_name}"`
                                      : undefined
                                  }
                                >
                                  {r.effective_test_name}
                                </span>
                                {r.canonical_name && (
                                  <span
                                    style={{
                                      marginLeft: '6px',
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--surface-muted)',
                                      color: 'var(--primary)',
                                      fontWeight: 500,
                                    }}
                                    title={`Mapped to canonical test: ${r.canonical_name}`}
                                  >
                                    🏷️ {r.canonical_name}
                                  </span>
                                )}
                                {hasEdits && r.raw_test_name !== r.effective_test_name && (
                                  <span
                                    style={{
                                      marginLeft: '4px',
                                      fontSize: '10px',
                                      color: 'var(--text-muted)',
                                      cursor: 'help',
                                    }}
                                    title={`Raw PDF text: "${r.raw_test_name}"`}
                                  >
                                    (✏️ raw: {r.raw_test_name})
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Observed Value */}
                          <td style={{ padding: '6px 8px' }}>
                            {isEditing ? (
                              <Input
                                value={editForm.value_text}
                                onChange={(e) => setEditForm({ ...editForm, value_text: e.target.value })}
                                style={{ fontSize: '12px', padding: '2px 6px', width: '80px' }}
                              />
                            ) : (
                              <div>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: r.effective_printed_flag
                                      ? r.effective_printed_flag.includes('H')
                                        ? 'var(--danger)'
                                        : 'var(--warning)'
                                      : 'var(--text)',
                                  }}
                                  title={
                                    hasEdits && r.raw_value_text !== r.effective_value_text
                                      ? `Original raw value: "${r.raw_value_text}"`
                                      : undefined
                                  }
                                >
                                  {r.effective_value_text}
                                </span>
                                {hasEdits && r.raw_value_text !== r.effective_value_text && (
                                  <span
                                    style={{
                                      marginLeft: '4px',
                                      fontSize: '10px',
                                      color: 'var(--text-muted)',
                                      cursor: 'help',
                                    }}
                                    title={`Raw PDF value: "${r.raw_value_text}"`}
                                  >
                                    (raw: {r.raw_value_text})
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Unit */}
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                            {isEditing ? (
                              <Input
                                value={editForm.unit}
                                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                                style={{ fontSize: '12px', padding: '2px 6px', width: '70px' }}
                              />
                            ) : (
                              r.effective_unit || '—'
                            )}
                          </td>

                          {/* Ref Range */}
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                            {isEditing ? (
                              <Input
                                value={editForm.reference_text}
                                onChange={(e) => setEditForm({ ...editForm, reference_text: e.target.value })}
                                style={{ fontSize: '12px', padding: '2px 6px', width: '90px' }}
                              />
                            ) : (
                              r.effective_reference_text || '—'
                            )}
                          </td>

                          {/* Printed Flag */}
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {isEditing ? (
                              <Input
                                value={editForm.printed_flag}
                                onChange={(e) => setEditForm({ ...editForm, printed_flag: e.target.value })}
                                style={{ fontSize: '12px', padding: '2px 4px', width: '40px', textAlign: 'center' }}
                              />
                            ) : r.effective_printed_flag ? (
                              <span
                                style={{
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  backgroundColor: r.effective_printed_flag.includes('H')
                                    ? 'var(--danger-soft)'
                                    : 'var(--warning-soft)',
                                  color: r.effective_printed_flag.includes('H')
                                    ? 'var(--danger)'
                                    : 'var(--warning)',
                                }}
                              >
                                {r.effective_printed_flag}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Parse Confidence */}
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {getConfidenceBadge(r.parse_confidence)}
                          </td>

                          {/* Review Status */}
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {getStatusBadge(r.review_status)}
                          </td>

                          {/* Row Actions */}
                          <td style={{ padding: '6px 8px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleSaveEdit(r.id)}
                                  disabled={isSubmitting}
                                  style={{ fontSize: '11px', padding: '2px 6px' }}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingId(null)}
                                  style={{ fontSize: '11px', padding: '2px 6px' }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                {r.review_status !== 'confirmed' && (
                                  <button
                                    onClick={() => handleConfirmRow(r.id)}
                                    title="Confirm this test result"
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '11px',
                                      backgroundColor: 'var(--success-soft)',
                                      color: 'var(--success)',
                                      border: '1px solid var(--success)',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ✓
                                  </button>
                                )}
                                {r.review_status !== 'rejected' && (
                                  <button
                                    onClick={() => handleRejectRow(r.id)}
                                    title="Reject this test result"
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '11px',
                                      backgroundColor: 'var(--danger-soft)',
                                      color: 'var(--danger)',
                                      border: '1px solid var(--danger)',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                                <button
                                  onClick={() => handleStartEdit(r)}
                                  title="Edit test name, value, unit, or range"
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    backgroundColor: 'var(--surface-muted)',
                                    color: 'var(--text)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  ✏️
                                </button>
                                {hasEdits && (
                                  <button
                                    onClick={() => handleUndo(r.id)}
                                    title="Undo most recent edit"
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '11px',
                                      backgroundColor: 'var(--warning-soft)',
                                      color: 'var(--warning)',
                                      border: '1px solid var(--warning)',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ↺ Undo
                                  </button>
                                )}
                                {hasEdits && (
                                  <button
                                    onClick={() => setActiveAuditResult(r)}
                                    title="View audit history"
                                    style={{
                                      padding: '2px 4px',
                                      fontSize: '10px',
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    📜
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Audit Log Modal / Popover */}
        {activeAuditResult && (
          <Modal
            isOpen={true}
            onClose={() => setActiveAuditResult(null)}
            title={`Audit History — ${activeAuditResult.effective_test_name}`}
            maxWidth="500px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ color: 'var(--text-muted)' }}>
                Original Raw Value: <strong>{activeAuditResult.raw_value_text}</strong> ({activeAuditResult.raw_test_name})
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <strong>Edit Log ({activeAuditResult.edits.length} entries):</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {activeAuditResult.edits.map((e, idx) => (
                    <div
                      key={e.id || idx}
                      style={{
                        padding: '6px 8px',
                        backgroundColor: 'var(--surface-muted)',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      <div>
                        <strong>{e.field}</strong> changed from{' '}
                        <code style={{ color: 'var(--danger)' }}>{e.old_value ?? 'none'}</code> to{' '}
                        <code style={{ color: 'var(--success)' }}>{e.new_value ?? 'none'}</code>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        by {e.edited_by || 'user'} at {new Date(e.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <Button variant="secondary" size="sm" onClick={() => setActiveAuditResult(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '8px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            💡 Click on any test row to view its location in the PDF document on the left.
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
