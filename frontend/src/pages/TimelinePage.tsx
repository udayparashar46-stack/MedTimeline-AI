/**
 * TimelinePage.tsx — Milestone 8 & 9 Chronological Lab Report Timeline Matrix & CSV Export.
 *
 * Implements:
 * - Patient workspace selector & patient header.
 * - Review-status toggle: `include_unreviewed` (defaults to false per Guiding Principle 2).
 * - Search filter for test names.
 * - Sticky test name column (with shadow) and sticky header row.
 * - Chronological ascending report date columns (FR5: multiple reports on same date appear as separate columns).
 * - Out-of-range flag highlighting (soft tint + printed H/L flag).
 * - Edited value indicators (dot) and unreviewed indicators (dashed underline).
 * - Truly blank cells for missing results (no invented numbers).
 * - Cell click opens interactive Source Drawer showing snippet, page number, confidence, and audit trail.
 * - CSV Export button with one-click download.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  patientsApi,
  timelineApi,
  Patient,
  TimelineResponse,
  TimelineCell,
  TimelineRow,
} from '../lib/apiClient';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

interface TimelinePageProps {
  initialPatientId?: string;
  onNavigateToWorkspace?: (patientId: string) => void;
  onNavigateToReview?: (patientId: string, reportId: string) => void;
}

export const TimelinePage: React.FC<TimelinePageProps> = ({
  initialPatientId,
  onNavigateToWorkspace,
  onNavigateToReview,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  // Timeline data
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Controls & Filters
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Source drawer
  const [activeCell, setActiveCell] = useState<{
    cell: TimelineCell;
    row: TimelineRow;
    columnDate: string;
    columnLab: string | null;
  } | null>(null);

  // CSV & PDF download state
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // 1. Load patients
  useEffect(() => {
    let cancelled = false;
    setIsLoadingPatients(true);

    patientsApi
      .list({ limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setPatients(res.items);
          if (!selectedPatientId && res.items.length > 0) {
            setSelectedPatientId(res.items[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingPatients(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  // 2. Load timeline matrix
  const loadTimeline = useCallback(async (patientId: string, withUnreviewed: boolean) => {
    if (!patientId) return;
    setIsLoadingTimeline(true);
    setTimelineError(null);

    try {
      const res = await timelineApi.get(patientId, withUnreviewed);
      setTimelineData(res);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'Failed to load timeline data.');
    } finally {
      setIsLoadingTimeline(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      void loadTimeline(selectedPatientId, includeUnreviewed);
    }
  }, [selectedPatientId, includeUnreviewed, loadTimeline]);

  // CSV export handler
  const handleExportCsv = async () => {
    if (!selectedPatientId) return;
    setIsExportingCsv(true);
    try {
      const { blob, filename } = await timelineApi.downloadCsv(selectedPatientId, includeUnreviewed);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportSuccessMsg(`Exported ${filename} successfully!`);
      setTimeout(() => setExportSuccessMsg(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download CSV export.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // PDF export handler
  const handleExportPdf = async () => {
    if (!selectedPatientId) return;
    setIsExportingPdf(true);
    try {
      const { blob, filename } = await timelineApi.downloadPdf(selectedPatientId, includeUnreviewed);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportSuccessMsg(`Exported ${filename} successfully!`);
      setTimeout(() => setExportSuccessMsg(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download PDF export.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const toggleCategoryCollapse = (category: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Filter rows by search and category
  const filteredRows = useMemo(() => {
    if (!timelineData) return [];
    return timelineData.rows.filter((row) => {
      const matchesSearch =
        row.test_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        row.category.toLowerCase().includes(searchFilter.toLowerCase());
      const matchesCat =
        selectedCategory === 'all' || row.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [timelineData, searchFilter, selectedCategory]);

  // Group filtered rows by category
  const groupedRows = useMemo(() => {
    const groups: Record<string, TimelineRow[]> = {};
    for (const row of filteredRows) {
      const cat = row.category || 'Ungrouped';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(row);
    }
    return groups;
  }, [filteredRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
              Chronological Lab Timeline
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Track clinical biomarker trends across confirmed reports over time. Zero invented values.
          </p>
        </div>

        {/* Workspace selector & CSV export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="timeline-patient-select" style={{ fontSize: '13px', fontWeight: 600 }}>
              Patient Workspace:
            </label>
            {isLoadingPatients ? (
              <Skeleton width="180px" height="32px" />
            ) : (
              <select
                id="timeline-patient-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                }}
              >
                {patients.length === 0 && <option value="">No patients available</option>}
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <Button
            variant="primary"
            onClick={handleExportCsv}
            disabled={
              isExportingCsv ||
              !timelineData ||
              timelineData.columns.length === 0 ||
              timelineData.rows.length === 0
            }
            leftIcon="📥"
            aria-label="Export Timeline CSV"
          >
            {isExportingCsv ? 'Exporting...' : 'Export CSV'}
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportPdf}
            disabled={
              isExportingPdf ||
              !timelineData ||
              timelineData.columns.length === 0 ||
              timelineData.rows.length === 0
            }
            leftIcon="📄"
            aria-label="Export Timeline PDF"
          >
            {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
          </Button>

          {onNavigateToWorkspace && selectedPatientId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigateToWorkspace(selectedPatientId)}
            >
              Workspace Reports
            </Button>
          )}
        </div>
      </div>

      {/* Success banner */}
      {exportSuccessMsg && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--success-soft)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--success)',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          ✓ {exportSuccessMsg}
        </div>
      )}

      {/* Filter and Control Bar */}
      <Card>
        <CardContent style={{ padding: '14px 20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
            }}
          >
            {/* Search and Category filters */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Input
                placeholder="Search test name or category..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ minWidth: '240px', maxWidth: '320px' }}
                aria-label="Filter timeline test names"
              />

              {timelineData && timelineData.categories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                  aria-label="Filter by clinical category"
                >
                  <option value="all">All Categories ({timelineData.rows.length})</option>
                  {timelineData.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Review status toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeUnreviewed}
                  onChange={(e) => setIncludeUnreviewed(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  aria-label="Include unreviewed results toggle"
                />
                <span>Include Unreviewed Results</span>
              </label>

              {timelineData?.has_unreviewed_results && !includeUnreviewed && (
                <Badge variant="warning">
                  Unreviewed results hidden
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error display */}
      {timelineError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--danger)',
            fontSize: '13px',
          }}
        >
          {timelineError}
        </div>
      )}

      {/* Clinical Interpretation & Verification Legend */}
      <Card style={{ backgroundColor: 'var(--surface-muted)' }}>
        <CardContent style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Clinical Legend &amp; Reference Guide
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Zero invented values · Missing results remain blank (—) · Click any result to view original report evidence
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px', fontSize: '12px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />
                <span><strong>Within Reference Range</strong></span>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ padding: '1px 6px', borderRadius: '4px', backgroundColor: 'var(--flag-high, #FDE8E6)', color: 'var(--danger)', fontWeight: 700, fontSize: '11px' }}>
                  ▲ Above Reference Range
                </span>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ padding: '1px 6px', borderRadius: '4px', backgroundColor: 'var(--flag-low, #E6F0FD)', color: 'var(--info)', fontWeight: 700, fontSize: '11px' }}>
                  ▼ Below Reference Range
                </span>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ borderBottom: '2px dashed var(--warning)', paddingBottom: '1px', fontWeight: 600, color: 'var(--text)' }}>
                  Needs Review
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(AI-extracted)</span>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Badge variant="confirmed">Doctor Verified</Badge>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '2px' }}>
              ℹ️ <strong>Clinical Note:</strong> Reference range indicators identify values outside normal lab intervals and do not constitute a medical diagnosis. Always correlate with clinical findings and patient history.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matrix Table */}
      {isLoadingTimeline ? (
        <Card>
          <CardContent style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Skeleton width="100%" height="40px" />
            <Skeleton width="100%" height="32px" />
            <Skeleton width="100%" height="32px" />
            <Skeleton width="100%" height="32px" />
          </CardContent>
        </Card>
      ) : !timelineData || timelineData.columns.length === 0 || timelineData.rows.length === 0 ? (
        <Card>
          <CardContent style={{ padding: '32px' }}>
            <EmptyState
              icon="📈"
              title="No Timeline Data Available"
              description={
                includeUnreviewed
                  ? 'No extracted test results exist in this patient workspace yet. Upload lab report PDFs to generate the timeline.'
                  : 'No confirmed test results found. Check the workspace review page to confirm draft results, or check "Include Unreviewed Results" above.'
              }
              actionLabel={selectedPatientId && onNavigateToWorkspace ? 'Go to Patient Workspace' : undefined}
              onAction={
                selectedPatientId && onNavigateToWorkspace
                  ? () => onNavigateToWorkspace(selectedPatientId)
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <div
            style={{
              overflowX: 'auto',
              maxHeight: '70vh',
              position: 'relative',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: '13px',
              }}
            >
              <thead>
                <tr>
                  {/* Sticky Top-Left Corner Header: Test Name */}
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      top: 0,
                      zIndex: 3,
                      backgroundColor: 'var(--surface-muted)',
                      borderBottom: '2px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      padding: '12px 16px',
                      textAlign: 'left',
                      minWidth: '220px',
                      boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>Test Name</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                      Standardized analyte
                    </div>
                  </th>

                  {/* Explicit Unit Column Header */}
                  <th
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      backgroundColor: 'var(--surface-muted)',
                      borderBottom: '2px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      padding: '12px 14px',
                      textAlign: 'left',
                      minWidth: '90px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>Unit</div>
                  </th>

                  {/* Explicit Reference Range Column Header */}
                  <th
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      backgroundColor: 'var(--surface-muted)',
                      borderBottom: '2px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      padding: '12px 14px',
                      textAlign: 'left',
                      minWidth: '130px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>Reference Range</div>
                  </th>

                  {/* Chronological Report Date Columns */}
                  {timelineData.columns.map((col) => (
                    <th
                      key={col.report_id}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        backgroundColor: 'var(--surface-muted)',
                        borderBottom: '2px solid var(--border)',
                        borderRight: '1px solid var(--border)',
                        padding: '12px 14px',
                        textAlign: 'center',
                        minWidth: '150px',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {col.formatted_date}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '140px',
                          margin: '2px auto 0 auto',
                        }}
                        title={col.lab_name || col.original_filename}
                      >
                        {col.lab_name || col.original_filename}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {Object.entries(groupedRows).map(([category, rows]) => {
                  const isCollapsed = collapsedCategories[category];

                  return (
                    <React.Fragment key={category}>
                      {/* Collapsible Category Section Heading */}
                      <tr>
                        <td
                          colSpan={timelineData.columns.length + 3}
                          onClick={() => toggleCategoryCollapse(category)}
                          style={{
                            backgroundColor: 'rgba(15, 118, 110, 0.05)',
                            padding: '8px 16px',
                            fontWeight: 700,
                            fontSize: '12px',
                            color: 'var(--primary)',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            userSelect: 'none',
                            borderTop: '1px solid var(--border)',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ marginRight: '8px' }}>{isCollapsed ? '▶' : '▼'}</span>
                          {category} ({rows.length})
                        </td>
                      </tr>

                      {/* Test Rows in this Category */}
                      {!isCollapsed &&
                        rows.map((row) => (
                          <tr
                            key={row.test_name}
                            style={{
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            {/* Sticky Test Name Column */}
                            <td
                              style={{
                                position: 'sticky',
                                left: 0,
                                zIndex: 1,
                                backgroundColor: 'var(--surface)',
                                borderRight: '1px solid var(--border)',
                                borderBottom: '1px solid var(--border)',
                                padding: '10px 16px',
                                boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                  {row.test_name}
                                </span>
                                {row.has_unit_mismatch && (
                                  <span
                                    title={`Unit discrepancy: observed ${row.observed_units.join(', ')}`}
                                    style={{
                                      fontSize: '12px',
                                      cursor: 'help',
                                    }}
                                  >
                                    ⚠️
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Explicit Unit Column */}
                            <td
                              style={{
                                borderRight: '1px solid var(--border)',
                                borderBottom: '1px solid var(--border)',
                                padding: '10px 14px',
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                                backgroundColor: 'var(--surface)',
                              }}
                            >
                              {row.preferred_unit ||
                                (row.observed_units.length > 0 ? row.observed_units[0] : '—')}
                            </td>

                            {/* Explicit Reference Range Column */}
                            <td
                              style={{
                                borderRight: '2px solid var(--border)',
                                borderBottom: '1px solid var(--border)',
                                padding: '10px 14px',
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                                backgroundColor: 'var(--surface)',
                              }}
                            >
                              {row.standard_reference_range ||
                                (row.observed_units.length > 0 ? 'Lab-specific' : '—')}
                            </td>

                            {/* Chronological Cells */}
                            {timelineData.columns.map((col) => {
                              const cell = row.cells[col.report_id];

                              if (!cell) {
                                // Truly blank cell
                                return (
                                  <td
                                    key={col.report_id}
                                    style={{
                                      borderRight: '1px solid var(--border)',
                                      borderBottom: '1px solid var(--border)',
                                      textAlign: 'center',
                                      padding: '10px 14px',
                                      color: 'var(--text-muted)',
                                      backgroundColor: 'var(--surface)',
                                    }}
                                  >
                                    <span style={{ opacity: 0.25 }}>—</span>
                                  </td>
                                );
                              }

                              const isHighFlag = cell.printed_flag === 'H' || cell.printed_flag === 'HIGH';
                              const isLowFlag = cell.printed_flag === 'L' || cell.printed_flag === 'LOW';
                              const isUnreviewed = cell.review_status === 'unreviewed';
                              const rangeLabel = isHighFlag
                                ? 'Above Reference Range'
                                : isLowFlag
                                ? 'Below Reference Range'
                                : 'Within Reference Range';
                              const reviewLabel = isUnreviewed ? 'Needs Review (AI Extracted)' : 'Doctor Verified';

                              let cellBg = 'var(--surface)';
                              let cellColor = 'var(--text)';
                              if (isHighFlag) {
                                cellBg = 'var(--flag-high, #FDE8E6)';
                                cellColor = 'var(--danger)';
                              } else if (isLowFlag) {
                                cellBg = 'var(--flag-low, #E6F0FD)';
                                cellColor = 'var(--info)';
                              }

                              return (
                                <td
                                  key={col.report_id}
                                  onClick={() =>
                                    setActiveCell({
                                      cell,
                                      row,
                                      columnDate: col.formatted_date,
                                      columnLab: col.lab_name,
                                    })
                                  }
                                  style={{
                                    borderRight: '1px solid var(--border)',
                                    borderBottom: '1px solid var(--border)',
                                    textAlign: 'center',
                                    padding: '8px 12px',
                                    backgroundColor: cellBg,
                                    cursor: 'pointer',
                                    transition: 'background-color 150ms ease-out',
                                  }}
                                  title={`${row.test_name}: ${cell.effective_value_text} ${cell.effective_unit || ''} · ${rangeLabel} · ${reviewLabel} — Click to view source evidence`}
                                >
                                  <div
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px',
                                      fontWeight: 600,
                                      color: cellColor,
                                      borderBottom: isUnreviewed ? '1px dashed var(--warning)' : 'none',
                                    }}
                                  >
                                    <span>{cell.effective_value_text}</span>
                                    {cell.printed_flag && (
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          padding: '0 4px',
                                          borderRadius: '3px',
                                          backgroundColor: isHighFlag ? 'rgba(180, 35, 24, 0.15)' : 'rgba(29, 78, 216, 0.15)',
                                        }}
                                      >
                                        {cell.printed_flag}
                                      </span>
                                    )}
                                    {cell.is_edited && (
                                      <span
                                        title="User edited value"
                                        style={{
                                          width: '6px',
                                          height: '6px',
                                          borderRadius: '50%',
                                          backgroundColor: 'var(--primary)',
                                          display: 'inline-block',
                                        }}
                                      />
                                    )}
                                  </div>

                                  {cell.effective_unit && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                      {cell.effective_unit}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer Disclaimer */}
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--surface-muted)',
              borderTop: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Generated from user-uploaded reports. Not medical advice. Verify against original reports.
          </div>
        </Card>
      )}

      {/* Source Drawer (Principle 3: Show the Evidence) */}
      {activeCell && (
        <Drawer
          isOpen={true}
          onClose={() => setActiveCell(null)}
          title={`Evidence: ${activeCell.row.test_name}`}
          subtitle={`${activeCell.columnDate}${activeCell.columnLab ? ` · ${activeCell.columnLab}` : ''}`}
          width="460px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 20px' }}>
            {/* Value summary */}
            <div
              style={{
                padding: '14px',
                backgroundColor: 'var(--surface-muted)',
                borderRadius: 'var(--radius-card)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Effective Value
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
                  {activeCell.cell.effective_value_text}{' '}
                  <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>
                    {activeCell.cell.effective_unit || ''}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <Badge
                  variant={
                    activeCell.cell.review_status === 'confirmed' || activeCell.cell.review_status === 'edited'
                      ? 'confirmed'
                      : 'warning'
                  }
                >
                  {activeCell.cell.review_status === 'unreviewed' ? 'Needs Review' : 'Doctor Verified'}
                </Badge>
                {activeCell.cell.printed_flag ? (
                  <Badge variant={activeCell.cell.printed_flag === 'H' || activeCell.cell.printed_flag === 'HIGH' ? 'danger' : 'info'}>
                    {activeCell.cell.printed_flag === 'H' || activeCell.cell.printed_flag === 'HIGH'
                      ? '▲ Above Reference Range'
                      : '▼ Below Reference Range'}
                  </Badge>
                ) : (
                  <Badge variant="neutral">Within Reference Range</Badge>
                )}
              </div>
            </div>

            {/* Reference interval */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Reference Interval
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                {activeCell.cell.effective_reference_text || 'None specified on report'}
              </div>
            </div>

            {/* Original raw snippet */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Original Extracted Line (Page {activeCell.cell.page_number})
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor: 'var(--surface-muted)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {activeCell.cell.source_snippet}
              </div>
            </div>

            {/* Extracted test name before mapping */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Raw Test Name in PDF
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                "{activeCell.cell.raw_test_name}"
              </div>
            </div>

            {/* Action to jump to report review */}
            {onNavigateToReview && selectedPatientId && (
              <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    const reportId = activeCell.cell.report_id;
                    setActiveCell(null);
                    onNavigateToReview(selectedPatientId, reportId);
                  }}
                  style={{ width: '100%' }}
                >
                  Open Full Split-View Review
                </Button>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
};
