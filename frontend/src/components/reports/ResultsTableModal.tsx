import React, { useEffect, useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Report,
  reportsApi,
  ExtractedResult,
  ReportResultsSummary,
} from '../../lib/apiClient';

interface ResultsTableModalProps {
  report: Report;
  isOpen: boolean;
  onClose: () => void;
}

export const ResultsTableModal: React.FC<ResultsTableModalProps> = ({
  report,
  isOpen,
  onClose,
}) => {
  const [results, setResults] = useState<ExtractedResult[]>([]);
  const [summary, setSummary] = useState<ReportResultsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    reportsApi
      .getResults(report.id)
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
  }, [isOpen, report.id]);

  const filteredResults = useMemo(() => {
    if (!filterText.trim()) return results;
    const term = filterText.toLowerCase();
    return results.filter(
      (r) =>
        r.raw_test_name.toLowerCase().includes(term) ||
        r.raw_value_text.toLowerCase().includes(term) ||
        (r.section_heading && r.section_heading.toLowerCase().includes(term)) ||
        (r.raw_unit && r.raw_unit.toLowerCase().includes(term))
    );
  }, [results, filterText]);

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="success">High Confidence</Badge>;
      case 'medium':
        return <Badge variant="warning">Medium Confidence</Badge>;
      case 'low':
        return <Badge variant="danger">Low Confidence</Badge>;
      default:
        return <Badge variant="neutral">{confidence}</Badge>;
    }
  };

  const getFlagBadge = (flag: string | null) => {
    if (!flag) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const isHigh = flag.toUpperCase().includes('H');
    const isLow = flag.toUpperCase().includes('L');
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 6px',
          borderRadius: '4px',
          fontWeight: 700,
          fontSize: '11px',
          backgroundColor: isHigh
            ? 'var(--danger-soft)'
            : isLow
            ? 'var(--warning-soft)'
            : 'var(--surface-muted)',
          color: isHigh
            ? 'var(--danger)'
            : isLow
            ? 'var(--warning)'
            : 'var(--text)',
        }}
      >
        {flag}
      </span>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Extracted Test Results — ${report.original_filename}`}
      maxWidth="880px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Loading State */}
        {isLoading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Loading extracted test rows...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--danger-soft)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-card)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {/* Summary Card */}
        {!isLoading && summary && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-card)',
              backgroundColor: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                {summary.total_rows} row{summary.total_rows !== 1 ? 's' : ''} found,{' '}
                <span style={{ color: 'var(--primary)' }}>
                  {summary.needs_review_count} need review
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--success-soft)',
                    color: 'var(--success)',
                    fontWeight: 600,
                  }}
                >
                  ✓ {summary.high_confidence_count} High
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--warning-soft)',
                    color: 'var(--warning)',
                    fontWeight: 600,
                  }}
                >
                  ⚠ {summary.medium_confidence_count} Medium
                </span>
                {summary.low_confidence_count > 0 && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backgroundColor: 'var(--danger-soft)',
                      color: 'var(--danger)',
                      fontWeight: 600,
                    }}
                  >
                    ! {summary.low_confidence_count} Low
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Strategy: <strong>{summary.layout_strategy || 'line_layout'}</strong></span>
              {report.report_date && (
                <span>Report Date: <strong>{report.report_date}</strong></span>
              )}
            </div>
          </div>
        )}

        {/* Filter and Content */}
        {!isLoading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ maxWidth: '300px' }}>
              <Input
                placeholder="Filter tests by name or value..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>

            <div
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
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
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Test Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Observed Value</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Unit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Reference Interval</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Flag</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, idx) => (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      }}
                    >
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                        {r.row_order + 1}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>
                        <div>{r.raw_test_name}</div>
                        {r.section_heading && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                            {r.section_heading}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                        <span
                          style={{
                            color: r.printed_flag
                              ? r.printed_flag.includes('H')
                                ? 'var(--danger)'
                                : 'var(--warning)'
                              : 'var(--text)',
                          }}
                        >
                          {r.raw_value_text}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                        {r.raw_unit || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                        {r.raw_reference_text || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {getFlagBadge(r.printed_flag)}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {getConfidenceBadge(r.parse_confidence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && results.length === 0 && !error && (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--surface-muted)',
              borderRadius: 'var(--radius-card)',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
            <p style={{ fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              No structured test results found
            </p>
            <p style={{ fontSize: '13px', margin: '6px 0 0' }}>
              {!report.has_text_layer
                ? 'This report appears to be a scanned image or photo without selectable text. OCR is not supported.'
                : 'No clinical test rows could be detected in this report.'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
